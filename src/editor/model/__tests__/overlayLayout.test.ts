import { readFileSync } from "fs";
import { join } from "path";
import { DEFAULT_GLOW, DEFAULT_SHADOW, DEFAULT_TEXT_STYLE, makeClip, makeOverlay, makeProject, type TextOverlay } from "../types";
import * as overlayLayout from "../overlayLayout";
import { BACKGROUND_PAD_FACTOR, BOX_RADIUS_FACTOR, frameSize, layoutOverlay, LINE_HEIGHT_FACTOR, MAX_WIDTH_FACTOR, OUTLINE_FACTOR } from "../overlayLayout";
import { migrateProject } from "../migrate";
import { contrastFor as contrastForFromOverlayText } from "@/src/editor/components/OverlayText";
import { CAPTION_PRESET_IDS, CAPTION_PRESETS, TEXT_TEMPLATES } from "@/src/editor/textTemplates";
import { BOX_VECTORS } from "./overlayLayout.vectors";

const IOS = join(__dirname, "../../../../modules/clipy-video/ios");
const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");   // a checkout may use CRLF
const swift = read(join(IOS, "OverlayLayout.swift"));
const ts = read(join(__dirname, "../overlayLayout.ts"));
const r4 = (v: number) => Math.round(v * 10000) / 10000;

/** The value of `static let <name>: CGFloat = <number>` in OverlayLayout.swift. */
function swiftConstant(name: string): number {
  const m = swift.match(new RegExp(`static let ${name}: CGFloat = ([0-9.]+)\\n`));
  if (!m) throw new Error(`no constant ${name} in OverlayLayout.swift`);
  return Number(m[1]);
}

test("OverlayLayout.swift uses the same OUTLINE_FACTOR (2/450)", () => {
  const m = swift.match(/static let outlineFactor(?::\s*\w+)?\s*=\s*([0-9.]+)\s*\/\s*([0-9.]+)/);
  expect(m).not.toBeNull();
  expect(Number(m![1]) / Number(m![2])).toBe(OUTLINE_FACTOR);
  expect(OUTLINE_FACTOR).toBe(2 / 450);
});

test("OverlayLayout.swift has the same constants", () => {
  expect(swiftConstant("lineHeightFactor")).toBe(LINE_HEIGHT_FACTOR);
  expect(swiftConstant("backgroundPadFactor")).toBe(BACKGROUND_PAD_FACTOR);
  expect(swiftConstant("maxWidthFactor")).toBe(MAX_WIDTH_FACTOR);
  expect(swiftConstant("shadowAngle")).toBe((overlayLayout as { SHADOW_ANGLE?: number }).SHADOW_ANGLE);
  expect((overlayLayout as { SHADOW_ANGLE?: number }).SHADOW_ANGLE).toBe(0.7071);
  expect(swiftConstant("boxRadiusFactor")).toBe(BOX_RADIUS_FACTOR);
  expect(BOX_RADIUS_FACTOR).toBe(0.5);
  expect(BACKGROUND_PAD_FACTOR).toBe(DEFAULT_TEXT_STYLE.boxPadding);   // the default padding IS the old constant
});

