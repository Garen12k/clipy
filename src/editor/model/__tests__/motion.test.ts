import {
  ANIM_COMBO_IDS, ANIM_IN_IDS, ANIM_LOOP_IDS, makeClip, makeKeyframe, makeOverlay, makePhotoClip, makeSticker,
  type AnimComboId, type AnimInId, type AnimLoopId,
} from "../types";
import { clipDuration, curveSteps, freezeSourceTime, outputOffsetOf, sourceTimeAt } from "../timeline";
import {
  IDENTITY_DELTA, MOTION, animComboDelta, animInDelta, animLoopDelta, animOutDelta, clipBaseAt, combine, easeOut, edgeDurations,
  hasClipMotion, hasOverlayMotion, overlayBaseAt, resolveClipMotion, resolveOverlayMotion, sampleKeyframes, smooth,
  type KeyValues, type MotionDelta,
} from "../motion";
import {
  COMBO_VECTORS, EDGE_VECTORS, IN_VECTORS, KEY_PINS, KEY_VECTORS, LOOP_VECTORS, OFFSET_VECTORS, OUT_VECTORS, RESOLVE_CLIP_VECTORS, REVERSED_CLIP,
} from "./motion.vectors";

const FIELDS = ["dx", "dy", "scale", "rotation", "opacity"] as const;
function expectDelta(d: MotionDelta, v: Record<(typeof FIELDS)[number], number>) {
  for (const f of FIELDS) expect(d[f]).toBeCloseTo(v[f], 9);
}
const KEYS = ["x", "y", "scale", "rotation", "opacity"] as const;
function expectValues(k: KeyValues | null, v: Record<(typeof KEYS)[number], number>) {
  expect(k).not.toBeNull();
  for (const f of KEYS) expect(k![f]).toBeCloseTo(v[f], 9);
}

describe("constants and easing", () => {
  test("MOTION matches the spec", () => {
    expect(MOTION).toEqual({
      slideClip: 1, slideOverlay: 0.25, zoomFrom: 0.6, zoomOutFrom: 1.4, spinTurn: 180, spinFrom: 0.5,
      popPeak: 1.15, popPeakAt: 0.6, popFadeBy: 0.3, rise: 0.15, comboZoom: 0.15, panScale: 1.1, pan: 0.05, swayDeg: 3, swayCycles: 2, swayScale: 1.08,
      pulseAmp: 0.05, pulseHz: 1, wiggleDeg: 8, wiggleHz: 2, loopPulseAmp: 0.1, loopPulseHz: 1.5, loopSpinDegPerSec: 180,
      floatAmp: 0.015, floatHz: 0.8, blinkMin: 0.35, blinkHz: 1.5, shakeAmp: 0.008, shakeHz: 8,
    });
    expect(IDENTITY_DELTA).toEqual({ dx: 0, dy: 0, scale: 1, rotation: 0, opacity: 1 });
  });
  test("easeOut and smooth, clamped to 0–1", () => {
    expect(easeOut(0)).toBe(0);
    expect(easeOut(0.5)).toBeCloseTo(0.875, 9);
    expect(easeOut(1)).toBe(1);
    expect(easeOut(-1)).toBe(0);
    expect(easeOut(2)).toBe(1);
    expect(smooth(0)).toBe(0);
    expect(smooth(0.25)).toBeCloseTo(0.15625, 9);
    expect(smooth(0.5)).toBeCloseTo(0.5, 9);
    expect(smooth(1)).toBe(1);
    expect(smooth(-3)).toBe(0);
    expect(smooth(3)).toBe(1);
  });
});

