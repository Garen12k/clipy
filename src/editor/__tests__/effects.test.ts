import { readFileSync } from "fs";
import { join } from "path";
import { ANIM_COMBO, ANIM_IN, ANIM_LOOP, BLENDS, CAPTION_STYLE, EFFECTS, FILTERS, SHAPES, SPEED_CURVES, STICKER_EMOJI_SCALE, STICKER_SHAPE_SCALE, TRANSITIONS } from "../effects";
import { ANIM_COMBO_IDS, ANIM_IN_IDS, ANIM_LOOP_IDS, BLEND_IDS, EFFECT_IDS, FILTER_IDS, SHAPE_IDS, SPEED_CURVE_IDS, SPEED_CURVE_LIMITS, SPEED_LIMITS, TRANSITION_TYPES, type ShapeId } from "../model/types";

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
  expect(FILTER_IDS).toHaveLength(32);
  for (const id of FILTER_IDS) {
    const f = FILTERS[id];
    expect(f.label.length).toBeGreaterThan(0);
    expect(f.preview.tintOpacity).toBeGreaterThanOrEqual(0); expect(f.preview.tintOpacity).toBeLessThanOrEqual(0.5);
    expect(f.preview.saturation).toBeGreaterThanOrEqual(0); expect(f.preview.saturation).toBeLessThanOrEqual(2);
    expect(Math.abs(f.preview.brightness)).toBeLessThanOrEqual(0.3);
  }
  expect(FILTERS.none.preview).toEqual({ tint: "#000000", tintOpacity: 0, saturation: 1, brightness: 0 });
  expect(TRANSITION_TYPES).toHaveLength(21);
  for (const t of TRANSITION_TYPES) expect(TRANSITIONS[t].label.length).toBeGreaterThan(0);
});

