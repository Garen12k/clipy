import { readFileSync } from "fs";
import { join } from "path";
import { EFFECT_IDS } from "../types";

/**
 * The native export is never compiled here, so these checks read the Swift source: each of the eight effects of 2026-10-06 has a
 * real case driven by its EffectMath function, every Core Image filter is made through a guarded helper, and no placeholder is left.
 */
const iosDir = join(__dirname, "../../../../modules/clipy-video/ios");
const read = (file: string) => readFileSync(join(iosDir, file), "utf8").replace(/\r\n/g, "\n");
const code = (source: string) => source.replace(/\/\/[^\n]*/g, "");
const between = (source: string, from: string, to: string): string => {
  const start = source.indexOf(from);
  if (start < 0) throw new Error(`"${from}" not found`);
  const end = source.indexOf(to, start + from.length);
  return source.slice(start, end < 0 ? undefined : end);
};
const renderer = read("EffectRenderer.swift");
const apply = code(between(renderer, "static func apply(", "\n  }\n"));
/** One effect's branch: from its `case` up to the next one (or `default:`). */
const branch = (id: string) => { const from = apply.indexOf(`case "${id}":`); const next = apply.slice(from + 1).search(/\n    (case "|default:)/); return apply.slice(from, from + 1 + next); };

test("no placeholder is left, and the eight new cases come after the twelve old ones", () => {
  expect(renderer).not.toContain("MORE-LOOKS-PLACEHOLDER");
  expect([...apply.matchAll(/case "(\w+)":/g)].map((m) => m[1])).toEqual([...["shake", "zoomPulse", "flash", "lightLeak", "vhs", "oldFilm", "glow", "blur", "glitch", "rgbSplit", "blurBox", "mosaicBox"], ...EFFECT_IDS.slice(12)]);
});

test.each([
  ["heartbeat", ["EffectMath.heartbeatScale(t: t, d: d, k: k)", "scaled(image, by:"]],
  ["strobe", ["EffectMath.strobeOpacity(t: t, k: k)", "colorLayer(EffectMath.strobeColor"]],
  ["filmBurn", ["EffectMath.burnOpacity(t: t, d: d, k: k)", "EffectMath.burnCentreY(t: t)", "EffectMath.burnRadius * w", "light(EffectMath.filmBurnColor"]],
  ["lensFlare", ["EffectMath.flareOpacity(t: t, d: d, k: k)", "EffectMath.flareX(t: t) * w", "EffectMath.flareY", "EffectMath.flareHalo * shorter", "EffectMath.flareCore * shorter"]],
  ["dust", ["EffectMath.dustScratch(t: t, k: k, i: Double(i))", "EffectMath.dustLines", "EffectMath.dustWidth * w", "EffectMath.dustOpacity * amount", "specks(over:"]],
  ["hueShift", ["EffectMath.hueAngle(t: t, d: d, k: k)", "\"CIHueAdjust\"", "\"inputAngle\""]],
  ["mirror", ["EffectMath.mirrorMix(t: t, d: d, k: k)", "ClipyCompositor.dissolve(from: frame, to: mirrored"]],
  ["softEdges", ["EffectMath.softEdgeAmount(t: t, d: d, k: k)", "EffectMath.edgeBlur", "ClipyCompositor.blurred(frame", "softMask(", "\"CIBlendWithMask\""]],
] as [string, string[]][])("%s is driven by its maths", (id, parts) => {
  const b = branch(id);
  for (const part of parts) expect(b).toContain(part);
});

test("screen-up maths, y-up image: the burn's and the flare's centre flip the fraction from the top", () => {
  expect(branch("filmBurn")).toContain("h * (1 - EffectMath.burnCentreY(t: t))");
  expect(branch("lensFlare")).toContain("h * (1 - EffectMath.flareY)");
  expect((branch("lensFlare").match(/light\(/g) ?? [])).toHaveLength(2);       // the halo, then the core
});

test("every Core Image filter in the file is made through a guarded helper", () => {
  const all = code(renderer);
  // A literal filter name only ever appears as the name argument of Adjust.filtered(…, "CI…", or of generated("CI…".
  const names = [...all.matchAll(/"(CI[A-Z]\w+)"/g)].map((m) => m.index!);
  for (const at of names) expect(all.slice(Math.max(0, at - 160), at)).toMatch(/(Adjust\.filtered\([^"]*|generated\()$/);
  expect(all).not.toMatch(/applyingFilter\(/);
  expect([...all.matchAll(/CIFilter\(name:/g)]).toHaveLength(1);                // inside `generated` only
  // The three new helpers, each once, each falling back to the image it was given.
  for (const fn of ["light", "softMask", "specks"]) expect([...all.matchAll(new RegExp(`private static func ${fn}\\(`, "g"))]).toHaveLength(1);
  expect(between(all, "private static func light(", "\n  }\n")).toMatch(/"CIRadialGradient"[\s\S]*"CIScreenBlendMode"[\s\S]*else \{ return image \}/);
  expect(between(all, "private static func specks(", "\n  }\n")).toMatch(/"CIRandomGenerator"[\s\S]*"CIColorMatrix"[\s\S]*else \{ return image \}/);
  expect(between(all, "private static func softMask(", "\n  }\n")).toContain("\"CIRadialGradient\"");
});

test("the XCTests of the eight exist", () => {
  const tests = read("Tests/EffectMathTests.swift");
  for (const name of ["testHeartbeatAndStrobe", "testFilmBurnLightsTheLeftEdge", "testLensFlareLightsItsPlace", "testHueShiftTurnsColourAndLeavesGrey", "testMirrorCopiesTheLeftHalfOntoTheRight", "testSoftEdgesKeepTheCentreAndTheExtent", "testDustDrawsItsScratchWhereTheMathsSays"]) expect(tests).toContain(`func ${name}()`);
});