test("OverlayLayout.swift derives the style values with the same formulas", () => {
  // Each pair is the same expression in the two languages; both must be present verbatim.
  const pairs: [string, string][] = [
    ["letterSpacing: r(o.style.letterSpacing * fontSize)", "letterSpacing: CGFloat(o.style.letterSpacing) * fontSize"],
    ["lineHeight: r(LINE_HEIGHT_FACTOR * fontSize * o.style.lineSpacing)", "lineHeight: lineHeightFactor * fontSize * CGFloat(o.style.lineSpacing)"],
    ["outlineWidth: r(OUTLINE_FACTOR * frameH * o.style.outlineWidth)", "outlineWidth: outlineFactor * frame.height * CGFloat(o.style.outlineWidth)"],
    ["outlineColor: o.style.outlineColor ?? contrastFor(o.color)", "outlineColor: o.style.outlineColor ?? contrastFor(hex: o.color)"],
    ["const offset = r(shadow.distance * fontSize * SHADOW_ANGLE)", "let offset = CGFloat(o.style.shadowDistance) * fontSize * shadowAngle"],
    ["blur: r(shadow.blur * fontSize)", "blur: CGFloat(o.style.shadowBlur) * fontSize"],
    ["radius: r(glow.size * fontSize)", "radius: CGFloat(o.style.glowSize) * fontSize"],
    ["opacity: o.style.opacity", "opacity: CGFloat(o.style.opacity)"],
    ["padding: o.background ? r(o.style.boxPadding * fontSize) : 0", "padding: o.backgroundColor == nil ? 0 : CGFloat(o.style.boxPadding) * fontSize"],
    ["boxRadius: !o.background || o.style.boxCorner === \"square\" ? 0 : r(BACKGROUND_PAD_FACTOR * fontSize) * BOX_RADIUS_FACTOR", "boxRadius: o.backgroundColor == nil || o.style.boxCorner == \"square\" ? 0 : backgroundPadFactor * fontSize * boxRadiusFactor"],
  ];
  for (const [t, s] of pairs) {
    expect(ts).toContain(t);
    expect(swift).toContain(s);
  }
});

test("contrastFor lives in the mirrored pair with the same coefficients and threshold", () => {
  const luma = "(0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5 ? \"#000000\" : \"#FFFFFF\"";
  expect(ts).toContain(luma);
  expect(swift).toContain(luma);
  expect(swift).toContain("func contrastFor(hex: String) -> String");
  expect(read(join(IOS, "ExportSession.swift"))).not.toContain("func contrastFor(");
  const contrastFor = (overlayLayout as { contrastFor?: (hex: string) => string }).contrastFor;
  expect(contrastFor).toBe(contrastForFromOverlayText);   // re-exported from where it was
  expect(contrastFor!("#FFFFFF")).toBe("#000000");
  expect(contrastFor!("#F4F4F5")).toBe("#000000");
  expect(contrastFor!("#000000")).toBe("#FFFFFF");
  expect(contrastFor!("#FF0000")).toBe("#FFFFFF");       // luma 0.299
  expect(contrastFor!("#00FF00")).toBe("#000000");       // luma 0.587
  expect(contrastFor!("nonsense")).toBe("#FFFFFF");
});

test("the Swift export records carry the style, the words and the highlight with neutral defaults", () => {
  const session = read(join(IOS, "ExportSession.swift"));
  const record = (name: string) => {
    const m = session.match(new RegExp(`struct ${name}: Record \\{\\n([\\s\\S]*?)\\n\\}`));
    if (!m) throw new Error(`no record ${name}`);
    return [...m[1].matchAll(/@Field var (\w+): ([^=\n/]+?)(?: = ([^\n/]+?))?\s*(?:\/\/.*)?$/gm)].map((f) => [f[1], f[2].trim(), f[3]?.trim() ?? null]);
  };
  expect(record("ExportTextStyle")).toEqual([
    ["opacity", "Double", "1"], ["letterSpacing", "Double", "0"], ["lineSpacing", "Double", "1"],
    ["outlineColor", "String?", null], ["outlineWidth", "Double", "1"],
    ["shadowColor", "String?", null], ["shadowOpacity", "Double", "0"], ["shadowDistance", "Double", "0"], ["shadowBlur", "Double", "0"],
    ["glowColor", "String?", null], ["glowSize", "Double", "0"],
    ["boxPadding", "Double", "0.25"], ["boxCorner", "String", "\"rounded\""],
  ]);
  expect(record("ExportCaptionWord")).toEqual([["text", "String", "\"\""], ["start", "Double", "0"], ["end", "Double", "0"]]);
  const overlay = record("ExportOverlay");
  expect(overlay).toContainEqual(["style", "ExportTextStyle", "ExportTextStyle()"]);
  expect(overlay).toContainEqual(["words", "[ExportCaptionWord]", "[]"]);
  expect(overlay).toContainEqual(["highlightColor", "String?", null]);
  // The record's defaults are the neutral style.
  expect(DEFAULT_TEXT_STYLE).toEqual({ opacity: 1, letterSpacing: 0, lineSpacing: 1, outlineColor: null, outlineWidth: 1, shadow: null, glow: null, boxPadding: 0.25, boxCorner: "rounded" });
});

