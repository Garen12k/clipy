import {
  ADJUST_KEYS, ADJUST_RANGE, clampAdjust, DEFAULT_ADJUST, EFFECT_IDS, EFFECT_LIMITS, FILTER_IDS, isNeutralAdjust, makeClip, makeEffect,
  makePhotoClip, makeProject, newPhotoClip, newVideoClip, SCHEMA_VERSION, TRANSITION_TYPES,
} from "../types";

test("registries have the spec sizes", () => {
  expect(SCHEMA_VERSION).toBe(9);
  expect(FILTER_IDS).toHaveLength(20);
  expect(TRANSITION_TYPES).toHaveLength(11);
  expect(EFFECT_IDS).toHaveLength(10);
  expect(ADJUST_KEYS).toHaveLength(12);
  expect(EFFECT_LIMITS).toEqual({ minDuration: 0.2, defaultDuration: 2, defaultIntensity: 0.7 });
});

test("clampAdjust fills missing keys with 0, clamps to ADJUST_RANGE, maps non-finite to 0, drops unknown keys", () => {
  expect(clampAdjust(undefined)).toEqual(DEFAULT_ADJUST);
  expect(clampAdjust({})).toEqual(DEFAULT_ADJUST);
  const out = clampAdjust({ brightness: 5, contrast: -5, sharpen: -1, grain: 9, vignette: 0.4, tint: Number.NaN, fade: Infinity, bogus: 3 } as never);
  expect(out).toMatchObject({ brightness: 1, contrast: -1, sharpen: 0, grain: 1, vignette: 0.4, tint: 0, fade: 0 });
  expect(Object.keys(out).sort()).toEqual([...ADJUST_KEYS].sort());
  for (const k of ADJUST_KEYS) { expect(out[k]).toBeGreaterThanOrEqual(ADJUST_RANGE[k][0]); expect(out[k]).toBeLessThanOrEqual(ADJUST_RANGE[k][1]); }
  expect(clampAdjust({ brightness: "x" } as never).brightness).toBe(0);
});

test("isNeutralAdjust is true only when every key is 0", () => {
  expect(isNeutralAdjust(DEFAULT_ADJUST)).toBe(true);
  expect(isNeutralAdjust({ ...DEFAULT_ADJUST, shadows: -0.2 })).toBe(false);
  expect(isNeutralAdjust({ ...DEFAULT_ADJUST, grain: 0.01 })).toBe(false);
});

test("factories carry fresh look defaults (no shared adjust object)", () => {
  const a = makeClip({ id: "a", sourceDuration: 4 });
  const b = makeClip({ id: "b", sourceDuration: 4 });
  expect(a.filterIntensity).toBe(1);
  expect(a.adjust).toEqual(DEFAULT_ADJUST);
  expect(a.adjust).not.toBe(b.adjust);
  expect(a.adjust).not.toBe(DEFAULT_ADJUST);
  const v = newVideoClip({ id: "v", sourceUri: "u", sourceDuration: 1, width: 1, height: 1 });
  const p = newPhotoClip({ id: "p", sourceUri: "u", width: 1, height: 1 });
  expect(v.adjust).not.toBe(p.adjust);
  expect(makePhotoClip({ id: "q" })).toMatchObject({ filterIntensity: 1, adjust: DEFAULT_ADJUST });
  expect(makeProject().effects).toEqual([]);
});

test("makeEffect defaults", () => {
  expect(makeEffect({ id: "e" })).toEqual({ id: "e", type: "shake", start: 0, end: 2, intensity: 0.7 });
  expect(makeEffect({ id: "e", type: "glow", end: 3 })).toMatchObject({ type: "glow", end: 3 });
});
