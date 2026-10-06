import { FILTERS } from "@/src/editor/effects";
import { adjustRecipe } from "../adjust";
import { BEFORE_TONE, FILTER_RECIPES, RECIPE_FILTER_IDS, filterPreviewOf, filterStages, filterSteps, isRecipeFilter, type FilterStep } from "../filterRecipes";
import { ADJUST_KEYS, ADJUST_RANGE, clampAdjust, DEFAULT_ADJUST, FILTER_IDS, isHexColor } from "../types";
import { FILTER_VECTORS } from "./filterRecipes.vectors";

/** A step as its numbers and strings, in declaration order. */
const flat = (s: FilterStep): (number | string)[] => {
  switch (s.kind) {
    case "exposure": return [s.ev];
    case "temperatureTint": return [...s.neutral, ...s.target];
    case "colorControls": return [s.brightness, s.contrast, s.saturation];
    case "toneCurve": return s.points.flat();
    case "sharpen": return [s.sharpness];
    case "vignette": return [s.intensity, s.radius];
    case "grain": return [s.opacity];
    case "splitTone": return [s.shadow, s.highlight, s.amount];
  }
};

test("the twelve recipe filters are the twelve ids after the old twenty, with one-word labels", () => {
  expect(FILTER_IDS).toHaveLength(32);
  expect(FILTER_IDS.slice(20)).toEqual([...RECIPE_FILTER_IDS]);
  expect(Object.keys(FILTER_RECIPES)).toEqual([...RECIPE_FILTER_IDS]);
  expect(RECIPE_FILTER_IDS.map((id) => FILTERS[id].label)).toEqual(["Kodak", "Fuji", "Matte", "Bleach", "Dusk", "Moody", "Cinema", "Blush", "Grit", "Silver", "Indigo", "Drama"]);
  // A filter tile is 52 pt wide: one short word.
  for (const id of RECIPE_FILTER_IDS) { expect(FILTERS[id].label).toMatch(/^[A-Z][a-z]{2,6}$/); expect(isRecipeFilter(id)).toBe(true); }
  for (const id of FILTER_IDS.slice(0, 20)) expect(isRecipeFilter(id)).toBe(false);
  expect(new Set(FILTER_IDS.map((id) => FILTERS[id].label)).size).toBe(32);          // no label twice
});

test("every row is inside the Adjust ranges, its colours are #RRGGBB, its amount and veil are fractions", () => {
  for (const id of RECIPE_FILTER_IDS) {
    const r = FILTER_RECIPES[id];
    for (const [k, v] of Object.entries(r.adjust)) {
      expect(ADJUST_KEYS).toContain(k);
      const [lo, hi] = ADJUST_RANGE[k as keyof typeof ADJUST_RANGE];
      expect(v).toBeGreaterThanOrEqual(lo); expect(v).toBeLessThanOrEqual(hi); expect(v).not.toBe(0);
    }
    if (r.tone) { expect(isHexColor(r.tone.shadow)).toBe(true); expect(isHexColor(r.tone.highlight)).toBe(true); expect(r.tone.amount).toBeGreaterThan(0); expect(r.tone.amount).toBeLessThanOrEqual(1); }
    expect(isHexColor(r.veil.color)).toBe(true); expect(r.veil.opacity).toBeGreaterThanOrEqual(0); expect(r.veil.opacity).toBeLessThanOrEqual(0.5);
  }
  expect(RECIPE_FILTER_IDS.filter((id) => FILTER_RECIPES[id].tone)).toEqual(["kodak", "fuji", "dusk", "tealOrange", "blush", "indigo"]);   // six need the split tone, six do not
});

test("every row goes through the Adjust clamp unchanged (a value the pipeline would clamp is a bug), and both stages do too", () => {
  for (const id of RECIPE_FILTER_IDS) {
    const row = { ...DEFAULT_ADJUST, ...FILTER_RECIPES[id].adjust };
    expect(clampAdjust(row)).toEqual(row);
    const s = filterStages(id)!;
    expect(clampAdjust(s.before)).toEqual(s.before); expect(clampAdjust(s.after)).toEqual(s.after);
  }
});

test.each(FILTER_VECTORS.map((v) => [v.id, v] as const))("steps: %s", (_id, v) => {
  const got = filterSteps(v.id);
  expect(got.map((s) => s.kind)).toEqual(v.steps.map((s) => s.kind));
  got.forEach((step, i) => {
    const want = flat(v.steps[i]);
    expect(flat(step)).toHaveLength(want.length);
    flat(step).forEach((n, j) => (typeof n === "number" ? expect(n).toBeCloseTo(want[j] as number, 9) : expect(n).toBe(want[j])));
  });
});

