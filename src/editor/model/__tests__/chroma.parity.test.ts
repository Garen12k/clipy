import { readFileSync } from "fs";
import { join } from "path";
import { BLEND_IDS, CHROMA } from "../types";
import { ALPHA_VECTORS, HEX_VECTORS, HSV_VECTORS, HUE_DISTANCE_VECTORS } from "./chroma.vectors";

/**
 * Green screen, layer blend modes and blur / mosaic boxes in the native export (group E round 2). The Swift is never
 * compiled here, so these checks pin the pieces that must stay in step with the TypeScript: the constants, the
 * vectors, the request records and the order of the compositor's steps.
 */
const iosDir = join(__dirname, "../../../../modules/clipy-video/ios");
/** Line endings normalised, so the checks do not depend on how git checked the files out. */
const read = (file: string) => readFileSync(join(iosDir, file), "utf8").replace(/\r\n/g, "\n");
/** Swift source without its comments, so a name in a comment never satisfies a check. */
const code = (source: string) => source.replace(/\/\/[^\n]*/g, "");
const swift = read("Chroma.swift");
const table = read("Tests/ChromaTests.swift");
const renderer = read("EffectRenderer.swift");
const session = read("ExportSession.swift");
const compositor = read("ClipyCompositor.swift");
const prePass = read("MediaPrePass.swift");
const wrapper = readFileSync(join(iosDir, "../index.ts"), "utf8").replace(/\r\n/g, "\n");

/** Numbers are written in Swift exactly as JS prints them; the two non-finite inputs are Swift's `.nan` / `.infinity`. */
const fmt = (n: number) => (Number.isNaN(n) ? ".nan" : n === Infinity ? ".infinity" : n === -Infinity ? "-.infinity" : String(n));
const between = (source: string, from: string, to: string): string => {
  const start = source.indexOf(from);
  if (start < 0) throw new Error(`"${from}" not found`);
  const end = source.indexOf(to, start + from.length);
  return source.slice(start, end < 0 ? undefined : end);
};
const inOrder = (text: string, parts: string[]) => {
  const at = parts.map((s) => text.indexOf(s));
  expect(at.every((i) => i >= 0)).toBe(true);
  expect([...at].sort((a, b) => a - b)).toEqual(at);
};
const recordFields = (name: string): string[] =>
  [...between(session, `struct ${name}: Record {`, "\n}").matchAll(/@Field var (\w+)/g)].map((m) => m[1]);

