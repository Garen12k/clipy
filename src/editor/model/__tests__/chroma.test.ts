import { CHROMA, CHROMA_PRESETS } from "../types";
import { chromaAlpha, hexToRgb, hueDistance, rgbToHsv } from "../chroma";
import { ALPHA_VECTORS, HEX_VECTORS, HSV_VECTORS, HUE_DISTANCE_VECTORS } from "./chroma.vectors";

test("CHROMA matches the spec", () => {
  expect(CHROMA).toEqual({ hueBase: 12, hueRange: 48, soft: 10, minSat: 0.25, minVal: 0.2, defaultStrength: 0.5, cube: 32 });
});

describe("rgbToHsv", () => {
  test.each(HSV_VECTORS)("$name", (v) => {
    const out = rgbToHsv(v.r, v.g, v.b);
    expect(out.h).toBeCloseTo(v.h, 9);
    expect(out.s).toBeCloseTo(v.s, 9);
    expect(out.v).toBeCloseTo(v.v, 9);
  });

  test("the hue is always in [0, 360)", () => {
    for (let r = 0; r <= 1; r += 0.125) for (let g = 0; g <= 1; g += 0.125) for (let b = 0; b <= 1; b += 0.125) {
      const { h, s, v } = rgbToHsv(r, g, b);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
      expect(s).toBeGreaterThanOrEqual(0); expect(s).toBeLessThanOrEqual(1);
      expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1);
    }
    expect(rgbToHsv(1, 0, 1e-18).h).toBeLessThan(360);   // a hair below 0 must not round up to 360
  });
});

describe("hexToRgb", () => {
  test.each(HEX_VECTORS)("$name", (v) => {
    const out = hexToRgb(v.hex);
    if (v.rgb === null) { expect(out).toBeNull(); return; }
    expect(out).not.toBeNull();
    expect(out!.r).toBeCloseTo(v.rgb.r, 9);
    expect(out!.g).toBeCloseTo(v.rgb.g, 9);
    expect(out!.b).toBeCloseTo(v.rgb.b, 9);
  });

  test("a non-string is null", () => {
    expect(hexToRgb(undefined as never)).toBeNull();
    expect(hexToRgb(65280 as never)).toBeNull();
  });
});

describe("hueDistance", () => {
  test.each(HUE_DISTANCE_VECTORS)("hueDistance($a, $b) = $d", (v) => {
    expect(hueDistance(v.a, v.b)).toBeCloseTo(v.d, 9);
  });
});

describe("chromaAlpha", () => {
  test.each(ALPHA_VECTORS)("$name", (v) => {
    expect(chromaAlpha(v.r, v.g, v.b, v.key, v.strength)).toBeCloseTo(v.alpha, 9);
  });

  test("each preset keys its own colour away and keeps the other", () => {
    const [green, blue] = CHROMA_PRESETS;
    expect(chromaAlpha(0, 1, 0, green, CHROMA.defaultStrength)).toBe(0);
    expect(chromaAlpha(0, 0, 1, blue, CHROMA.defaultStrength)).toBe(0);
    expect(chromaAlpha(0, 0, 1, green, CHROMA.defaultStrength)).toBe(1);
    expect(chromaAlpha(0, 1, 0, blue, CHROMA.defaultStrength)).toBe(1);
  });

  test("always a finite number in 0…1, whatever comes in", () => {
    for (const s of [NaN, Infinity, -Infinity, -1, 0, 0.3, 1, 7]) {
      for (const px of [[0, 1, 0], [NaN, 1, 0], [0.5, 1, 0], [Infinity, -2, 0.4], [0.3, 0.3, 0.3]]) {
        const alpha = chromaAlpha(px[0], px[1], px[2], "#00FF00", s);
        expect(Number.isFinite(alpha)).toBe(true);
        expect(alpha).toBeGreaterThanOrEqual(0);
        expect(alpha).toBeLessThanOrEqual(1);
      }
    }
    expect(chromaAlpha(0.5, 1, 0, "#00FF00", NaN)).toBe(1);   // a non-finite strength counts as 0: tol 12, d 30
  });

  test("more strength never keys less", () => {
    for (const px of [[0.5, 1, 0], [0.75, 1, 0], [0, 1, 0.5], [0.2, 0.9, 0.6]]) {
      let last = 1;
      for (let s = 0; s <= 1; s += 0.05) {
        const alpha = chromaAlpha(px[0], px[1], px[2], "#00FF00", s);
        expect(alpha).toBeLessThanOrEqual(last + 1e-12);
        last = alpha;
      }
    }
  });
});