const o = makeOverlay({ id: "o", x: 0.25, y: 0.75, fontScale: 0.1, scale: 1.5, rotation: 30, background: { color: "#000000", opacity: 0.5 } });
const NEUTRAL = { letterSpacing: 0, outlineColor: "#000000", shadow: null, glow: null, opacity: 1 };

test("layoutOverlay scales with the frame (pinned numbers — the Swift mirror must match)", () => {
  expect(layoutOverlay(o, 300, 533)).toEqual({ centerX: 75, centerY: 399.75, fontSize: 79.95, maxWidth: 270, padding: 19.9875, outlineWidth: 2.3689, rotation: 30, lineHeight: 95.94, boxRadius: 9.99375, ...NEUTRAL });
  expect(layoutOverlay(o, 1080, 1920)).toEqual({ centerX: 270, centerY: 1440, fontSize: 288, maxWidth: 972, padding: 72, outlineWidth: 8.5333, rotation: 30, lineHeight: 345.6, boxRadius: 36, ...NEUTRAL });
  expect(layoutOverlay({ ...o, background: null }, 1080, 1080).padding).toBe(0);
});

test("the default style gives exactly the numbers from before styles existed", () => {
  for (const [w, h] of [[300, 533], [1080, 1920], [1080, 1080], [393, 698.6667], [720, 1280], [1, 3]]) {
    for (const fontScale of [0.03, 0.07, 0.1, 0.1234567]) {
      for (const scale of [0.3, 1, 1.5, 2.7]) {
        const l = layoutOverlay({ ...o, fontScale, scale }, w, h);
        const fontSize = r4(fontScale * scale * h);                 // the previous expressions, verbatim
        expect(l.fontSize).toBe(fontSize);
        expect(l.lineHeight).toBe(r4(LINE_HEIGHT_FACTOR * fontSize));
        expect(l.outlineWidth).toBe(r4(OUTLINE_FACTOR * h));
        expect(l.padding).toBe(r4(BACKGROUND_PAD_FACTOR * fontSize));
        expect(l.maxWidth).toBe(r4(MAX_WIDTH_FACTOR * w));
        expect(l).toMatchObject({ letterSpacing: 0, shadow: null, glow: null, opacity: 1 });
        expect(Object.is(l.letterSpacing, 0)).toBe(true);           // +0, not −0
      }
    }
  }
  expect(layoutOverlay(makeOverlay({ id: "dark", color: "#101010" }), 1080, 1920).outlineColor).toBe("#FFFFFF");
});

test("a styled text at 1080×1920 (hand-computed — OverlayLayoutTests.swift pins the same numbers)", () => {
  const styled = makeOverlay({ id: "s", fontScale: 0.07, color: "#FFFFFF",
    style: { ...DEFAULT_TEXT_STYLE, opacity: 0.8, letterSpacing: 0.1, lineSpacing: 1.5, outlineWidth: 2, shadow: { ...DEFAULT_SHADOW }, glow: { ...DEFAULT_GLOW } } });
  expect(layoutOverlay(styled, 1080, 1920)).toEqual({
    centerX: 540, centerY: 960, fontSize: 134.4, maxWidth: 972, padding: 0, boxRadius: 0, rotation: 0,
    letterSpacing: 13.44,                 // 0.1 × 134.4
    lineHeight: 241.92,                   // 1.2 × 134.4 × 1.5
    outlineWidth: 17.0667,                // 2/450 × 1920 × 2
    outlineColor: "#000000",              // automatic: white text → black
    shadow: { color: "#000000", opacity: 0.6, dx: 5.7021, dy: 5.7021, blur: 13.44 },   // 0.06 × 134.4 × 0.7071; 0.1 × 134.4
    glow: { color: "#FFFFFF", radius: 33.6 },                                            // 0.25 × 134.4
    opacity: 0.8,
  });
  expect(layoutOverlay({ ...styled, style: { ...styled.style, outlineColor: "#FF2D7A" } }, 1080, 1920).outlineColor).toBe("#FF2D7A");
  const tight = layoutOverlay({ ...styled, style: { ...styled.style, letterSpacing: -0.05, lineSpacing: 0.8, outlineWidth: 0.5, shadow: null } }, 1080, 1920);
  expect(tight).toMatchObject({ letterSpacing: -6.72, lineHeight: 129.024, outlineWidth: 4.2667, shadow: null, glow: { color: "#FFFFFF", radius: 33.6 } });
});