test("one vector per filter; the two stages are the untouched adjustRecipe; the tone sits between them", () => {
  expect(FILTER_VECTORS.map((v) => v.id)).toEqual([...RECIPE_FILTER_IDS]);
  expect(BEFORE_TONE).toEqual(["exposure", "temperature", "tint", "brightness", "contrast", "saturation"]);
  for (const id of RECIPE_FILTER_IDS) {
    const s = filterStages(id)!;
    expect({ ...DEFAULT_ADJUST, ...FILTER_RECIPES[id].adjust }).toEqual(Object.fromEntries(ADJUST_KEYS.map((k) => [k, BEFORE_TONE.includes(k) ? s.before[k] : s.after[k]])));
    for (const k of ADJUST_KEYS) expect(BEFORE_TONE.includes(k) ? s.after[k] : s.before[k]).toBe(0);
    const tone = s.tone ? [{ kind: "splitTone", ...s.tone }] : [];
    expect(filterSteps(id)).toEqual([...adjustRecipe(s.before), ...tone, ...adjustRecipe(s.after)]);
    // Colour first, finish last: nothing of the colour stage comes after the tone.
    const kinds = filterSteps(id).map((x) => x.kind), at = kinds.indexOf("splitTone");
    if (at >= 0) { expect(kinds.slice(at + 1).some((k) => ["exposure", "temperatureTint", "colorControls"].includes(k))).toBe(false); expect(kinds.slice(0, at).some((k) => ["toneCurve", "sharpen", "vignette", "grain"].includes(k))).toBe(false); }
  }
});

test("an old filter, None, null and an unknown id have no recipe steps (they are drawn as they always were)", () => {
  for (const id of [...FILTER_IDS.slice(0, 20), null, undefined, "sparkle"]) { expect(filterSteps(id)).toEqual([]); expect(filterStages(id)).toBeNull(); }
});

test("the preview recipe is computed from the row: the veil, 1 + saturation, 0.25·brightness + 0.1·fade", () => {
  // kodak: 1 + 0.15 ; 0.1·0.08 = 0.008        matte: 0.8 ; 0.1·0.7 = 0.07        bleach: 0.45 ; 0.25·−0.05 = −0.0125
  expect(filterPreviewOf("kodak")).toEqual({ tint: "#D6C436", tintOpacity: 0.26, saturation: 1.15, brightness: 0.008 });
  expect(filterPreviewOf("matte")).toEqual({ tint: "#7F8A98", tintOpacity: 0.22, saturation: 0.8, brightness: 0.07 });
  expect(filterPreviewOf("bleach")).toEqual({ tint: "#000000", tintOpacity: 0, saturation: 0.45, brightness: -0.0125 });
  // blush: 0.85 ; 0.25·0.2 + 0.1·0.3 = 0.08        silver: 0 ; 0.045        drama: 0.75 ; −0.0375
  expect(filterPreviewOf("blush")).toEqual({ tint: "#FFB3C7", tintOpacity: 0.18, saturation: 0.85, brightness: 0.08 });
  expect(filterPreviewOf("silver")).toEqual({ tint: "#C9CED6", tintOpacity: 0.14, saturation: 0, brightness: 0.045 });
  expect(filterPreviewOf("drama")).toEqual({ tint: "#000000", tintOpacity: 0.2, saturation: 0.75, brightness: -0.0375 });
  for (const id of RECIPE_FILTER_IDS) expect(FILTERS[id].preview).toEqual(filterPreviewOf(id));
  for (const id of ["grit", "silver", "indigo"] as const) expect(FILTERS[id].preview.saturation).toBe(0);      // the three black-and-whites
});

test("Kodak's thumbnail is not Warm's and Matte's is not Faded's: on mid grey they differ by at least 12 / 255 in some channel", () => {
  const channels = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  /** What FilterLayer's three layers (grey, tint, white / black) leave of a mid-grey picture at full strength, 0…255 per channel. */
  const onGrey = (id: keyof typeof FILTERS): number[] => {
    const p = FILTERS[id].preview;
    const grey = Math.max(0, Math.min(0.55, 0.55 * (1 - p.saturation)));
    return channels(p.tint).map((tint) => {
      const desaturated = 128 * (1 - grey) + 128 * grey;
      const tinted = desaturated * (1 - p.tintOpacity) + tint * p.tintOpacity;
      return tinted * (1 - Math.abs(p.brightness)) + (p.brightness >= 0 ? 255 : 0) * Math.abs(p.brightness);
    });
  };
  const apart = (a: keyof typeof FILTERS, b: keyof typeof FILTERS) => Math.max(...onGrey(a).map((v, i) => Math.abs(v - onGrey(b)[i])));
  expect(apart("kodak", "warm")).toBeGreaterThanOrEqual(12);
  expect(apart("matte", "faded")).toBeGreaterThanOrEqual(12);
  // The two old neighbours are what they were.
  expect(FILTERS.warm.preview).toEqual({ tint: "#FF9A3C", tintOpacity: 0.14, saturation: 1.1, brightness: 0.02 });
  expect(FILTERS.faded.preview).toEqual({ tint: "#FFFFFF", tintOpacity: 0.12, saturation: 0.7, brightness: 0.08 });
});