describe("Chroma.swift mirrors chroma.ts", () => {
  const all = code(swift);
  it("declares exactly the CHROMA constants, with the same values", () => {
    const constants = Object.fromEntries(
      [...swift.matchAll(/static let (\w+): (?:Double|Int) = (-?[0-9.]+)/g)].map((m) => [m[1], Number(m[2])]),
    );
    expect(constants).toEqual({ ...CHROMA });
    expect(swift).toMatch(/static let cube: Int = /);
  });
  it("has every function of chroma.ts, plus the cube builder and the filter", () => {
    for (const fn of ["unit", "rgbToHsv", "hexToRgb", "hueDistance", "alpha", "cubeData", "apply"]) {
      expect(all).toMatch(new RegExp(`static func ${fn}\\(`));
    }
    // No constant shares its base name with a function (Swift rejects `static let x` next to `static func x(...)`).
    const lets = [...all.matchAll(/static (?:let|var) (\w+)/g)].map((m) => m[1]);
    const funcs = [...all.matchAll(/static func (\w+)\(/g)].map((m) => m[1]);
    expect(lets.filter((n) => funcs.includes(n))).toEqual([]);
  });
  it("clamps like `unit`: a non-finite number counts as 0", () => {
    const body = between(all, "static func unit(", "\n  }\n");
    inOrder(body, ["if !v.isFinite { return 0 }", "return min(1, max(0, v))"]);
  });
  it("converts to HSV with the same expressions, wrap-around guard included", () => {
    const body = between(all, "static func rgbToHsv(", "\n  }\n");
    inOrder(body, [
      "unit(r)", "unit(g)", "unit(b)", "let delta = ", "? 0 : delta / ", "if delta > 0 {",
      "h = 60 * ((green - blue) / delta)", "h = 60 * ((blue - red) / delta + 2)", "h = 60 * ((red - green) / delta + 4)",
      "if h < 0 { h = h + 360 }", "if h >= 360 { h = h - 360 }",
    ]);
  });
  it("measures the hue distance the short way round", () => {
    const body = between(all, "static func hueDistance(", "\n  }\n");
    expect(body).toMatch(/abs\(a - b\)\.truncatingRemainder\(dividingBy: 360\)/);
    expect(body).toMatch(/d > 180 \? 360 - d : d/);
  });
  it("keys a pixel with the same steps, in the same order, and only CHROMA's numbers", () => {
    const body = between(all, "static func alpha(r: Double, g: Double, b: Double, key: (", "\n  }\n");
    inOrder(body, [
      "rgbToHsv(key.r, key.g, key.b)", "if keyHsv.s < minSat { return 1 }", "rgbToHsv(r, g, b)",
      "if pixel.s < minSat || pixel.v < minVal { return 1 }", "let tol = hueBase + hueRange * unit(strength)",
      "let d = hueDistance(pixel.h, keyHsv.h)", "let alpha = (d - tol) / soft", "return min(1, max(0, alpha))",
    ]);
    const literals = [...body.split("{").slice(1).join("{").matchAll(/(?<![\w.])\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
    expect(literals.filter((n) => ![0, 1].includes(n))).toEqual([]);
  });
  it("reads a key colour as strictly #RRGGBB", () => {
    const body = between(all, "static func hexToRgb(", "\n  }\n");
    expect(body).toMatch(/count == 7/);
    expect(body).toMatch(/"#"/);
    expect([...body.matchAll(/\/ 255/g)]).toHaveLength(3);
    // ASCII hex digits only: `Character.isHexDigit` also accepts full-width digits, which the TS pattern rejects.
    expect(body).not.toMatch(/isHexDigit/);
  });
  it("builds the cube premultiplied, with red varying fastest, then green, then blue", () => {
    const body = between(all, "static func cubeData(", "\n  }\n");
    inOrder(body, ["for blue in 0..<n {", "for green in 0..<n {", "for red in 0..<n {", "alpha(r: r, g: g, b: b, key: rgb, strength: ", "Float(r * a)", "Float(g * a)", "Float(b * a)", "Float(a)"]);
    expect(body).toMatch(/lock\.lock\(\)/);
    expect(body).toMatch(/uppercased\(\)/);
  });
  it("puts the cube's lattice points at i / (N − 1), so the first is 0 and the last is 1", () => {
    const body = between(all, "static func cubeData(", "\n  }\n");
    inOrder(body, ["let n = cube", "guard n >= 2 else { return nil }", "let top = Double(n - 1)", "let r = Double(red) / top", "let g = Double(green) / top", "let b = Double(blue) / top"]);
  });
  it("looks the cube up in display (sRGB) values: the keying maths is written for the colours the user sees", () => {
    const apply = between(all, "static func apply(", "\n  }\n");
    inOrder(apply, ["CGColorSpace(name: CGColorSpace.sRGB)", '"CIColorCubeWithColorSpace"', '"inputCubeDimension": NSNumber(value: cube)', '"inputCubeData"', '"inputColorSpace": space']);
    expect(apply).not.toContain('"CIColorCube"');
    expect(apply).toMatch(/else \{ return image \}/);
    expect(apply).toMatch(/\.cropped\(to: extent\)/);
  });
});

describe("the Swift test table embeds every chroma vector", () => {
  it("has the same number of cases", () => {
    expect([...table.matchAll(/ChromaAlphaVector\(name: "/g)]).toHaveLength(ALPHA_VECTORS.length);
    expect([...table.matchAll(/ChromaHsvVector\(name: "/g)]).toHaveLength(HSV_VECTORS.length);
    expect([...table.matchAll(/ChromaHexVector\(name: "/g)]).toHaveLength(HEX_VECTORS.length);
    expect([...table.matchAll(/ChromaHueVector\(a: /g)]).toHaveLength(HUE_DISTANCE_VECTORS.length);
  });
  it.each(ALPHA_VECTORS.map((v) => [v.name, v] as const))("alpha: %s", (_name, v) => {
    expect(table).toContain(
      `ChromaAlphaVector(name: "${v.name}", r: ${fmt(v.r)}, g: ${fmt(v.g)}, b: ${fmt(v.b)}, key: "${v.key}", strength: ${fmt(v.strength)}, alpha: ${fmt(v.alpha)})`,
    );
  });
  it.each(HSV_VECTORS.map((v) => [v.name, v] as const))("hsv: %s", (_name, v) => {
    expect(table).toContain(
      `ChromaHsvVector(name: "${v.name}", r: ${fmt(v.r)}, g: ${fmt(v.g)}, b: ${fmt(v.b)}, h: ${fmt(v.h)}, s: ${fmt(v.s)}, v: ${fmt(v.v)})`,
    );
  });
  it.each(HEX_VECTORS.map((v) => [v.name, v] as const))("hex: %s", (_name, v) => {
    const rgb = v.rgb === null ? "nil" : `[${fmt(v.rgb.r)}, ${fmt(v.rgb.g)}, ${fmt(v.rgb.b)}]`;
    expect(table).toContain(`ChromaHexVector(name: "${v.name}", hex: "${v.hex}", rgb: ${rgb})`);
  });
  it.each(HUE_DISTANCE_VECTORS.map((v) => [`${v.a} / ${v.b}`, v] as const))("hue distance: %s", (_name, v) => {
    expect(table).toContain(`ChromaHueVector(a: ${fmt(v.a)}, b: ${fmt(v.b)}, d: ${fmt(v.d)})`);
  });
  it("never unwraps a constant under its own name in the same scope (a redeclaration in Swift)", () => {
    const text = code(table);
    for (const m of text.matchAll(/guard let (\w+) else/g)) {
      expect(text).not.toMatch(new RegExp(`\\blet ${m[1]} = `));
    }
  });
  it("the tables are run against the Swift functions", () => {
    expect(table).toMatch(/Chroma\.alpha\(r: v\.r, g: v\.g, b: v\.b, hex: v\.key, strength: v\.strength\)/);
    expect(table).toMatch(/Chroma\.rgbToHsv\(v\.r, v\.g, v\.b\)/);
    expect(table).toMatch(/Chroma\.hexToRgb\(v\.hex\)/);
    expect(table).toMatch(/Chroma\.hueDistance\(v\.a, v\.b\)/);
  });
});

describe("the request records", () => {
  it("a clip (and a layer) decodes blend and chroma with the neutral defaults", () => {
    for (const record of ["ExportClip", "ExportLayer"]) {
      const body = between(session, `struct ${record}: Record {`, "\n}");
      expect(body).toMatch(/@Field var blend: String = "normal"/);
      expect(body).toMatch(/@Field var chroma: ExportChroma\?/);
    }
    expect(recordFields("ExportChroma")).toEqual(["color", "strength"]);
    expect(wrapper).toMatch(/\n {2}blend: BlendId;/);
    expect(wrapper).toMatch(/\n {2}chroma: \{ color: string; strength: number \} \| null;/);
  });
  it("an effect decodes its rectangle, none by default", () => {
    expect(recordFields("ExportEffect")).toEqual(["type", "start", "end", "intensity", "rect"]);
    expect(between(session, "struct ExportEffect: Record {", "\n}")).toMatch(/@Field var rect: ExportEffectRect\?/);
    expect(recordFields("ExportEffectRect")).toEqual(["x", "y", "w", "h"]);
    expect(wrapper).toMatch(/rect: \{ x: number; y: number; w: number; h: number \} \| null/);
  });
  it("the pre-pass carries blend and chroma (a prepared photo / reversed copy keeps them)", () => {
    const rewrite = between(prePass, "static func rewrite(", "return out");
    expect(rewrite).toContain("out.blend = clip.blend\n");
    expect(rewrite).toContain("out.chroma = clip.chroma\n");
    const layer = between(prePass, "var clip: ExportClip {", "return out");
    expect(layer).toContain("out.blend = blend\n");
    expect(layer).toContain("out.chroma = chroma\n");
  });
});

describe("the session hands them to the compositor", () => {
  const all = code(session);
  it("a layer's spec carries its blend mode and green screen; a main clip's only its green screen", () => {
    const layers = between(all, "var placedLayers: [PlacedOverlay] = []", "func spec(_ i: Int) -> LayerSpec {");
    expect(layers).toMatch(/blend: l\.blend, chroma: ExportSession\.chromaKey\(l\.chroma\),/);
    const main = between(all, "func spec(_ i: Int) -> LayerSpec {", "\n    }\n");
    expect(main).toMatch(/chroma: ExportSession\.chromaKey\(c\.chroma\),/);
    expect(main).not.toMatch(/blend/);
  });
  it("an effect's spec carries its rectangle", () => {
    expect(all).toMatch(/intensity: \$0\.intensity, rect: ExportSession\.effectRegion\(\$0\.rect\)\)/);
    expect(between(compositor, "struct ActiveEffectSpec: Equatable {", "\n}\n")).toMatch(/var rect: RegionRect\? = nil/);
    // `usable` keeps the rectangle when it rebuilds the spec with a clamped intensity.
    expect(between(code(compositor), "static func usable(", "\n  }\n")).toMatch(/intensity: min\(1, max\(0, e\.intensity\)\), rect: e\.rect\)/);
  });
});

describe("the compositor", () => {
  const all = code(compositor);
  const placed = between(all, "static func placedFrame(", "\n  }\n");
  it("a LayerSpec knows its blend mode and green screen (defaults = today's clip)", () => {
    const layer = between(compositor, "final class LayerSpec {", "\n}\n");
    expect(layer).toMatch(/let blend: String/);
    expect(layer).toMatch(/let chroma: ChromaKey\?/);
    expect(layer).toMatch(/transparent: Bool = false, blend: String = "normal", chroma: ChromaKey\? = nil,/);
    // A keyed clip shows what is behind it, so it never takes the plain cover shortcut.
    expect(code(layer)).toMatch(/Chroma\.usableKey\(/);
    expect(code(layer)).toMatch(/let plain = [^\n]*&& key == nil/);
  });
  it("the green screen runs after the look and before the mask, and only when there is a key", () => {
    inOrder(placed, [
      "spec.transparent ? look(spec, on: boxed, time: time) : boxed", "if let chroma = spec.chroma {",
      "Chroma.apply(to: looked, key: chroma.color, strength: chroma.strength)", "radius > 0 ? rounded(keyed,", ".transformed(by: p.outer)",
    ]);
  });
  it("a keyed main clip draws its background behind the picture, like a masked one", () => {
    expect(placed).toContain("covered && radius <= 0 && spec.chroma == nil");
  });
  it("a blend mode other than normal is its own branch for layers; normal keeps the source-over lines", () => {
    inOrder(placed, [
      "guard opacity > 0 else { return behind }", 'if running != nil, spec.blend != "normal", let mixed = blended(picture, over: behind, mode: spec.blend, rect: rect) {',
      "dissolve(from: behind, to: mixed, progress: CGFloat(opacity)).cropped(to: rect)",
      "let over = picture.composited(over: behind).cropped(to: rect)", "guard opacity < 1 else { return over }",
      "return dissolve(from: behind, to: over, progress: CGFloat(opacity)).cropped(to: rect)",
    ]);
  });
  it("has one Core Image blend filter per blend id except normal", () => {
    const map = between(all, "static let blendFilters: [String: String] = [", "]");
    const entries = Object.fromEntries([...map.matchAll(/"(\w+)": "(CI\w+)"/g)].map((m) => [m[1], m[2]]));
    expect(Object.keys(entries).sort()).toEqual(BLEND_IDS.filter((id) => id !== "normal").sort());
    expect(entries).toEqual({
      screen: "CIScreenBlendMode", multiply: "CIMultiplyBlendMode", overlay: "CIOverlayBlendMode",
      lighten: "CILightenBlendMode", darken: "CIDarkenBlendMode",
    });
  });
  it("the blended picture is kept inside the picture's own alpha, over the running frame", () => {
    const body = between(all, "static func blended(", "\n  }\n");
    inOrder(body, ["blendFilters[mode]", "Adjust.filtered(", '"CIBlendWithAlphaMask"', '"inputMaskImage": top', "return inside.cropped(to: rect)"]);
    expect(body).toMatch(/else \{ return nil \}/);
  });
  it("the blend filter gets an OPAQUE picture; the picture's alpha is used once, in the mask", () => {
    const body = between(all, "static func blended(", "\n  }\n");
    inOrder(body, [
      "let top = picture.cropped(to: rect)", "blendFilters[mode]", 'let solid = Adjust.filtered(top, "CIColorMatrix"',
      '"inputAVector": CIVector(x: 0, y: 0, z: 0, w: 0)', '"inputBiasVector": CIVector(x: 0, y: 0, z: 0, w: 1)',
      "Adjust.filtered(solid.cropped(to: rect), name, [kCIInputBackgroundImageKey: running])", '"CIBlendWithAlphaMask"', '"inputMaskImage": top',
    ]);
    // The blend filter never sees the picture with its own alpha.
    expect(body).not.toMatch(/Adjust\.filtered\(top, name/);
    expect(table).toMatch(/func testAHalfTransparentPictureIsBlendedAtHalfWeight\(\)/);
  });
  it("passes the effect's rectangle to the renderer", () => {
    const body = between(all, "func startRequest(", "\n  }\n");
    expect(body).toMatch(/k: effect\.intensity, size: size, region: effect\.rect\)/);
  });
});

describe("EffectRenderer: the blur box and the mosaic box", () => {
  const all = code(renderer);
  const body = between(all, "static func apply(", "\n  }\n");
  const branch = (id: string) => between(body, `case "${id}"`, "\n    case ");
  const mosaic = between(body, 'case "mosaicBox"', "\n    default:");
  it("takes the rectangle as an optional last parameter (nil for every other call)", () => {
    expect(all).toContain("static func apply(type: String, image: CIImage, t: Double, d: Double, k: Double, size: CGSize, region: RegionRect? = nil) -> CIImage {");
  });
  it("neither case is a pass-through any more", () => {
    for (const text of [branch("blurBox"), mosaic]) {
      expect(text).not.toMatch(/:\s*return image\s*\n/);
      inOrder(text, ["guard let region, let box = regionRect(region, in: size) else { return image }", ".cropped(to: box)", ".composited(over: image)"]);
      // A box has a constant strength while it is active: no time envelope.
      expect(text).not.toMatch(/\benv\b/);
    }
  });
  it("blur box: the clamped crop is blurred by 0.06 × k × the frame's shorter side and cut back to the box", () => {
    const text = branch("blurBox");
    expect(text).toMatch(/blurBoxRadius \* k \* shorter/);
    expect(text).toMatch(/ClipyCompositor\.blurred\(image\.cropped\(to: box\), radius: [^\n]*, rect: box\)/);
    expect(all).toMatch(/static let blurBoxRadius: Double = 0\.06\b/);
    const blurred = between(code(compositor), "static func blurred(", "\n  }\n");
    inOrder(blurred, ["clampedToExtent()", '"CIGaussianBlur"', ".cropped(to: rect)"]);
  });
  it("mosaic box: CIPixellate on the clamped crop, blocks of max(4, 0.08 × k × shorter side), aligned to the box", () => {
    expect(mosaic).toMatch(/max\(mosaicBoxMinBlock, mosaicBoxBlock \* k \* shorter\)/);
    inOrder(mosaic, ["image.cropped(to: box).clampedToExtent()", '"CIPixellate"', '"inputScale"', '"inputCenter": CIVector(x: box.minX, y: box.minY)']);
    expect(all).toMatch(/static let mosaicBoxBlock: Double = 0\.08\b/);
    expect(all).toMatch(/static let mosaicBoxMinBlock: Double = 4\b/);
  });
  it("one helper turns top-left fractions into Core Image's bottom-left pixels", () => {
    expect([...all.matchAll(/static func regionRect\(/g)]).toHaveLength(1);
    const helper = between(all, "static func regionRect(", "\n  }\n");
    expect(helper).toMatch(/y: \(1 - region\.y - region\.h\) \* h/);
    expect(helper).toMatch(/isFinite/);
    expect(helper).toMatch(/return nil/);
    expect(table).toMatch(/EffectRenderer\.regionRect\(/);
  });
});