test("the Swift layout test pins the same styled numbers", () => {
  const swiftTest = read(join(IOS, "Tests/OverlayLayoutTests.swift"));
  for (const n of ["134.4", "13.44", "241.92", "17.0667", "5.7021", "33.6", "8.5333", "345.6"]) expect(swiftTest).toContain(n);
});

test("frameSize aspect-fits the ratio into a container", () => {
  expect(frameSize(9 / 16, 400, 400)).toEqual({ w: 225, h: 400 });
  expect(frameSize(16 / 9, 400, 400)).toEqual({ w: 400, h: 225 });
  expect(frameSize(1, 300, 500)).toEqual({ w: 300, h: 300 });
  expect(frameSize(21 / 9, 420, 400)).toEqual({ w: 420, h: 180 });
});

test("frameSize: the largest box of the shape that fits — one side always touches the container, the other never sticks out", () => {
  // The preview's slot on a 393-wide phone less the 4-pt margin: tall (clips only) and short (three lanes).
  expect(frameSize(9 / 16, 385, 437)).toEqual({ w: 245.8125, h: 437 });
  expect(frameSize(1, 385, 437)).toEqual({ w: 385, h: 385 });
  expect(frameSize(16 / 9, 385, 437)).toEqual({ w: 385, h: 216.5625 });
  expect(frameSize(21 / 9, 385, 437)).toEqual({ w: 385, h: 165 });
  expect(frameSize(9 / 16, 385, 341)).toEqual({ w: 191.8125, h: 341 });
  expect(frameSize(1, 385, 341)).toEqual({ w: 341, h: 341 });
  expect(frameSize(16 / 9, 385, 341)).toEqual({ w: 385, h: 216.5625 });
  expect(frameSize(21 / 9, 385, 341)).toEqual({ w: 385, h: 165 });
  for (const ar of [9 / 16, 2 / 3, 3 / 4, 4 / 5, 1, 4 / 3, 3 / 2, 16 / 9, 21 / 9]) {
    for (const [w, h] of [[385, 437], [385, 341], [692, 192], [100, 100]]) {
      const f = frameSize(ar, w, h);
      expect(f.w).toBeLessThanOrEqual(w);
      expect(f.h).toBeLessThanOrEqual(h);
      expect(f.w === w || f.h === h).toBe(true);
      expect(f.w / f.h).toBeCloseTo(ar, 3);
    }
  }
});

test("frameSize: nothing to fit into, or no shape → 0 × 0, never NaN or a negative size", () => {
  const none = { w: 0, h: 0 };
  expect(frameSize(1, 0, 0)).toEqual(none);
  expect(frameSize(16 / 9, 0, 400)).toEqual(none);
  expect(frameSize(16 / 9, 400, 0)).toEqual(none);
  expect(frameSize(16 / 9, -8, 400)).toEqual(none);
  expect(frameSize(16 / 9, 400, -8)).toEqual(none);
  expect(frameSize(0, 400, 400)).toEqual(none);
  expect(frameSize(-1, 400, 400)).toEqual(none);
  for (const bad of [NaN, Infinity, -Infinity]) {
    expect(frameSize(bad, 400, 400)).toEqual(none);
    expect(frameSize(1, bad, 400)).toEqual(none);
    expect(frameSize(1, 400, bad)).toEqual(none);
  }
});

test.each(BOX_VECTORS.map((v) => [v.name, v] as const))("the box: %s", (_name, v) => {
  const o = makeOverlay({ id: "b", fontScale: v.fontScale, scale: v.scale, background: v.background ? { color: "#000000", opacity: 0.5 } : null,
    style: { ...DEFAULT_TEXT_STYLE, boxPadding: v.boxPadding, boxCorner: v.boxCorner } });
  expect(layoutOverlay(o, v.frame[0], v.frame[1])).toMatchObject(v.expect);
});

