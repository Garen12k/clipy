import { createHash } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";
import { EFFECTS, FILTERS, TRANSITIONS } from "../effects";
import { EFFECT, EFFECT_COLORS, effectPreview } from "../model/effectMath";
import { EFFECT_IDS, FILTER_IDS, TRANSITION_TYPES } from "../model/types";

/**
 * What "nothing in an existing project changes" means, frozen on 2026-10-06 before the thirty new looks were added.
 * NEVER edit this file to make it pass: a red test here means an existing look was changed. New ids are appended after
 * the frozen ones; new Swift is inserted outside the frozen stretches (the checksums below).
 */
const ROOT = join(__dirname, "../../..");
const read = (file: string) => readFileSync(join(ROOT, file), "utf8").replace(/\r\n/g, "\n");
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
/** `source` from `from` through the first `to` after it (both included; `to` left out when `keepEnd` is false). */
const stretch = (source: string, from: string, to: string, keepEnd = true): string => {
  const a = source.indexOf(from);
  if (a < 0) throw new Error(`"${from}" not found`);
  const b = source.indexOf(to, a + from.length);
  if (b < 0) throw new Error(`"${to}" not found`);
  return source.slice(a, keepEnd ? b + to.length : b);
};

const OLD_FILTERS: [string, string, string, number, number, number][] = [
  ["none", "None", "#000000", 0, 1, 0], ["warm", "Warm", "#FF9A3C", 0.14, 1.1, 0.02], ["cool", "Cool", "#3C8CFF", 0.14, 1, 0],
  ["vivid", "Vivid", "#FF2D7A", 0.06, 1.4, 0.03], ["faded", "Faded", "#FFFFFF", 0.12, 0.7, 0.08], ["mono", "Mono", "#000000", 0, 0, 0],
  ["noir", "Noir", "#000000", 0.18, 0, -0.08], ["vintage", "Vintage", "#C8A05A", 0.22, 0.6, -0.03], ["sunset", "Sunset", "#FF8A3C", 0.2, 1.2, 0],
  ["golden", "Golden", "#FFC857", 0.18, 1.05, 0.04], ["teal", "Teal", "#2EC4B6", 0.16, 1.1, 0], ["pastel", "Pastel", "#FFFFFF", 0.1, 0.8, 0.06],
  ["film", "Film", "#E8A86A", 0.12, 1.1, 0], ["chrome", "Chrome", "#000000", 0, 1.3, 0], ["instant", "Instant", "#F2D9A0", 0.14, 0.9, 0.04],
  ["process", "Process", "#3C8CFF", 0.1, 1.1, 0], ["tonal", "Tonal", "#000000", 0, 0, 0], ["sepia", "Sepia", "#C8A05A", 0.3, 0, 0],
  ["crisp", "Crisp", "#000000", 0, 1.05, 0], ["dream", "Dream", "#FFFFFF", 0.08, 1.1, 0.03],
];
const OLD_TRANSITIONS: [string, string][] = [["none", "None"], ["fade", "Fade"], ["dissolve", "Dissolve"], ["slide", "Slide left"], ["zoom", "Zoom"],
  ["slideRight", "Slide right"], ["slideUp", "Slide up"], ["slideDown", "Slide down"], ["wipe", "Wipe"], ["spin", "Spin"], ["blur", "Blur"]];