describe("animation deltas", () => {
  test.each(IN_VECTORS)("in: $name", (v) => expectDelta(animInDelta(v.id as AnimInId, v.p, v.distance), v));
  test.each(OUT_VECTORS)("out: $name", (v) => expectDelta(animOutDelta(v.id as AnimInId, v.p, v.distance), v));
  test.each(COMBO_VECTORS)("combo: $name", (v) => expectDelta(animComboDelta(v.id as AnimComboId, v.p, v.seconds), v));
  test.each(LOOP_VECTORS)("loop: $name", (v) => expectDelta(animLoopDelta(v.id as AnimLoopId, v.seconds), v));

  test("the vectors cover every id", () => {
    expect(new Set(IN_VECTORS.map((v) => v.id))).toEqual(new Set(ANIM_IN_IDS));
    expect(new Set(COMBO_VECTORS.map((v) => v.id))).toEqual(new Set(ANIM_COMBO_IDS));
    expect(new Set(LOOP_VECTORS.map((v) => v.id))).toEqual(new Set(ANIM_LOOP_IDS));
  });

  test.each(ANIM_IN_IDS)("%s: In at p = 1 and Out at p = 0 are exactly the identity", (id) => {
    expect(animInDelta(id, 1, 1)).toEqual(IDENTITY_DELTA);
    expect(animOutDelta(id, 0, 1)).toEqual(IDENTITY_DELTA);
    expect(animInDelta(id, 5, 0.25)).toEqual(IDENTITY_DELTA);     // progress is clamped
    expect(animOutDelta(id, -5, 0.25)).toEqual(IDENTITY_DELTA);
  });

  test.each(ANIM_IN_IDS)("%s: Out mirrors In with dx, dy and rotation negated", (id) => {
    for (const p of [0, 0.2, 0.5, 0.9, 1]) {
      const i = animInDelta(id, 1 - p, 0.25);
      expectDelta(animOutDelta(id, p, 0.25), { dx: -i.dx, dy: -i.dy, scale: i.scale, rotation: -i.rotation, opacity: i.opacity });
    }
  });

  test("progress below 0 clamps to the start", () => {
    expectDelta(animInDelta("slideLeft", -2, 1), { dx: 1, dy: 0, scale: 1, rotation: 0, opacity: 1 });
    expectDelta(animComboDelta("zoomInSlow", 7, 0), { dx: 0, dy: 0, scale: 1.15, rotation: 0, opacity: 1 });
  });

  test("non-finite inputs and unknown ids give the identity", () => {
    expect(animInDelta("fade", NaN, 1)).toEqual(IDENTITY_DELTA);
    expect(animInDelta("slideLeft", 0.5, Infinity)).toEqual(IDENTITY_DELTA);
    expect(animOutDelta("spin", NaN, 1)).toEqual(IDENTITY_DELTA);
    expect(animComboDelta("pulse", 0.5, NaN)).toEqual(IDENTITY_DELTA);
    expect(animComboDelta("sway", NaN, 1)).toEqual(IDENTITY_DELTA);
    expect(animLoopDelta("spin", Infinity)).toEqual(IDENTITY_DELTA);
    expect(animInDelta("nope" as AnimInId, 0.5, 1)).toEqual(IDENTITY_DELTA);
    expect(animComboDelta("nope" as AnimComboId, 0.5, 1)).toEqual(IDENTITY_DELTA);
    expect(animLoopDelta("nope" as AnimLoopId, 1)).toEqual(IDENTITY_DELTA);
  });
});

describe("edgeDurations", () => {
  test.each(EDGE_VECTORS)("$name", (v) => {
    const e = edgeDurations(v.inDur, v.outDur, v.length);
    expect(e.in).toBeCloseTo(v.in, 9);
    expect(e.out).toBeCloseTo(v.out, 9);
  });
  test("negative / non-finite durations count as 0; an empty item has no edges", () => {
    expect(edgeDurations(-1, 0.5, 3)).toEqual({ in: 0, out: 0.5 });
    expect(edgeDurations(NaN, Infinity, 3)).toEqual({ in: 0, out: 0 });
    expect(edgeDurations(0.5, 0.5, 0)).toEqual({ in: 0, out: 0 });
    expect(edgeDurations(0.5, 0.5, -2)).toEqual({ in: 0, out: 0 });
    expect(edgeDurations(0.5, 0.5, NaN)).toEqual({ in: 0, out: 0 });
    expect(edgeDurations(0, 0, 3)).toEqual({ in: 0, out: 0 });
  });
});

