import { readFileSync } from "fs";
import { join } from "path";
import { ANIM_COMBO, ANIM_IN, ANIM_LOOP, CAPTION_STYLE, EFFECTS, FILTERS, SHAPES, STICKER_EMOJI_SCALE, STICKER_SHAPE_SCALE, TRANSITIONS } from "../effects";
import { ANIM_COMBO_IDS, ANIM_IN_IDS, ANIM_LOOP_IDS, EFFECT_IDS, FILTER_IDS, SHAPE_IDS, TRANSITION_TYPES } from "../model/types";

const swift = readFileSync(join(__dirname, "../../../modules/clipy-video/ios/Effects.swift"), "utf8");
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const swiftStringArray = (name: string): string[] => {
  const m = swift.match(new RegExp(`static let ${name} = \\[([^\\]]*)\\]`));
  if (!m) throw new Error(`Effects.swift: ${name} not found`);
  return [...m[1].matchAll(/"([^"]*)"/g)].map((x) => x[1]);
};
const swiftNumber = (name: string): number => {
  const m = swift.match(new RegExp(`static let ${name}(?::\\s*\\w+)?\\s*=\\s*([0-9.]+)`));
  if (!m) throw new Error(`Effects.swift: ${name} not found`);
  return Number(m[1]);
};

test("registry covers every id with sane preview params", () => {
  expect(FILTER_IDS).toHaveLength(20);
  for (const id of FILTER_IDS) {
    const f = FILTERS[id];
    expect(f.label.length).toBeGreaterThan(0);
    expect(f.preview.tintOpacity).toBeGreaterThanOrEqual(0); expect(f.preview.tintOpacity).toBeLessThanOrEqual(0.5);
    expect(f.preview.saturation).toBeGreaterThanOrEqual(0); expect(f.preview.saturation).toBeLessThanOrEqual(2);
    expect(Math.abs(f.preview.brightness)).toBeLessThanOrEqual(0.3);
  }
  expect(FILTERS.none.preview).toEqual({ tint: "#000000", tintOpacity: 0, saturation: 1, brightness: 0 });
  expect(TRANSITION_TYPES).toHaveLength(11);
  for (const t of TRANSITION_TYPES) expect(TRANSITIONS[t].label.length).toBeGreaterThan(0);
});

test("shape paths use only absolute M/L/C/Q/Z commands in a 100×100 box", () => {
  expect(SHAPE_IDS).toHaveLength(7);
  for (const id of SHAPE_IDS) {
    const path = SHAPES[id].path;
    expect(path.startsWith("M")).toBe(true);
    expect(path.trim().endsWith("Z")).toBe(true);
    expect(path).toMatch(/^[MLCQZ0-9 .-]+$/);
    for (const n of path.match(/-?\d+(\.\d+)?/g) ?? []) { expect(Number(n)).toBeGreaterThanOrEqual(0); expect(Number(n)).toBeLessThanOrEqual(100); }
  }
});

test("Effects.swift mirrors the TS registry (shape paths verbatim, ids, sticker scales)", () => {
  for (const id of SHAPE_IDS) {
    expect(swift).toMatch(new RegExp(`"${id}":\\s*"${escapeRe(SHAPES[id].path)}"`));
  }
  const swiftShapeIds = [...(swift.match(/static let shapePaths[^=]*= \[[^\]]*\]/)?.[0] ?? "").matchAll(/"(\w+)":/g)].map((x) => x[1]);
  expect([...swiftShapeIds].sort()).toEqual([...SHAPE_IDS].sort());
  expect(swiftStringArray("filterIds")).toEqual([...FILTER_IDS]);
  expect(swiftStringArray("transitionTypes")).toEqual([...TRANSITION_TYPES]);
  expect(swiftStringArray("effectIds")).toEqual([...EFFECT_IDS]);
  expect(swiftNumber("stickerEmojiScale")).toBe(STICKER_EMOJI_SCALE);
  expect(swiftNumber("stickerShapeScale")).toBe(STICKER_SHAPE_SCALE);
});