const OLD_EFFECTS: [string, string, string][] = [
  ["glitch", "Glitch", "git-compare-outline"], ["shake", "Shake", "phone-portrait-outline"], ["zoomPulse", "Zoom pulse", "expand-outline"],
  ["blur", "Blur", "water-outline"], ["vhs", "VHS", "videocam-outline"], ["lightLeak", "Light leak", "sunny-outline"], ["flash", "Flash", "flash-outline"],
  ["rgbSplit", "RGB split", "layers-outline"], ["oldFilm", "Old film", "film-outline"], ["glow", "Glow", "bulb-outline"],
  ["blurBox", "Blur box", "scan-outline"], ["mosaicBox", "Mosaic box", "grid-outline"],
];
const OLD_EFFECT = {
  ramp: 0.15, shakeAmp: 0.03, shakeFx: 9, shakeFy: 11, shakePhase: 1.3, shakeZoom: 0.06, pulseAmp: 0.12, pulseHz: 2,
  flashHz: 2, flashDecay: 4, leakOpacity: 0.35, leakHz: 0.5, vhsTint: 0.12, vhsShift: 0.004, filmTint: 0.3, filmFlicker: 0.12, filmFps: 12,
  glowLayer: 0.12, glowRadius: 0.02, glowIntensity: 0.8, blurRadius: 0.03, glitchHz: 8, glitchChance: 0.5, glitchShift: 0.08, glitchSplit: 0.01,
  glitchBandMin: 0.08, glitchBandMax: 0.2, rgbSplit: 0.008,
};
const NOTHING = { translateX: 0, translateY: 0, scale: 1, layers: [] };
/** A test whose failure says what it means before the diff. */
const frozen = (name: string, body: () => void) => test(name, () => {
  try { body(); } catch (e) {
    const error = e as Error, note = "AN EXISTING LOOK WAS CHANGED (ids, order, labels, recipes, maths or its Swift). Fix your change — never this file.\n\n";
    error.message = note + error.message;
    if (error.stack) error.stack = note + error.stack;
    throw error;
  }
});

frozen("the 20 filters, 11 transitions and 12 effects of before 2026-10-06 come first, in their order, with their labels, icons and preview recipes", () => {
  expect(FILTER_IDS.slice(0, 20)).toEqual(OLD_FILTERS.map((f) => f[0]));
  for (const [id, label, tint, tintOpacity, saturation, brightness] of OLD_FILTERS) {
    expect(FILTERS[id as keyof typeof FILTERS]).toEqual({ label, preview: { tint, tintOpacity, saturation, brightness } });
  }
  expect(TRANSITION_TYPES.slice(0, 11)).toEqual(OLD_TRANSITIONS.map((t) => t[0]));
  for (const [id, label] of OLD_TRANSITIONS) expect(TRANSITIONS[id as keyof typeof TRANSITIONS]).toEqual({ label });
  expect(EFFECT_IDS.slice(0, 12)).toEqual(OLD_EFFECTS.map((e) => e[0]));
  for (const [id, label, icon] of OLD_EFFECTS) expect(EFFECTS[id as keyof typeof EFFECTS]).toEqual({ label, icon });
});

frozen("the 28 effect constants and the 6 effect colours of before lead their tables, value for value", () => {
  expect(Object.entries(EFFECT).slice(0, 28)).toEqual(Object.entries(OLD_EFFECT));
  expect(Object.entries(EFFECT_COLORS).slice(0, 6)).toEqual(Object.entries({ flash: "#FFFFFF", lightLeak: "#FFB347", vhs: "#7A5CFF", oldFilm: "#C8A05A", flicker: "#000000", glow: "#FFFFFF" }));
});

frozen("the 12 old effects preview exactly as they did (t = 0.3 s of a 2 s effect at strength 0.8)", () => {
  // env = 1 (0.3 s is past the 0.15 s ramp). Computed from the formulas of the look round's spec, section 4.2.
  const at = (id: (typeof EFFECT_IDS)[number]) => effectPreview(id, 0.3, 2, 0.8);
  for (const id of ["glitch", "blur", "rgbSplit", "blurBox", "mosaicBox"] as const) expect(at(id)).toEqual(NOTHING);
  expect(at("flash")).toEqual(NOTHING);                                                   // 0.8 · max(0, 1 − 4·frac(0.6)) = 0
  expect(at("shake")).toEqual({ translateX: expect.closeTo(-0.02282535639108368, 12), translateY: expect.closeTo(-0.001040384407158269, 12), scale: expect.closeTo(1.048, 12), layers: [] });
  expect(at("zoomPulse")).toEqual({ ...NOTHING, scale: expect.closeTo(1.0868328157299976, 12) });      // 1 + 0.12·0.8·(0.5 − 0.5·cos(1.2π))
  expect(at("vhs").layers).toEqual([{ color: "#7A5CFF", opacity: expect.closeTo(0.096, 12) }]);        // 0.12 · 0.8
  expect(at("lightLeak").layers).toEqual([{ color: "#FFB347", opacity: expect.closeTo(0.2586099033699941, 12) }]);   // 0.35·0.8·(0.6 + 0.4·sin(0.3π))
  expect(at("oldFilm").layers).toEqual([{ color: "#C8A05A", opacity: expect.closeTo(0.24, 12) }, { color: "#000000", opacity: expect.closeTo(0.053589368503773584, 12) }]);
  expect(at("glow").layers).toEqual([{ color: "#FFFFFF", opacity: expect.closeTo(0.096, 12) }]);
});