describe("sampleKeyframes", () => {
  test.each(KEY_VECTORS)("$name", (v) => expectValues(sampleKeyframes(KEY_PINS, v.t), v));
  test("empty → null; one pin → its values at any time", () => {
    expect(sampleKeyframes([], 1)).toBeNull();
    const only = makeKeyframe({ t: 2, x: 0.3, scale: 2, opacity: 0.4 });
    for (const t of [0, 2, 9]) expect(sampleKeyframes([only], t)).toEqual({ x: 0.3, y: 0, scale: 2, rotation: 0, opacity: 0.4 });
  });
  test("exactly on a pin returns that pin; the result carries no t", () => {
    expect(sampleKeyframes(KEY_PINS, 1)).toEqual({ x: 0, y: 0.2, scale: 1, rotation: 0, opacity: 1 });
    expect(sampleKeyframes(KEY_PINS, 3)).toEqual({ x: 0.4, y: -0.2, scale: 2, rotation: 90, opacity: 0.5 });
  });
  test("three pins use the surrounding pair; rotation is numeric (no shortest path)", () => {
    const pins = [makeKeyframe({ t: 0, rotation: 0 }), makeKeyframe({ t: 2, rotation: 350 }), makeKeyframe({ t: 4, rotation: 350, x: 1 })];
    expect(sampleKeyframes(pins, 1)!.rotation).toBeCloseTo(175, 9);
    expect(sampleKeyframes(pins, 3)!.x).toBeCloseTo(0.5, 9);
    expect(sampleKeyframes(pins, 3)!.rotation).toBeCloseTo(350, 9);
  });
  test("a non-finite time holds the first pin", () => {
    expect(sampleKeyframes(KEY_PINS, NaN)).toEqual({ x: 0, y: 0.2, scale: 1, rotation: 0, opacity: 1 });
  });
});

test("combine: offsets and rotation add, scale and opacity multiply (no clamping)", () => {
  expect(combine({ x: 0.25, y: -0.5, scale: 2, rotation: 30, opacity: 0.5 }, { dx: 0.5, dy: 0.25, scale: 1.5, rotation: -45, opacity: 4 }))
    .toEqual({ x: 0.75, y: -0.25, scale: 3, rotation: -15, opacity: 2 });
  const base = { x: 0.1, y: -0.2, scale: 2, rotation: 30, opacity: 0.5 };
  expect(combine(base, IDENTITY_DELTA)).toEqual(base);
});

describe("timeline: source time ↔ output offset", () => {
  test.each(OFFSET_VECTORS)("outputOffsetOf: $name", (v) => {
    const c = makeClip({ id: "c", sourceDuration: 10, trimStart: v.trimStart, trimEnd: v.trimEnd, speed: v.speed, reversed: v.reversed });
    expect(outputOffsetOf(c, v.sourceTime)).toBeCloseTo(v.expect, 9);
  });
  test("sourceTimeAt is freezeSourceTime", () => {
    expect(sourceTimeAt).toBe(freezeSourceTime);
  });
  test("outputOffsetOf inverts sourceTimeAt (forward and reversed, any speed)", () => {
    for (const reversed of [false, true]) {
      for (const speed of [0.25, 1, 2, 4]) {
        const c = makeClip({ id: "c", sourceDuration: 10, trimStart: 1.5, trimEnd: 9, speed, reversed });
        for (const x of [0, 0.3, 1, clipDuration(c)]) expect(outputOffsetOf(c, sourceTimeAt(c, x))).toBeCloseTo(x, 9);
      }
    }
  });
  test("a source time outside the trim falls outside [0, clipDuration]", () => {
    const c = makeClip({ id: "c", sourceDuration: 10, trimStart: 2, trimEnd: 6 });
    expect(outputOffsetOf(c, 1)).toBe(-1);
    expect(outputOffsetOf({ ...c, reversed: true }, 1)).toBe(5);
  });
});

describe("clipBaseAt", () => {
  test("without keyframes: the static transform with opacity 1", () => {
    const c = makeClip({ id: "c", sourceDuration: 10, transform: { scale: 2, x: 0.1, y: -0.3, rotation: 90, flipH: true, flipV: false } });
    expect(clipBaseAt(c, 4)).toEqual({ x: 0.1, y: -0.3, scale: 2, rotation: 90, opacity: 1 });
  });
  test("with keyframes: sampled at the source time; the static values are ignored", () => {
    const c = makeClip({ id: "c", sourceDuration: 10, transform: { scale: 3, x: 0.9, y: 0.9, rotation: 10, flipH: false, flipV: false }, keyframes: KEY_PINS });
    expectValues(clipBaseAt(c, 2), { x: 0.2, y: 0, scale: 1.5, rotation: 45, opacity: 0.75 });
  });
});