test("OverlayLayoutTests.swift carries the same box vectors, line for line", () => {
  const table = read(join(IOS, "Tests/OverlayLayoutTests.swift"));
  expect(table.match(/BoxVector\(name:/g)).toHaveLength(BOX_VECTORS.length);
  for (const v of BOX_VECTORS) {
    expect(table).toContain(`  BoxVector(name: "${v.name}", fontScale: ${v.fontScale}, scale: ${v.scale}, background: ${v.background}, boxPadding: ${v.boxPadding}, boxCorner: "${v.boxCorner}", `
      + `frame: CGSize(width: ${v.frame[0]}, height: ${v.frame[1]}), fontSize: ${v.expect.fontSize}, padding: ${v.expect.padding}, boxRadius: ${v.expect.boxRadius}),`);
  }
});

/** `layoutOverlay` exactly as it was in schema v14 (copied on 2026-10-06, before the box fields). NEVER edit: it is what "as before" means. */
function layoutV14(o: TextOverlay, frameW: number, frameH: number) {
  const fontSize = r4(o.fontScale * o.scale * frameH);
  const shadow = o.style.shadow, glow = o.style.glow;
  const offset = shadow ? r4(shadow.distance * fontSize * 0.7071) : 0;
  return {
    centerX: r4(o.x * frameW), centerY: r4(o.y * frameH), fontSize,
    maxWidth: r4(0.9 * frameW),
    padding: o.background ? r4(0.25 * fontSize) : 0,
    rotation: o.rotation,
    letterSpacing: r4(o.style.letterSpacing * fontSize),
    lineHeight: r4(1.2 * fontSize * o.style.lineSpacing),
    outlineWidth: r4((2 / 450) * frameH * o.style.outlineWidth),
    outlineColor: o.style.outlineColor ?? overlayLayout.contrastFor(o.color),
    shadow: shadow ? { color: shadow.color, opacity: shadow.opacity, dx: offset, dy: offset, blur: r4(shadow.blur * fontSize) } : null,
    glow: glow ? { color: glow.color, radius: r4(glow.size * fontSize) } : null,
    opacity: o.style.opacity,
  };
}
/** The twelve text templates that existed in schema v14 (later ones never were in a v14 file). */
const V14_TEMPLATES = ["cleanTitle", "boldPop", "neon", "subtitleBar", "comic", "retro", "handwritten", "elegant", "shadowed", "outlineOnly", "stickerLabel", "softGlow"] as const;

test("PROOF: a text or caption from a v14 file draws with exactly the numbers it had (every old look × three backgrounds × four frames)", () => {
  const looks = [...V14_TEMPLATES.map((id) => TEXT_TEMPLATES[id].patch), ...CAPTION_PRESET_IDS.map((id) => CAPTION_PRESETS[id].patch)];
  const overlays = looks.flatMap((look, i) => [look.background, { color: "#112233", opacity: 0.4 }, null].map((background, j) =>
    makeOverlay({ id: `o${i}-${j}`, text: "Hello", start: 0, end: 2, fontId: look.fontId, color: look.color, outline: look.outline,
      background: background ? { ...background } : null, style: look.style, x: 0.3, y: 0.7, scale: 1.3, rotation: 15 })));
  const now = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 5 })], overlays });
  const v14 = JSON.parse(JSON.stringify(now)) as { schemaVersion: number; overlays: { style: Record<string, unknown> }[] };
  v14.schemaVersion = 14;
  for (const o of v14.overlays) { delete o.style.boxPadding; delete o.style.boxCorner; }
  const loaded = migrateProject(v14).overlays as TextOverlay[];
  expect(loaded).toHaveLength(54);                                        // (12 + 6) × 3
  for (const [w, h] of [[300, 533], [1080, 1920], [1080, 1080], [393, 698.6667]]) {
    loaded.forEach((o, i) => {
      const before = layoutV14(v14.overlays[i] as unknown as TextOverlay, w, h);     // the overlay exactly as the v14 file holds it
      const { boxRadius, ...rest } = layoutOverlay(o, w, h);
      expect(rest).toEqual(before);                                       // every number the preview and the export drew from
      expect(boxRadius).toBe(before.padding / 2);                         // what both drew as the corner: `padding / 2`
    });
  }
});
