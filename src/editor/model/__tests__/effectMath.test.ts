import {
  EFFECT, EFFECT_COLORS, activeEffects, burnCentreY, burnOpacity, combinedEffectPreview, combinedEffectShapes, dustScratch, effectPreview,
  effectShapes, envelope, filmFlicker, flareOpacity, flareX, flashOpacity, glitchSlice, hash, heartbeatScale, hueAngle, leakOpacity, mirrorMix,
  pulseScale, shakeOffset, softEdgeAmount, strobeOpacity,
} from "../effectMath";
import { EFFECT_IDS, makeEffect } from "../types";
import {
  BURN_VECTORS, BURN_Y_VECTORS, DUST_VECTORS, ENVELOPE_VECTORS, FLARE_OPACITY_VECTORS, FLARE_X_VECTORS, FLASH_VECTORS, FLICKER_VECTORS,
  GLITCH_VECTORS, HASH_VECTORS, HEARTBEAT_VECTORS, HUE_VECTORS, LEAK_VECTORS, MIRROR_VECTORS, PULSE_VECTORS, SHAKE_VECTORS, SOFT_EDGE_VECTORS,
  STROBE_VECTORS,
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

test("the region effects have an identity preview", () => {
  for (const id of ["blurBox", "mosaicBox"] as const) expect(effectPreview(id, 1, 2, 0.7)).toEqual({ translateX: 0, translateY: 0, scale: 1, layers: [] });
});

describe("the eight effects of 2026-10-06", () => {
  test.each(HEARTBEAT_VECTORS)("heartbeat $name", (v) => expect(heartbeatScale(v.args[0], v.args[1], v.args[2])).toBeCloseTo(v.expect, P));
  test.each(STROBE_VECTORS)("strobe $name", (v) => expect(strobeOpacity(v.args[0], v.args[1])).toBeCloseTo(v.expect, P));
  test.each(BURN_VECTORS)("burn $name", (v) => expect(burnOpacity(v.args[0], v.args[1], v.args[2])).toBeCloseTo(v.expect, P));
  test.each(BURN_Y_VECTORS)("burn centre $name", (v) => expect(burnCentreY(v.args[0])).toBeCloseTo(v.expect, P));
  test.each(FLARE_X_VECTORS)("flare x $name", (v) => expect(flareX(v.args[0])).toBeCloseTo(v.expect, P));
  test.each(FLARE_OPACITY_VECTORS)("flare opacity $name", (v) => expect(flareOpacity(v.args[0], v.args[1], v.args[2])).toBeCloseTo(v.expect, P));
  test.each(SOFT_EDGE_VECTORS)("soft edges $name", (v) => expect(softEdgeAmount(v.args[0], v.args[1], v.args[2])).toBeCloseTo(v.expect, P));
  test.each(HUE_VECTORS)("hue $name", (v) => expect(hueAngle(v.args[0], v.args[1], v.args[2])).toBeCloseTo(v.expect, P));
  test.each(MIRROR_VECTORS)("mirror $name", (v) => expect(mirrorMix(v.args[0], v.args[1], v.args[2])).toBeCloseTo(v.expect, P));
  test.each(DUST_VECTORS)("dust $name", (v) => {
    const s = dustScratch(v.t, v.k, v.i);
    expect(s.on).toBe(v.on); expect(s.x).toBeCloseTo(v.x, P);
  });

  test("the heartbeat never shrinks the picture and is back to 1 between beats and outside the effect", () => {
    for (let t = 0; t <= 4; t += 0.013) { const s = heartbeatScale(t, 4, 1); expect(s).toBeGreaterThanOrEqual(1); expect(s).toBeLessThanOrEqual(1.1 + 1e-12); }
    expect(heartbeatScale(-1, 4, 1)).toBe(1); expect(heartbeatScale(5, 4, 1)).toBe(1);
  });
  test("the strobe is dark 40 % of the time, twice a second (under three flashes a second)", () => {
    let dark = 0; for (let i = 0; i < 1000; i++) if (strobeOpacity(i / 1000, 1) > 0) dark++;
    expect(dark).toBeGreaterThanOrEqual(399); expect(dark).toBeLessThanOrEqual(401);      // 400, give or take a sample that lands on an edge (2 × 0.7 is not exactly 1.4)
    expect(EFFECT.strobeHz).toBeLessThan(3);
  });
  test("the flare stays within one margin of the frame; the burn centre stays inside it; a scratch is inside the width", () => {
    for (let t = 0; t < 6; t += 0.07) {
      expect(flareX(t)).toBeGreaterThanOrEqual(-0.2); expect(flareX(t)).toBeLessThan(1.2);
      expect(burnCentreY(t)).toBeGreaterThanOrEqual(0.15 - 1e-12); expect(burnCentreY(t)).toBeLessThanOrEqual(0.85 + 1e-12);
      for (const i of [0, 1]) { const x = dustScratch(t, 1, i).x; expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(1); }
    }
  });

  test("every function is total: time, duration and strength that are not finite or out of range give a finite value inside the function's range", () => {
    const ODD = [NaN, Infinity, -Infinity, -1e308, -1, 0, 0.3, 1, 2, 5, 1e308];
    const inside = (v: number, lo: number, hi: number) => { expect(Number.isFinite(v)).toBe(true); expect(v).toBeGreaterThanOrEqual(lo); expect(v).toBeLessThanOrEqual(hi); };
    for (const t of ODD) {
      inside(burnCentreY(t), 0.5 - EFFECT.burnDrift, 0.5 + EFFECT.burnDrift);
      inside(flareX(t), -EFFECT.flareMargin, 1 + EFFECT.flareMargin);
      for (const k of ODD) {
        inside(strobeOpacity(t, k), 0, 1);
        for (const i of [0, 1, NaN, Infinity, -3]) { const s = dustScratch(t, k, i); expect(typeof s.on).toBe("boolean"); inside(s.x, 0, 1); }
        for (const d of ODD) {
          inside(heartbeatScale(t, d, k), 1, 1 + EFFECT.beatAmp);
          inside(burnOpacity(t, d, k), 0, EFFECT.burnMax);
          inside(flareOpacity(t, d, k), 0, EFFECT.flareMax);
          inside(softEdgeAmount(t, d, k), 0, 1);
          inside(hueAngle(t, d, k), -Math.PI, Math.PI);
          inside(mirrorMix(t, d, k), 0, 1);
          for (const type of ["heartbeat", "strobe", "filmBurn", "lensFlare", "dust", "softEdges"] as const) {
            const p = effectPreview(type, t, d, k);
            inside(p.scale, 1, 1 + EFFECT.beatAmp);
            for (const l of p.layers) inside(l.opacity, 0, 1);
            for (const s of effectShapes(type, t, d, k)) { inside(s.opacity, 0, 1); if ("x" in s) inside(s.x, -EFFECT.flareMargin, 1 + EFFECT.flareMargin); }
          }
        }
      }
    }
    // What a function rests at when its input is not a number: nothing drawn, nothing moved.
    expect(heartbeatScale(NaN, 4, 1)).toBe(1); expect(heartbeatScale(1, 4, NaN)).toBe(1); expect(heartbeatScale(0.88, 4, 9)).toBe(1 + EFFECT.beatAmp);
    expect(strobeOpacity(NaN, 1)).toBe(0); expect(strobeOpacity(0, NaN)).toBe(0); expect(strobeOpacity(0, 3)).toBe(1); expect(strobeOpacity(0, -1)).toBe(0);
    expect(burnOpacity(NaN, 4, 1)).toBe(0); expect(burnOpacity(0.625, 4, Infinity)).toBe(0); expect(burnOpacity(0.625, 4, 9)).toBe(EFFECT.burnMax);
    expect(burnCentreY(NaN)).toBe(0.5); expect(flareX(Infinity)).toBe(-EFFECT.flareMargin);
    expect(flareOpacity(1, NaN, 1)).toBe(0); expect(softEdgeAmount(1, 4, NaN)).toBe(0); expect(softEdgeAmount(1, 4, 7)).toBe(1);
    expect(hueAngle(NaN, 4, 1)).toBe(0); expect(hueAngle(1, 4, 9)).toBe(Math.PI); expect(hueAngle(3, 4, 9)).toBe(-Math.PI);
    expect(mirrorMix(1, 4, NaN)).toBe(0); expect(mirrorMix(1, 4, Infinity)).toBe(0); expect(mirrorMix(1, 4, -1)).toBe(0); expect(mirrorMix(Infinity, Infinity, 1)).toBe(0);
    expect(dustScratch(NaN, 1, 0)).toEqual({ on: false, x: 0 }); expect(dustScratch(1, NaN, 0).on).toBe(false);
  });

  test("effectPreview: heartbeat scales, strobe is one black layer, the other six leave the picture and its layers alone", () => {
    expect(effectPreview("heartbeat", 0.88, 4, 1)).toEqual({ translateX: 0, translateY: 0, scale: expect.closeTo(1.1, 9), layers: [] });
    expect(effectPreview("strobe", 0.1, 4, 0.8).layers).toEqual([{ color: EFFECT_COLORS.strobe, opacity: 0.8 }]);
    expect(effectPreview("strobe", 0.25, 4, 0.8)).toEqual(IDENTITY);
    for (const type of ["filmBurn", "lensFlare", "dust", "hueShift", "mirror", "softEdges"] as const) expect(effectPreview(type, 1, 4, 1)).toEqual(IDENTITY);
  });

  test("effectShapes: what the preview draws for the four that have a shape; nothing for the others", () => {
    expect(effectShapes("filmBurn", 0.625, 4, 1)).toEqual([{ kind: "burn", color: EFFECT_COLORS.filmBurn, opacity: expect.closeTo(0.6, 9) }]);
    expect(effectShapes("filmBurn", 1.875, 4, 1)).toEqual([]);                                   // opacity 0: omitted
    expect(effectShapes("lensFlare", 1, 4, 1)).toEqual([{ kind: "flare", color: EFFECT_COLORS.lensFlare, opacity: expect.closeTo(0.8, 9), x: expect.closeTo(0.5, 9) }]);
    expect(effectShapes("softEdges", 1, 4, 0.7)).toEqual([{ kind: "edges", color: EFFECT_COLORS.softEdges, opacity: expect.closeTo(0.245, 9) }]);   // 0.35 · 0.7
    // t = 1, k = 1: both lines on; opacity 0.5 · k · env = 0.5
    expect(effectShapes("dust", 1, 4, 1)).toEqual([
      { kind: "scratch", color: EFFECT_COLORS.dust, opacity: expect.closeTo(0.5, 9), x: expect.closeTo(0.4702766282589437, 9) },
      { kind: "scratch", color: EFFECT_COLORS.dust, opacity: expect.closeTo(0.5, 9), x: expect.closeTo(0.8728999602171825, 9) },
    ]);
    expect(effectShapes("dust", 0.25, 4, 1)).toHaveLength(1);                                    // only line 1 is on in frame 3
    for (const type of EFFECT_IDS) {
      if (["filmBurn", "lensFlare", "softEdges", "dust"].includes(type)) continue;
      expect(effectShapes(type, 1, 4, 1)).toEqual([]);
    }
    for (const type of EFFECT_IDS) for (const bad of [[-1, 4, 1], [5, 4, 1], [NaN, 4, 1], [1, Infinity, 1], [1, 4, NaN], [1, 4, 0]]) expect(effectShapes(type, bad[0], bad[1], bad[2])).toEqual([]);
  });

  test("combinedEffectShapes: the shapes of every active effect, in list order", () => {
    const burn = makeEffect({ id: "b", type: "filmBurn", start: 0, end: 4, intensity: 1 });
    const flare = makeEffect({ id: "f", type: "lensFlare", start: 0.5, end: 4.5, intensity: 1 });
    // 0.625: the burn is at its peak (0.6); the flare is 0.125 s old (env 0.125 / 0.15 → 0.8·0.8333 > 0).
    expect(combinedEffectShapes([burn, flare], 0.625).map((s) => s.kind)).toEqual(["burn", "flare"]);
    // 1.5: the burn is 0.6·(0.5 + 0.5·sin(1.2π)) = 0.6·(0.5 − 0.2939) = 0.1237; the flare is 1 s old.
    expect(combinedEffectShapes([burn, flare], 1.5).map((s) => s.kind)).toEqual(["burn", "flare"]);
    // 1.875: the burn is at its trough (0) and is left out.
    expect(combinedEffectShapes([burn, flare], 1.875).map((s) => s.kind)).toEqual(["flare"]);
    expect(combinedEffectShapes([burn, flare], 4.2).map((s) => s.kind)).toEqual(["flare"]);         // the burn has ended (end is exclusive)
    expect(combinedEffectShapes([], 1)).toEqual([]);
  });
});