describe("clipBaseAt on a speed curve: pins ease in OUTPUT time, as the export does", () => {
  const pins = [makeKeyframe({ t: 0, x: 0 }), makeKeyframe({ t: 8, x: 1 })];
  const bullet = (over: object = {}) => {
    const c = makeClip({ id: "b", sourceDuration: 8, keyframes: pins, ...over });
    return { ...c, speedCurve: { id: "bullet" as const, steps: curveSteps("bullet", c.trimStart, c.trimEnd) } };
  };
  const outputPins = (c: ReturnType<typeof bullet>) => c.keyframes.map((k) => ({ ...k, t: outputOffsetOf(c, k.t) })).sort((a, b) => a.t - b.t);

  test("Bullet on 8 s: at the frame showing source 3 s the value is the output-time ease, not the source-time one", () => {
    const c = bullet();
    const offset = outputOffsetOf(c, 3);
    expect(sourceTimeAt(c, offset)).toBeCloseTo(3, 9);
    const want = sampleKeyframes(outputPins(c), offset)!;
    expect(clipBaseAt(c, offset)).toEqual(want);
    expect(resolveClipMotion(c, offset).transform.x).toBe(want.x);
    expect(want.x).not.toBeCloseTo(sampleKeyframes(pins, 3)!.x, 3);   // the two eases really differ here
    expect(want.x).toBeCloseTo(smooth(offset / clipDuration(c)), 9);
  });
  test("a reversed curved clip: the pins run in reversed order", () => {
    const c = bullet({ reversed: true });
    const mapped = outputPins(c);
    expect(mapped.map((k) => k.x)).toEqual([1, 0]);
    for (const source of [1, 3, 4.5, 7]) {
      const offset = outputOffsetOf(c, source);
      expect(clipBaseAt(c, offset)).toEqual(sampleKeyframes(mapped, offset)!);
    }
    expect(clipBaseAt(c, 0).x).toBe(1);
    expect(clipBaseAt(c, clipDuration(c)).x).toBe(0);
  });
  test("constant-speed clips are unchanged, bit for bit (an empty step list is no curve)", () => {
    const plain = makeClip({ id: "c", sourceDuration: 10, trimStart: 1, trimEnd: 9, speed: 1.5, keyframes: KEY_PINS });
    for (const c of [plain, { ...plain, reversed: true }, { ...plain, speed: 1, speedCurve: { id: "hero" as const, steps: [] } }]) {
      for (const offset of [0, 0.7, 1.3, 2.9, 5]) {
        const want = sampleKeyframes(c.keyframes, sourceTimeAt(c, offset))!;
        const got = clipBaseAt(c, offset);
        for (const f of KEYS) expect(got[f]).toBe(want[f]);
      }
    }
  });
});

