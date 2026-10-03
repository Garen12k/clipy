import {
  EFFECT, EFFECT_COLORS, activeEffects, combinedEffectPreview, effectPreview, envelope, filmFlicker, flashOpacity, glitchSlice,
  hash, leakOpacity, pulseScale, shakeOffset,
} from "../effectMath";
import { EFFECT_IDS, makeEffect } from "../types";
import {
  ENVELOPE_VECTORS, FLASH_VECTORS, FLICKER_VECTORS, GLITCH_VECTORS, HASH_VECTORS, LEAK_VECTORS, PULSE_VECTORS, SHAKE_VECTORS,
} from "./effectMath.vectors";

const P = 9;
const IDENTITY = { translateX: 0, translateY: 0, scale: 1, layers: [] };

describe("effectMath vectors", () => {
  test.each(HASH_VECTORS)("$name", (v) => expect(hash(v.args[0])).toBeCloseTo(v.expect, P));
  test.each(ENVELOPE_VECTORS)("envelope $name", (v) => expect(envelope(v.args[0], v.args[1])).toBeCloseTo(v.expect, P));
  test.each(SHAKE_VECTORS)("shake $name", (v) => {
    const o = shakeOffset(v.t, v.d, v.k);
    expect(o.x).toBeCloseTo(v.x, P); expect(o.y).toBeCloseTo(v.y, P); expect(o.scale).toBeCloseTo(v.scale, P);
  });
  test.each(PULSE_VECTORS)("pulse $name", (v) => expect(pulseScale(v.args[0], v.args[1], v.args[2])).toBeCloseTo(v.expect, P));
  test.each(FLASH_VECTORS)("flash $name", (v) => expect(flashOpacity(v.args[0], v.args[1])).toBeCloseTo(v.expect, P));
  test.each(LEAK_VECTORS)("leak $name", (v) => expect(leakOpacity(v.args[0], v.args[1], v.args[2])).toBeCloseTo(v.expect, P));
  test.each(FLICKER_VECTORS)("flicker $name", (v) => expect(filmFlicker(v.args[0], v.args[1])).toBeCloseTo(v.expect, P));
  test.each(GLITCH_VECTORS)("glitch $name", (v) => {
    const g = glitchSlice(v.t, v.k);
    expect(g.active).toBe(v.active);
    expect(g.bandY).toBeCloseTo(v.bandY, P); expect(g.bandH).toBeCloseTo(v.bandH, P);
    expect(g.shift).toBeCloseTo(v.shift, P); expect(g.split).toBeCloseTo(v.split, P);
  });
});

describe("hash and envelope", () => {
  test("hash stays in [0, 1) for 1000 inputs, including negatives", () => {
    for (let i = -500; i < 500; i++) {
      const h = hash(i * 0.37 + 0.11);
      expect(h).toBeGreaterThanOrEqual(0); expect(h).toBeLessThan(1);
    }
  });
  test("envelope is symmetric", () => {
    for (const d of [0.2, 1, 2.5]) for (const t of [0.01, 0.05, 0.1, 0.3]) {
      expect(envelope(t, d)).toBeCloseTo(envelope(d - t, d), 9);
    }
  });
  test("envelope is 0 outside [0, d] and for a non-positive duration", () => {
    expect(envelope(-0.1, 2)).toBe(0); expect(envelope(2.1, 2)).toBe(0); expect(envelope(0, 0)).toBe(0); expect(envelope(0.1, -1)).toBe(0);
  });
});

