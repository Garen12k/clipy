import { BLEND_IDS, CHROMA, CHROMA_PRESETS, clampChroma, clampEffectRect, EFFECT_IDS, isRegionEffect, makeClip, makeEffect, makeLayer, makeProject, newLayer, newPhotoClip, newVideoClip, REGION_LIMITS, SCHEMA_VERSION } from "../types";

test("schema v12 constants", () => {
  expect(SCHEMA_VERSION).toBe(20);
  expect(BLEND_IDS).toEqual(["normal", "screen", "multiply", "overlay", "lighten", "darken"]);
  expect(CHROMA).toEqual({ hueBase: 12, hueRange: 48, soft: 10, minSat: 0.25, minVal: 0.2, defaultStrength: 0.5, cube: 32 });
  expect(CHROMA_PRESETS).toEqual(["#00FF00", "#0000FF"]);
  expect(REGION_LIMITS).toEqual({ min: 0.05, default: { x: 0.3, y: 0.4, w: 0.4, h: 0.2 } });
  expect(EFFECT_IDS.slice(10, 12)).toEqual(["blurBox", "mosaicBox"]);
  expect(isRegionEffect("blurBox")).toBe(true);
  expect(isRegionEffect("mosaicBox")).toBe(true);
  expect(isRegionEffect("blur")).toBe(false);
});

describe("clampChroma", () => {
  test("keeps a good key, clamps strength, keeps the colour string as given", () => {
    expect(clampChroma({ color: "#00ff00", strength: 0.3 })).toEqual({ color: "#00ff00", strength: 0.3 });
    expect(clampChroma({ color: "#00FF00", strength: 4 })).toEqual({ color: "#00FF00", strength: 1 });
    expect(clampChroma({ color: "#00FF00", strength: -1 })).toEqual({ color: "#00FF00", strength: 0 });
  });
  test("non-finite strength becomes the default; bad colour or shape becomes null", () => {
    expect(clampChroma({ color: "#00FF00", strength: NaN })?.strength).toBe(CHROMA.defaultStrength);
    expect(clampChroma({ color: "#00FF00" })?.strength).toBe(CHROMA.defaultStrength);
    for (const v of [null, undefined, 3, "x", { color: "green", strength: 1 }, { color: "#0F0", strength: 1 }, { strength: 1 }]) expect(clampChroma(v)).toBeNull();
  });
  test("idempotent", () => {
    const k = clampChroma({ color: "#0000ff", strength: 9 });
    expect(clampChroma(k)).toEqual(k);
  });
});

describe("clampEffectRect", () => {
  test("a good rect is untouched and not rounded", () => {
    expect(clampEffectRect({ x: 0.123456, y: 0.2, w: 0.3, h: 0.4 })).toEqual({ x: 0.123456, y: 0.2, w: 0.3, h: 0.4 });
  });
  test("sides clamp to [min, 1] and the origin stays inside the frame", () => {
    expect(clampEffectRect({ x: 0, y: 0, w: 0, h: 5 })).toEqual({ x: 0, y: 0, w: REGION_LIMITS.min, h: 1 });
    const r = clampEffectRect({ x: 0.9, y: -3, w: 0.5, h: 0.5 });
    expect(r.x).toBeCloseTo(0.5, 12);
    expect(r.y).toBe(0);
  });
  test("invalid becomes a fresh copy of the default", () => {
    for (const v of [null, undefined, 1, {}, { x: 0, y: 0, w: NaN, h: 1 }, { x: "0", y: 0, w: 1, h: 1 }]) {
      const r = clampEffectRect(v);
      expect(r).toEqual(REGION_LIMITS.default);
      expect(r).not.toBe(REGION_LIMITS.default);
    }
  });
});

test("factories default blend and chroma", () => {
  expect(newVideoClip({ id: "a", sourceUri: "u", sourceDuration: 5, width: 1, height: 1 })).toMatchObject({ blend: "normal", chroma: null });
  expect(newPhotoClip({ id: "a", sourceUri: "u", width: 1, height: 1 })).toMatchObject({ blend: "normal", chroma: null });
  expect(makeClip({ id: "a", sourceDuration: 5 })).toMatchObject({ blend: "normal", chroma: null });
  expect(makeLayer({ id: "l", sourceDuration: 5 })).toMatchObject({ blend: "normal", chroma: null });
  expect(makeProject().schemaVersion).toBe(20);
});

test("newLayer keeps the green screen as a copy", () => {
  const c = makeClip({ id: "a", sourceDuration: 5, chroma: { color: "#00FF00", strength: 0.5 } });
  const l = newLayer(c, 0);
  expect(l.chroma).toEqual({ color: "#00FF00", strength: 0.5 });
  expect(l.chroma).not.toBe(c.chroma);
});

test("makeEffect: region types get the default rect (a copy), others null, a given rect wins", () => {
  expect(makeEffect({ id: "e" }).rect).toBeNull();
  const r = makeEffect({ id: "e", type: "blurBox" }).rect;
  expect(r).toEqual(REGION_LIMITS.default);
  expect(r).not.toBe(REGION_LIMITS.default);
  expect(makeEffect({ id: "e", type: "mosaicBox" }).rect).toEqual(REGION_LIMITS.default);
  expect(makeEffect({ id: "e", type: "blurBox", rect: { x: 0, y: 0, w: 1, h: 1 } }).rect).toEqual({ x: 0, y: 0, w: 1, h: 1 });
});