describe("resolveClipMotion", () => {
  const still ={ scale: 2, x: 0.1, y: -0.3, rotation: 90, flipH: true, flipV: false };

  test("a default clip returns its own transform values and opacity 1", () => {
    const c = makeClip({ id: "c", sourceDuration: 10, transform: still });
    for (const offset of [0, 3, 10]) expect(resolveClipMotion(c, offset)).toEqual({ transform: still, opacity: 1 });
    expect(hasClipMotion(c)).toBe(false);
  });

  test("In runs over the first `duration` seconds, Out over the last", () => {
    const c = makeClip({ id: "c", sourceDuration: 10, transform: still,
      animation: { in: { id: "slideLeft", duration: 1 }, out: { id: "fade", duration: 2 }, combo: null } });
    expect(hasClipMotion(c)).toBe(true);
    const start = resolveClipMotion(c, 0);
    expect(start.transform.x).toBeCloseTo(1.1, 9);                // 0.1 + slideClip
    expect(start.opacity).toBe(1);
    expect(resolveClipMotion(c, 0.5).transform.x).toBeCloseTo(0.225, 9);   // 0.1 + 0.125
    expect(resolveClipMotion(c, 1)).toEqual({ transform: still, opacity: 1 });
    expect(resolveClipMotion(c, 5)).toEqual({ transform: still, opacity: 1 });
    expect(resolveClipMotion(c, 8)).toEqual({ transform: still, opacity: 1 });
    expect(resolveClipMotion(c, 9).opacity).toBeCloseTo(0.875, 9);         // out p = 0.5 → in at 0.5
    expect(resolveClipMotion(c, 10).opacity).toBe(0);
    expect(resolveClipMotion(c, 9).transform).toEqual(still);
  });

  test("In + Out longer than the clip are scaled down proportionally", () => {
    const c = makeClip({ id: "c", sourceDuration: 10, trimStart: 0, trimEnd: 0.6,
      animation: { in: { id: "fade", duration: 0.5 }, out: { id: "fade", duration: 0.5 }, combo: null } });
    expect(resolveClipMotion(c, 0.15).opacity).toBeCloseTo(0.875, 9);   // in = 0.3 → p = 0.5
    expect(resolveClipMotion(c, 0.3).opacity).toBeCloseTo(1, 9);
    expect(resolveClipMotion(c, 0.45).opacity).toBeCloseTo(0.875, 9);   // out = 0.3 → p = 0.5
  });

  test("In composes with keyframes", () => {
    const c = makeClip({ id: "c", sourceDuration: 10, transform: still, keyframes: KEY_PINS,
      animation: { in: { id: "zoomIn", duration: 4 }, out: null, combo: null } });
    const r = resolveClipMotion(c, 2);                             // base: midpoint; in p = 0.5 → scale 0.95, opacity 0.875
    expect(r.transform.x).toBeCloseTo(0.2, 9);
    expect(r.transform.y).toBeCloseTo(0, 9);
    expect(r.transform.scale).toBeCloseTo(1.5 * 0.95, 9);
    expect(r.transform.rotation).toBeCloseTo(45, 9);
    expect(r.opacity).toBeCloseTo(0.75 * 0.875, 9);
    expect(r.transform.flipH).toBe(true);                          // flips stay on the static transform
    expect(r.transform.flipV).toBe(false);
  });

  test("a Combo runs over the whole clip and ignores In / Out", () => {
    const c = makeClip({ id: "c", sourceDuration: 8,
      animation: { in: { id: "fade", duration: 2 }, out: { id: "fade", duration: 2 }, combo: "zoomInSlow" } });
    expect(resolveClipMotion(c, 0)).toEqual({ transform: c.transform, opacity: 1 });
    const r = resolveClipMotion(c, 2);
    expect(r.transform.scale).toBeCloseTo(1.0375, 9);
    expect(r.opacity).toBe(1);
    expect(resolveClipMotion(c, 8).transform.scale).toBeCloseTo(1.15, 9);
    const pulse = makeClip({ id: "p", sourceDuration: 8, animation: { in: null, out: null, combo: "pulse" } });
    expect(resolveClipMotion(pulse, 0.5).transform.scale).toBeCloseTo(1.05, 9);   // seconds = clip-local seconds
  });

  test("the offset is clamped to the clip's range; a non-finite offset gives the base at the clip's start", () => {
    const c = makeClip({ id: "c", sourceDuration: 4, keyframes: [makeKeyframe({ t: 0, x: 0 }), makeKeyframe({ t: 4, x: 0.8 })],
      animation: { in: { id: "fade", duration: 1 }, out: { id: "fade", duration: 1 }, combo: null } });
    expect(resolveClipMotion(c, -3)).toEqual(resolveClipMotion(c, 0));
    expect(resolveClipMotion(c, 99)).toEqual(resolveClipMotion(c, 4));
    expect(resolveClipMotion(c, 99).transform.x).toBeCloseTo(0.8, 9);
    expect(resolveClipMotion(c, NaN)).toEqual({ transform: { ...c.transform, x: 0 }, opacity: 1 });
  });

  test("opacity is clamped to 0–1; the transform is not clamped to TRANSFORM_LIMITS", () => {
    const c = makeClip({ id: "c", sourceDuration: 4, keyframes: [makeKeyframe({ t: 0, opacity: 7, x: 1, scale: 5 })],
      animation: { in: { id: "zoomOut", duration: 1 }, out: null, combo: null } });
    expect(resolveClipMotion(c, 2).opacity).toBe(1);
    expect(resolveClipMotion(c, 0).transform.scale).toBeCloseTo(7, 9);     // 5 × 1.4
    const slide = makeClip({ id: "s", sourceDuration: 4, transform: { ...c.transform, x: 0.5 }, animation: { in: { id: "slideLeft", duration: 1 }, out: null, combo: null } });
    expect(resolveClipMotion(slide, 0).transform.x).toBeCloseTo(1.5, 9);
  });

  test("trimmed clip: a pin before trimStart still shapes the interpolation", () => {
    const c = makeClip({ id: "c", sourceDuration: 10, trimStart: 2, trimEnd: 6, keyframes: [makeKeyframe({ t: 0, x: 0 }), makeKeyframe({ t: 4, x: 0.4 })] });
    expect(resolveClipMotion(c, 0).transform.x).toBeCloseTo(0.2, 9);       // source 2 → u = 0.5
    expect(resolveClipMotion(c, 2).transform.x).toBeCloseTo(0.4, 9);       // source 4
    expect(resolveClipMotion(c, 4).transform.x).toBeCloseTo(0.4, 9);       // holds after the last pin
  });

  test("speed 2: keyframes follow the source time, In / Out use output seconds", () => {
    const c = makeClip({ id: "c", sourceDuration: 8, speed: 2, keyframes: [makeKeyframe({ t: 0, x: 0 }), makeKeyframe({ t: 8, x: 0.8 })],
      animation: { in: { id: "fade", duration: 1 }, out: null, combo: null } });
    expect(clipDuration(c)).toBe(4);
    const r = resolveClipMotion(c, 0.5);
    expect(r.opacity).toBeCloseTo(0.875, 9);                               // p = 0.5 of a 1 s In
    expect(r.transform.x).toBeCloseTo(0.8 * smooth(1 / 8), 9);             // source 1 of 8
    expect(resolveClipMotion(c, 2).transform.x).toBeCloseTo(0.4, 9);       // source 4 → midpoint
  });

  test("reversed: the source time runs backwards", () => {
    const c = makeClip({ id: "c", sourceDuration: 8, reversed: true, keyframes: [makeKeyframe({ t: 0, x: 0 }), makeKeyframe({ t: 8, x: 0.8 })] });
    expect(resolveClipMotion(c, 0).transform.x).toBeCloseTo(0.8, 9);       // source 8
    expect(resolveClipMotion(c, 1).transform.x).toBeCloseTo(0.765625, 9);  // source 7: u = 0.875 → s = 0.95703125
    expect(resolveClipMotion(c, 8).transform.x).toBeCloseTo(0, 9);         // source 0
  });

  test("photo clips resolve like any other", () => {
    const c = makePhotoClip({ id: "ph", seconds: 4, animation: { in: null, out: null, combo: "zoomOutSlow" } });
    expect(resolveClipMotion(c, 1).transform.scale).toBeCloseTo(1.1125, 9);
  });
});