describe("effectPreview", () => {
  test("blur, glitch and rgbSplit have no preview", () => {
    for (const type of ["blur", "glitch", "rgbSplit"] as const) expect(effectPreview(type, 1, 2, 1)).toEqual(IDENTITY);
  });
  test("shake translates and scales", () => {
    const p = effectPreview("shake", 0.25, 2, 0.5);
    expect(p.translateX).toBeCloseTo(0.015, P); expect(p.scale).toBeCloseTo(1.03, P); expect(p.layers).toEqual([]);
  });
  test("zoomPulse only scales", () => {
    const p = effectPreview("zoomPulse", 0.25, 2, 1);
    expect(p).toEqual({ translateX: 0, translateY: 0, scale: expect.closeTo(1.12, 9), layers: [] });
  });
  test("flash is one white layer, omitted at zero opacity", () => {
    expect(effectPreview("flash", 0.1, 2, 1).layers).toEqual([{ color: EFFECT_COLORS.flash, opacity: expect.closeTo(0.2, 9) }]);
    expect(effectPreview("flash", 0.25, 2, 1).layers).toEqual([]);
  });
  test("lightLeak, vhs and glow are one layer scaled by k and the envelope", () => {
    expect(effectPreview("lightLeak", 1, 2, 1).layers).toEqual([{ color: EFFECT_COLORS.lightLeak, opacity: expect.closeTo(0.21, 9) }]);
    expect(effectPreview("vhs", 1, 2, 0.5).layers).toEqual([{ color: EFFECT_COLORS.vhs, opacity: expect.closeTo(0.06, 9) }]);
    expect(effectPreview("glow", 0.075, 2, 1).layers).toEqual([{ color: EFFECT_COLORS.glow, opacity: expect.closeTo(0.06, 9) }]);
  });
  test("oldFilm is a sepia layer plus a flicker layer", () => {
    expect(effectPreview("oldFilm", 0.25, 2, 1).layers).toEqual([
      { color: EFFECT_COLORS.oldFilm, opacity: expect.closeTo(EFFECT.filmTint, 9) },
      { color: EFFECT_COLORS.flicker, opacity: expect.closeTo(0.06698671062971698, 9) },
    ]);
  });
  test("every effect id is covered and out-of-range or non-finite input is the identity", () => {
    for (const type of EFFECT_IDS) {
      expect(effectPreview(type, -1, 2, 1)).toEqual(IDENTITY);
      expect(effectPreview(type, 3, 2, 1)).toEqual(IDENTITY);
      expect(effectPreview(type, NaN, 2, 1)).toEqual(IDENTITY);
      expect(effectPreview(type, 1, Infinity, 1)).toEqual(IDENTITY);
      expect(effectPreview(type, 1, 2, NaN)).toEqual(IDENTITY);
    }
  });
});

describe("activeEffects / combinedEffectPreview", () => {
  const a = makeEffect({ id: "a", type: "shake", start: 1, end: 3, intensity: 0.5 });
  const b = makeEffect({ id: "b", type: "flash", start: 2, end: 4, intensity: 1 });
  test("start is inclusive, end exclusive, list order kept, local time given", () => {
    expect(activeEffects([a, b], 0.99)).toEqual([]);
    expect(activeEffects([a, b], 1)).toEqual([{ effect: a, t: 0, d: 2 }]);
    expect(activeEffects([a, b], 2.25).map((e) => [e.effect.id, e.t, e.d])).toEqual([["a", 1.25, 2], ["b", 0.25, 2]]);
    expect(activeEffects([a, b], 3).map((e) => e.effect.id)).toEqual(["b"]);
    expect(activeEffects([a, b], 4)).toEqual([]);
    expect(activeEffects([a, b], NaN)).toEqual([]);
  });
  test("shake and flash combine: translation adds, scale multiplies, layers concatenate", () => {
    const sh = effectPreview("shake", 1.1, 2, 0.5);
    const fl = effectPreview("flash", 0.1, 2, 1);
    const c = combinedEffectPreview([a, b], 2.1);
    expect(c.translateX).toBeCloseTo(sh.translateX, 9); expect(c.translateY).toBeCloseTo(sh.translateY, 9);
    expect(c.scale).toBeCloseTo(sh.scale, 9); expect(c.layers).toHaveLength(1); expect(c.layers[0].color).toBe(fl.layers[0].color); expect(c.layers[0].opacity).toBeCloseTo(fl.layers[0].opacity, 9);
  });
  test("no active effect is the identity", () => {
    expect(combinedEffectPreview([a], 10)).toEqual(IDENTITY);
    expect(combinedEffectPreview([], 1)).toEqual(IDENTITY);
  });
});