test("shape paths use only absolute M/L/C/Q/Z commands in a 100×100 box", () => {
  expect(SHAPE_IDS).toHaveLength(20);
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
  expect(EFFECT_IDS).toHaveLength(20);
  for (const id of EFFECT_IDS) { expect(EFFECTS[id].label.length).toBeGreaterThan(0); expect(EFFECTS[id].icon.length).toBeGreaterThan(0); }
  expect(EFFECT_IDS.map((id) => EFFECTS[id].label)).toEqual(["Glitch", "Shake", "Zoom pulse", "Blur", "VHS", "Light leak", "Flash", "RGB split", "Old film", "Glow", "Blur box", "Mosaic box",
    "Film burn", "Lens flare", "Dust", "Heartbeat", "Hue shift", "Mirror", "Soft edges", "Strobe"]);
  expect(EFFECT_IDS.slice(12).map((id) => EFFECTS[id].icon)).toEqual(["flame-outline", "aperture-outline", "snow-outline", "fitness-outline", "color-palette-outline", "swap-horizontal-outline", "ellipse-outline", "flashlight-outline"]);
  expect(TRANSITION_TYPES.slice(11).map((t) => TRANSITIONS[t].label)).toEqual(["Cover left", "Reveal left", "Cover up", "Reveal down", "Circle open", "Circle close", "Diagonal wipe", "Clock wipe", "Pixelate", "White flash"]);
  // Under a 72-pt tile: at most two words, sentence case.
  for (const id of EFFECT_IDS) { expect(EFFECTS[id].label.split(" ").length).toBeLessThanOrEqual(2); expect(EFFECTS[id].icon.endsWith("-outline")).toBe(true); }
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

test("every filter has its export recipe in exactly one place: the nineteen old ones a case in Effects.filterChain, the twelve of 2026-10-06 a row in FilterRecipes.swift", () => {
  const recipes = readFileSync(join(__dirname, "../../../modules/clipy-video/ios/FilterRecipes.swift"), "utf8");
  for (const id of FILTER_IDS.slice(1, 20)) { expect(swift).toContain(`case "${id}":`); expect(recipes).not.toContain(`"${id}": FilterRecipe(`); }
  for (const id of FILTER_IDS.slice(20)) { expect(recipes).toContain(`"${id}": FilterRecipe(`); expect(swift).not.toContain(`case "${id}":`); }
  expect(FILTER_IDS.slice(20)).toHaveLength(12);
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

test("speed curve presets: six of them, eight speeds each inside the speed limits, as specified", () => {
  expect(SPEED_CURVE_IDS).toHaveLength(6);
  expect(Object.keys(SPEED_CURVES).sort()).toEqual([...SPEED_CURVE_IDS].sort());
  for (const id of SPEED_CURVE_IDS) {
    expect(SPEED_CURVES[id].label.length).toBeGreaterThan(0);
    expect(SPEED_CURVES[id].shape).toHaveLength(SPEED_CURVE_LIMITS.slices);
    for (const s of SPEED_CURVES[id].shape) { expect(s).toBeGreaterThanOrEqual(SPEED_LIMITS[0]); expect(s).toBeLessThanOrEqual(SPEED_LIMITS[1]); }
  }
  expect(SPEED_CURVE_IDS.map((id) => SPEED_CURVES[id].label)).toEqual(["Montage", "Hero", "Bullet", "Jump cut", "Flash in", "Flash out"]);
  expect(SPEED_CURVES.montage.shape).toEqual([2.5, 2.5, 0.5, 2.5, 2.5, 0.5, 2.5, 2.5]);
  expect(SPEED_CURVES.hero.shape).toEqual([1, 2, 3, 0.5, 0.5, 3, 2, 1]);
  expect(SPEED_CURVES.bullet.shape).toEqual([3.5, 3.5, 3.5, 0.3, 0.3, 3.5, 3.5, 3.5]);
  expect(SPEED_CURVES.jumpCut.shape).toEqual([1, 4, 1, 4, 1, 4, 1, 4]);
  expect(SPEED_CURVES.flashIn.shape).toEqual([4, 3, 2, 1.5, 1, 1, 1, 1]);
  expect(SPEED_CURVES.flashOut.shape).toEqual([1, 1, 1, 1, 1.5, 2, 3, 4]);
});

test("blend registry covers every blend id with the specified labels", () => {
  expect(BLEND_IDS).toHaveLength(6);
  expect(BLEND_IDS.map((id) => BLENDS[id].label)).toEqual(["Normal", "Screen", "Multiply", "Overlay", "Lighten", "Darken"]);
});

/** Each subpath's signed area over its end points (shoelace): above 0 = clockwise in the y-down SVG box, below 0 = counter-clockwise. */
function turns(d: string): number[] {
  return d.split("M").filter((s) => s.trim().length > 0).map((sub) => {
    const t = sub.replace(/([LCQZ])/g, " $1 ").trim().split(/\s+/);
    const pts: [number, number][] = [[Number(t[0]), Number(t[1])]];
    for (let k = 2; k < t.length && t[k] !== "Z";) {
      const skip = t[k] === "L" ? 0 : t[k] === "Q" ? 2 : 4;        // the control points that come before the end point
      pts.push([Number(t[k + 1 + skip]), Number(t[k + 2 + skip])]);
      k += 3 + skip;
    }
    return pts.reduce((a, [x, y], j) => { const [nx, ny] = pts[(j + 1) % pts.length]; return a + x * ny - nx * y; }, 0) / 2;
  });
}
// One subpath: a move, then segments that each name their command (L: one point, Q: two, C: three), then Z.
const SUBPATH = /^M[\d.]+ [\d.]+(?: (?:L[\d.]+ [\d.]+|Q[\d.]+(?: [\d.]+){3}|C[\d.]+(?: [\d.]+){5}))+ Z$/;
/** The subpaths (by index) that are holes. */
const HOLES: Partial<Record<ShapeId, number[]>> = { frameRounded: [1], ring: [1] };

test("twenty shapes: the first seven as they were, then the thirteen of 2026-10-06, each with its own label of at most two words", () => {
  expect(SHAPE_IDS).toEqual(["circle", "square", "roundedBox", "arrow", "star", "speechBubble", "heart",
    "arrowCurved", "arrowDouble", "bubbleRound", "bubbleSquare", "bubbleThought", "badgeSeal", "badgeRibbon", "banner", "sparkle", "burst", "frameRounded", "ring", "brackets"]);
  expect(Object.keys(SHAPES)).toEqual([...SHAPE_IDS]);
  expect(SHAPE_IDS.map((id) => SHAPES[id].label)).toEqual(["Circle", "Square", "Box", "Arrow", "Star", "Bubble", "Heart",
    "Curved arrow", "Two-way arrow", "Round bubble", "Sharp bubble", "Thought bubble", "Seal badge", "Award ribbon", "Banner", "Sparkle", "Burst", "Frame", "Ring", "Corner marks"]);
  expect(SHAPES.circle.path).toBe("M50 0 C77.6 0 100 22.4 100 50 C100 77.6 77.6 100 50 100 C22.4 100 0 77.6 0 50 C0 22.4 22.4 0 50 0 Z");   // an old one, untouched
  expect(SHAPES.heart.path).toBe("M50 90 C20 65 0 50 0 30 C0 13 13 0 28 0 C38 0 46 6 50 14 C54 6 62 0 72 0 C87 0 100 13 100 30 C100 50 80 65 50 90 Z");
});

test("the seven shapes of before 2026-10-06 are character for character what saved projects were drawn with (id, label, path, size rule)", () => {
  // Copied from the registry as it stood at 3479ea2: a saved sticker must draw exactly as before.
  expect(SHAPE_IDS.slice(0, 7).map((id) => [id, SHAPES[id].label, SHAPES[id].path])).toEqual([
    ["circle", "Circle", "M50 0 C77.6 0 100 22.4 100 50 C100 77.6 77.6 100 50 100 C22.4 100 0 77.6 0 50 C0 22.4 22.4 0 50 0 Z"],
    ["square", "Square", "M0 0 L100 0 L100 100 L0 100 Z"],
    ["roundedBox", "Box", "M20 0 L80 0 C91 0 100 9 100 20 L100 80 C100 91 91 100 80 100 L20 100 C9 100 0 91 0 80 L0 20 C0 9 9 0 20 0 Z"],
    ["arrow", "Arrow", "M0 35 L60 35 L60 10 L100 50 L60 90 L60 65 L0 65 Z"],
    ["star", "Star", "M50 0 L61 35 L98 35 L68 57 L79 91 L50 70 L21 91 L32 57 L2 35 L39 35 Z"],
    ["speechBubble", "Bubble", "M10 0 L90 0 C95.5 0 100 4.5 100 10 L100 60 C100 65.5 95.5 70 90 70 L40 70 L20 90 L25 70 L10 70 C4.5 70 0 65.5 0 60 L0 10 C0 4.5 4.5 0 10 0 Z"],
    ["heart", "Heart", "M50 90 C20 65 0 50 0 30 C0 13 13 0 28 0 C38 0 46 6 50 14 C54 6 62 0 72 0 C87 0 100 13 100 30 C100 50 80 65 50 90 Z"],
  ]);
  expect(STICKER_SHAPE_SCALE).toBe(0.2);
});

test("every segment names its command (the Swift parser and `turns` both rely on it) and every subpath is closed", () => {
  for (const id of SHAPE_IDS) {
    const subs = SHAPES[id].path.split("M").filter((s) => s.trim().length > 0);
    for (const sub of subs) {
      expect(sub.trim().endsWith("Z")).toBe(true);
      expect(`M${sub}`.trim()).toMatch(SUBPATH);
    }
  }
});

test("subpath directions: everything clockwise, the declared holes counter-clockwise — a hole is a hole under non-zero AND even-odd", () => {
  for (const id of SHAPE_IDS) {
    turns(SHAPES[id].path).forEach((area, i) => {
      const hole = HOLES[id]?.includes(i) ?? false;
      expect([id, i, hole ? area < 0 : area > 0]).toEqual([id, i, true]);
    });
  }
  expect(Object.fromEntries(SHAPE_IDS.map((id) => [id, turns(SHAPES[id].path).length] as const).filter(([, n]) => n !== 1)))
    .toEqual({ bubbleThought: 3, badgeRibbon: 3, frameRounded: 2, ring: 2, brackets: 4 });
  expect(turns(SHAPES.ring.path)).toEqual([5000, -2592]);                 // by hand, over the four ends of the arcs (a square on its corner): 2 × 50² outside, −2 × 36² inside
  expect(turns(SHAPES.brackets.path)).toEqual([500, 500, 500, 500]);      // each corner: 30 × 10 + 10 × 20
});
