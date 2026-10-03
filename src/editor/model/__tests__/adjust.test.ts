import { DEFAULT_ADJUST, type ClipAdjust } from "../types";
import { ADJUST, adjustNeedsTag, adjustPreview, adjustRecipe } from "../adjust";
import { ADJUST_VECTORS } from "./adjust.vectors";

const A = (patch: Partial<ClipAdjust>): ClipAdjust => ({ ...DEFAULT_ADJUST, ...patch });

function expectClose(actual: unknown, expected: unknown): void {
  if (typeof expected === "number") { expect(actual).toBeCloseTo(expected, 6); return; }
  if (Array.isArray(expected)) {
    expect(Array.isArray(actual)).toBe(true);
    expect((actual as unknown[]).length).toBe(expected.length);
    expected.forEach((e, i) => expectClose((actual as unknown[])[i], e));
    return;
  }
  if (expected && typeof expected === "object") {
    expect(Object.keys(actual as object).sort()).toEqual(Object.keys(expected).sort());
    for (const [k, v] of Object.entries(expected)) expectClose((actual as Record<string, unknown>)[k], v);
    return;
  }
  expect(actual).toEqual(expected);
}

describe("adjustRecipe", () => {
  test.each(ADJUST_VECTORS.map((v) => [v.name, v] as const))("vector: %s", (_n, v) => {
    expectClose(adjustRecipe(v.adjust), v.recipe);
  });

  test("steps come in the fixed order", () => {
    const all = A({ brightness: 1, exposure: 1, temperature: 1, fade: 1, sharpen: 1, vignette: 1, grain: 1 });
    expect(adjustRecipe(all).map((s) => s.kind)).toEqual(
      ["exposure", "temperatureTint", "colorControls", "toneCurve", "sharpen", "vignette", "grain"]);
  });

  test("neutral steps are omitted", () => {
    expect(adjustRecipe(A({ tint: 0.2 })).map((s) => s.kind)).toEqual(["temperatureTint"]);
    expect(adjustRecipe(A({ contrast: 0.1 })).map((s) => s.kind)).toEqual(["colorControls"]);
    expect(adjustRecipe(A({ shadows: 0.1 })).map((s) => s.kind)).toEqual(["toneCurve"]);
  });

  test("tone curve y values stay within 0..1", () => {
    for (const adj of [A({ fade: 1, shadows: -1, highlights: 1 }), A({ shadows: 1, highlights: -1 })]) {
      const step = adjustRecipe(adj)[0];
      if (step.kind !== "toneCurve") throw new Error("expected toneCurve");
      for (const [, y] of step.points) { expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(1); }
    }
  });
});

describe("adjustPreview", () => {
  const layers = (a: ClipAdjust) => adjustPreview(a).layers;

  test("neutral gives nothing", () => {
    expect(adjustPreview(A({}))).toEqual({ layers: [], vignette: 0 });
  });
  test("brightness +1 is a white 0.25 layer", () => {
    expect(layers(A({ brightness: 1 }))).toEqual([{ key: "light", color: "#FFFFFF", opacity: 0.25 }]);
  });
  test("brightness and exposure combine and cap at 0.5", () => {
    const l = layers(A({ brightness: -1, exposure: -1 }));
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ key: "light", color: "#000000" });
    expect(l[0].opacity).toBeCloseTo(0.5, 9);
  });
  test("temperature colours", () => {
    expect(layers(A({ temperature: 1 }))).toEqual([{ key: "temperature", color: "#FF9A3C", opacity: 0.25 }]);
    expect(layers(A({ temperature: -1 }))).toEqual([{ key: "temperature", color: "#3C8CFF", opacity: 0.25 }]);
  });
  test("tint colours", () => {
    const warm = layers(A({ tint: 1 }));
    expect(warm[0]).toMatchObject({ key: "tint", color: "#FF4FD8" });
    expect(warm[0].opacity).toBeCloseTo(0.18, 9);
    expect(layers(A({ tint: -1 }))[0]).toMatchObject({ key: "tint", color: "#4FFF7A" });
  });
  test("negative saturation greys, positive adds no layer", () => {
    const l = layers(A({ saturation: -1 }));
    expect(l[0]).toMatchObject({ key: "saturation", color: "#808080" });
    expect(l[0].opacity).toBeCloseTo(0.55, 9);
    expect(layers(A({ saturation: 1 }))).toEqual([]);
  });
  test("fade greys at 0.25", () => {
    expect(layers(A({ fade: 1 }))).toEqual([{ key: "fade", color: "#9A9A9A", opacity: 0.25 }]);
  });
  test("vignette is 0.6 v", () => {
    expect(adjustPreview(A({ vignette: 0.5 })).vignette).toBeCloseTo(0.3, 9);
    expect(adjustPreview(A({ vignette: 0.5 })).layers).toEqual([]);
  });
  test("layer order is light, temperature, tint, saturation, fade", () => {
    const l = layers(A({ fade: 1, saturation: -1, tint: 1, temperature: 1, brightness: 1 }));
    expect(l.map((x) => x.key)).toEqual(["light", "temperature", "tint", "saturation", "fade"]);
  });
});

test("adjustNeedsTag", () => {
  expect(adjustNeedsTag(A({}))).toBe(false);
  expect(adjustNeedsTag(A({ grain: 0.1 }))).toBe(true);
});

test("constants", () => { expect(ADJUST.neutral).toBe(6500); });