describe("shared resolve vectors (mirrored by Motion.resolveClip in Swift)", () => {
  const R = REVERSED_CLIP;
  const reversed = makeClip({ id: "r", sourceDuration: R.sourceDuration, trimStart: R.trimStart, trimEnd: R.trimEnd, speed: R.speed, reversed: R.reversed, keyframes: R.sourcePins });

  test("a reversed clip at speed 2 with a trim: pins land at their output offsets, x follows the source time", () => {
    expect(clipDuration(reversed)).toBe(4);
    expect(R.sourcePins.map((k) => outputOffsetOf(reversed, k.t))).toEqual(R.offsets);
    // As exported (output-local seconds, ascending) the pins are exactly KEY_PINS.
    const exported = R.sourcePins.map((k) => ({ ...k, t: outputOffsetOf(reversed, k.t) })).sort((a, b) => a.t - b.t);
    expect(exported).toEqual(KEY_PINS);
    expect(resolveClipMotion(reversed, R.at).transform.x).toBeCloseTo(R.x, 9);
  });

  /** A forward speed-1 clip whose source time equals its output time, so the vector's output-local pins are its pins. */
  test.each(RESOLVE_CLIP_VECTORS)("$name", (v) => {
    const c = makeClip({ id: "c", sourceDuration: v.length, keyframes: v.keyframes,
      transform: { scale: v.base.scale, x: v.base.x, y: v.base.y, rotation: v.base.rotation, flipH: false, flipV: false },
      animation: { in: v.animIn as { id: AnimInId; duration: number } | null, out: v.animOut as { id: AnimInId; duration: number } | null, combo: v.animCombo as AnimComboId | null } });
    expect(clipDuration(c)).toBe(v.length);
    const r = resolveClipMotion(c, v.local);
    expectValues({ x: r.transform.x, y: r.transform.y, scale: r.transform.scale, rotation: r.transform.rotation, opacity: r.opacity }, v);
  });

  test("the first resolve vector is the reversed clip itself with its In", () => {
    const v = RESOLVE_CLIP_VECTORS[0];
    const c = { ...reversed, animation: { in: { id: "zoomIn" as const, duration: 3 }, out: null, combo: null } };
    const r = resolveClipMotion(c, v.local);
    expectValues({ x: r.transform.x, y: r.transform.y, scale: r.transform.scale, rotation: r.transform.rotation, opacity: r.opacity }, v);
  });
});