test("caption style default", () => {
  expect(CAPTION_STYLE).toEqual({ fontId: "montserrat", fontScale: 0.045, color: "#FFFFFF", background: { color: "#000000", opacity: 0.6 }, outline: false, align: "center", x: 0.5, y: 0.86 });
});

test("effects registry covers every effect id; labels as specified", () => {
  expect(EFFECT_IDS).toHaveLength(10);
  for (const id of EFFECT_IDS) { expect(EFFECTS[id].label.length).toBeGreaterThan(0); expect(EFFECTS[id].icon.length).toBeGreaterThan(0); }
  expect(EFFECT_IDS.map((id) => EFFECTS[id].label)).toEqual(["Glitch", "Shake", "Zoom pulse", "Blur", "VHS", "Light leak", "Flash", "RGB split", "Old film", "Glow"]);
  expect(TRANSITIONS.slide.label).toBe("Slide left");
  expect(TRANSITIONS.slideRight.label).toBe("Slide right");
});

test("animation registries cover every id with the specified labels", () => {
  expect(ANIM_IN_IDS).toHaveLength(10); expect(ANIM_COMBO_IDS).toHaveLength(6); expect(ANIM_LOOP_IDS).toHaveLength(6);
  for (const id of ANIM_IN_IDS) { expect(ANIM_IN[id].label.length).toBeGreaterThan(0); expect(ANIM_IN[id].icon.length).toBeGreaterThan(0); }
  for (const id of ANIM_COMBO_IDS) { expect(ANIM_COMBO[id].label.length).toBeGreaterThan(0); expect(ANIM_COMBO[id].icon.length).toBeGreaterThan(0); }
  for (const id of ANIM_LOOP_IDS) { expect(ANIM_LOOP[id].label.length).toBeGreaterThan(0); expect(ANIM_LOOP[id].icon.length).toBeGreaterThan(0); }
  expect(ANIM_IN_IDS.map((id) => ANIM_IN[id].label)).toEqual(["Fade", "Slide left", "Slide right", "Slide up", "Slide down", "Zoom in", "Zoom out", "Spin", "Pop", "Rise"]);
  expect(ANIM_COMBO_IDS.map((id) => ANIM_COMBO[id].label)).toEqual(["Slow zoom in", "Slow zoom out", "Pan left", "Pan right", "Sway", "Pulse"]);
  expect(ANIM_LOOP_IDS.map((id) => ANIM_LOOP[id].label)).toEqual(["Wiggle", "Pulse", "Spin", "Float", "Blink", "Shake"]);
});

test("every non-none filter id has a recipe case in Effects.swift filterChain", () => {
  for (const id of FILTER_IDS) if (id !== "none") expect(swift).toContain(`case "${id}":`);
});

test("every transition type except none / dissolve has its own case inside ClipyCompositor.blend", () => {
  const compositor = readFileSync(join(__dirname, "../../../modules/clipy-video/ios/ClipyCompositor.swift"), "utf8");
  // Only the body of `blend`: from its declaration to the next `static func`, so a case elsewhere cannot satisfy this.
  const start = compositor.indexOf("static func blend(");
  expect(start).toBeGreaterThanOrEqual(0);
  const next = compositor.indexOf("static func ", start + 1);
  const body = compositor.slice(start, next === -1 ? undefined : next);
  const cases = [...body.matchAll(/case "(\w+)":/g)].map((m) => m[1]);
  const expected = TRANSITION_TYPES.filter((t) => t !== "none" && t !== "dissolve");
  expect([...cases].sort()).toEqual([...expected].sort());   // no missing, duplicate or unknown case
  expect(body).toMatch(/default:\s*\n\s*return dissolve\(/);   // unknown types (and "dissolve") still dissolve
});