frozen("the Swift that draws the existing looks is byte for byte what it was", () => {
  const effects = read("modules/clipy-video/ios/Effects.swift");
  const compositor = read("modules/clipy-video/ios/ClipyCompositor.swift");
  const renderer = read("modules/clipy-video/ios/EffectRenderer.swift");
  const math = read("modules/clipy-video/ios/EffectMath.swift");
  const blend = compositor.slice(compositor.indexOf("  static func blend("));
  expect({
    // the nineteen filter chains and how a chain is applied
    filterChains: sha(stretch(effects, "  static func filterChain(", "  /// 100×100 box", false)),
    // the filter block of `look`: chain, strength mix
    lookFilter: sha(stretch(compositor, "    let chain = Effects.filterChain(spec.filter)\n", "        : dissolve(from: img, to: filtered, progress: CGFloat(spec.filterIntensity)).cropped(to: img.extent)\n")),
    // fade, slide, zoom, slideRight, slideUp, slideDown, wipe, spin
    blendToSpin: sha(stretch(blend, "  static func blend(", "      return dissolve(from: spun, to: b, progress: p).cropped(to: rect)\n")),
    // blur, the default dissolve, and every helper after `blend` to the end of the file
    blendFromBlur: sha(blend.slice(blend.indexOf("    case \"blur\":"))),
    // the twelve effect cases
    effectCases: sha(stretch(renderer, "  static func apply(type:", "      return tiles.cropped(to: box).composited(over: image).cropped(to: rect)\n")),
    // regionRect, scaled, colorLayer, splitChannels, scanLines, number, generated
    effectHelpers: sha(stretch(renderer, "  /// A box given as fractions of the frame", "    return f.outputImage\n  }\n")),
    // frac, hash, envelope, shakeOffset, pulseScale, flashOpacity, leakAlpha, flickerAlpha, glitchSlice
    effectMath: sha(stretch(math, "  private static let tau = 2 * Double.pi", "      split: active ? EffectMath.glitchSplit * k : 0)\n  }\n")),
  }).toEqual({
    filterChains: "0282385060299221a75f9b32bacd7e82bcd8d67fc1f6c808aef4e53db83facb9",
    lookFilter: "8206bcd0eab60916964ce2f54bbce620b090cb221aff219ecef641595528338a",
    blendToSpin: "376c99799164b7b4ac39b0da0bb319f771ca9367212fe1d92a1b012f95a5233c",
    blendFromBlur: "deac533e53570a4f92fb67ce3a22d5dc9e2b8382e610474752ae5bedce8184b6",
    effectCases: "c1dbc5e21ecb8049276cae82a4236f1593665dd2beb6f7c37cf35d95ca8c8ce0",
    effectHelpers: "b5d1cef24eec7d99d02ff4399b250d97fa10a5ca7a6d2594937452f67fdac5d7",
    effectMath: "34c12745bd6e999e0f81abb40e377d522f07e65c84a8b55bda83491cee2b4ec6",
  });
});

frozen("the files this round never edits are untouched", () => {
  const files = ["src/editor/model/adjust.ts", "modules/clipy-video/ios/Adjust.swift", "src/editor/components/FilterLayer.tsx", "src/editor/components/AdjustLayer.tsx"];
  expect(Object.fromEntries(files.map((f) => [f, sha(read(f))]))).toEqual({
    "src/editor/model/adjust.ts": "0e729566a0bcb3e2ff7a5ae696db2d9394ba91ebb3968d4b91846f1bbefa1bf5",
    "modules/clipy-video/ios/Adjust.swift": "65782f10d7aa023e336fbc3fcdcf24dd1dd9ef865a8ce29dd3ea5c54e6b679ff",
    "src/editor/components/FilterLayer.tsx": "79069d3bb5816bfcce7da748dc38e3ba216cf267ae30c684b1f6a25f4be574be",
    "src/editor/components/AdjustLayer.tsx": "07276de7c73342c2abff33ef2b010fbb78bfd7bd613dc4f175054eebaf232075",
  });
});