describe("overlays", () => {
  test("base: the overlay's own placement with opacity 1, or its keyframes at time − start", () => {
    const o = makeOverlay({ id: "o", x: 0.3, y: 0.7, scale: 1.5, rotation: 20, start: 2, end: 6 });
    expect(overlayBaseAt(o, 3)).toEqual({ x: 0.3, y: 0.7, scale: 1.5, rotation: 20, opacity: 1 });
    expect(resolveOverlayMotion(o, 3)).toEqual({ x: 0.3, y: 0.7, scale: 1.5, rotation: 20, opacity: 1 });
    expect(hasOverlayMotion(o)).toBe(false);
    const k = { ...o, keyframes: KEY_PINS };
    expect(hasOverlayMotion(k)).toBe(true);
    expectValues(overlayBaseAt(k, 4), { x: 0.2, y: 0, scale: 1.5, rotation: 45, opacity: 0.75 });   // local 2 → midpoint
    expectValues(resolveOverlayMotion(k, 4), { x: 0.2, y: 0, scale: 1.5, rotation: 45, opacity: 0.75 });
  });

  test("In + Loop compose; slides use the overlay distance", () => {
    const o = makeSticker({ id: "s", x: 0.5, y: 0.5, scale: 2, rotation: 10, start: 1, end: 5,
      animation: { in: { id: "slideLeft", duration: 0.2 }, out: null, loop: "spin" } });
    expect(hasOverlayMotion(o)).toBe(true);
    const r = resolveOverlayMotion(o, 1.1);                                // local 0.1: in p = 0.5 → dx 0.125 × 0.25; spin 18°
    expectValues(r, { x: 0.53125, y: 0.5, scale: 2, rotation: 28, opacity: 1 });
    expectValues(resolveOverlayMotion(o, 3), { x: 0.5, y: 0.5, scale: 2, rotation: 10 + 360, opacity: 1 });   // loop only
  });

  test("In, Out and Loop deltas multiply scale and opacity", () => {
    const o = makeOverlay({ id: "o", x: 0.5, y: 0.5, scale: 1, rotation: 0, start: 0, end: 4,
      animation: { in: { id: "zoomIn", duration: 0.2 }, out: { id: "fade", duration: 1 }, loop: "pulse" } });
    const a = resolveOverlayMotion(o, 0.1);                                // in p = 0.5: scale 0.95, opacity 0.875; loop pulse at 0.1 s
    expect(a.scale).toBeCloseTo(0.95 * 1.0809016994374947, 9);
    expect(a.opacity).toBeCloseTo(0.875, 9);
    expect(resolveOverlayMotion(o, 3.5).opacity).toBeCloseTo(0.875, 9);    // out p = 0.5
    expect(resolveOverlayMotion(o, 4).opacity).toBe(0);
  });

  test("time is clamped to the overlay's life; opacity is clamped to 0–1; non-finite time gives the base", () => {
    const o = makeOverlay({ id: "o", start: 1, end: 3, animation: { in: { id: "fade", duration: 1 }, out: { id: "fade", duration: 1 }, loop: null } });
    expect(resolveOverlayMotion(o, 0)).toEqual(resolveOverlayMotion(o, 1));
    expect(resolveOverlayMotion(o, 0).opacity).toBe(0);
    expect(resolveOverlayMotion(o, 9)).toEqual(resolveOverlayMotion(o, 3));
    expect(resolveOverlayMotion(o, NaN)).toEqual({ x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1 });
    const bright = makeOverlay({ id: "b", keyframes: [makeKeyframe({ t: 0, opacity: 3, x: 0.5, y: 0.5 })] });
    expect(resolveOverlayMotion(bright, 1).opacity).toBe(1);
  });
});
