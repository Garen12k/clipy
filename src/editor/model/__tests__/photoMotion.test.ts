import { clipDuration } from "../timeline";
import { makeClip, makeKeyframe, makePhotoClip, PHOTO_MOTION_IDS, type Clip, type PhotoMotionId } from "../types";
import {
  IDENTITY_DELTA, MOTION, PHOTO_MOTION, animInDelta, combine, hasClipMotion, photoMotionAmount, photoMotionDelta, photoMotionPins, resolveClipMotion, sampleKeyframes,
} from "../motion";

/** id, strength, progress → scale, dx, dy. Hand-computed: k = 0.4 + 1.2·s, e = p²(3 − 2p), Z = 0.15·k, P = 0.05·k. */
const VECTORS: [PhotoMotionId, number, number, number, number, number][] = [
  ["zoomIn", 0.5, 0, 1, 0, 0], ["zoomIn", 0.5, 0.25, 1.0234375, 0, 0], ["zoomIn", 0.5, 0.5, 1.075, 0, 0], ["zoomIn", 0.5, 1, 1.15, 0, 0],   // e(0.25) = 0.15625
  ["zoomIn", 0, 1, 1.06, 0, 0], ["zoomIn", 1, 1, 1.24, 0, 0],                                                                                   // k = 0.4 / 1.6
  ["zoomOut", 0.5, 0, 1.15, 0, 0], ["zoomOut", 0.5, 0.25, 1.1265625, 0, 0], ["zoomOut", 0.5, 1, 1, 0, 0],
  ["panLeft", 0.5, 0, 1.1, 0.05, 0], ["panLeft", 0.5, 0.5, 1.1, 0, 0], ["panLeft", 0.5, 1, 1.1, -0.05, 0], ["panLeft", 1, 0, 1.16, 0.08, 0],
  ["panRight", 0.5, 0, 1.1, -0.05, 0], ["panRight", 0.5, 0.25, 1.1, -0.034375, 0], ["panRight", 0.5, 1, 1.1, 0.05, 0],                          // 0.05·(2·0.15625 − 1)
  ["panUp", 0.5, 0, 1.1, 0, 0.05], ["panUp", 0.5, 1, 1.1, 0, -0.05], ["panUp", 0, 0, 1.04, 0, 0.02],
  ["panDown", 0.5, 0, 1.1, 0, -0.05], ["panDown", 0.5, 1, 1.1, 0, 0.05], ["panDown", 1, 1, 1.16, 0, 0.08],
  ["zoomCorner", 0.5, 0, 1, 0, 0], ["zoomCorner", 0.5, 0.5, 1.075, 0.0375, 0.0375], ["zoomCorner", 0.5, 1, 1.15, 0.075, 0.075], ["zoomCorner", 1, 1, 1.24, 0.12, 0.12],
];
const photo = (id: PhotoMotionId, strength: number, extra: Partial<Clip> = {}): Clip => ({ ...makePhotoClip({ id: "p", seconds: 4 }), motion: { id, strength }, ...extra });

test("the photo constants are their own object: MOTION (mirrored in Motion.swift) gained none of them", () => {
  expect(PHOTO_MOTION).toEqual({ zoom: 0.15, pan: 0.05, gentle: 0.4, strong: 1.6 });
  expect(PHOTO_MOTION).not.toBe(MOTION);
  // `pan` is a name both have (the Combos' own, older constant); the three new names are the photo object's alone, and MOTION is as long as it was.
  for (const key of ["zoom", "gentle", "strong"]) expect(key in MOTION).toBe(false);
  expect(Object.keys(MOTION)).toHaveLength(29);
  // At the default strength a motion goes as far as the older Combos do.
  expect(PHOTO_MOTION.zoom).toBe(MOTION.comboZoom);
  expect(PHOTO_MOTION.pan).toBe(MOTION.pan);
  expect(1 + 2 * PHOTO_MOTION.pan).toBeCloseTo(MOTION.panScale, 12);
});

test("photoMotionAmount: 0.4 at gentle, exactly 1 in the middle, 1.6 at strong; clamped; not a number → the middle", () => {
  expect(photoMotionAmount(0)).toBeCloseTo(0.4, 12);
  expect(photoMotionAmount(0.5)).toBe(1);
  expect(photoMotionAmount(1)).toBeCloseTo(1.6, 12);
  expect(photoMotionAmount(-3)).toBeCloseTo(0.4, 12);
  expect(photoMotionAmount(9)).toBeCloseTo(1.6, 12);
  expect(photoMotionAmount(NaN)).toBe(1);
});

test.each(VECTORS)("photoMotionDelta(%s, strength %d, p %d)", (id, strength, p, scale, dx, dy) => {
  const d = photoMotionDelta(id, strength, p);
  expect(d.scale).toBeCloseTo(scale, 12);
  expect(d.dx).toBeCloseTo(dx, 12);
  expect(d.dy).toBeCloseTo(dy, 12);
  expect(d.rotation).toBe(0);
  expect(d.opacity).toBe(1);
});

test("photoMotionDelta is total: progress is clamped, a progress that is not a number moves nothing", () => {
  for (const id of PHOTO_MOTION_IDS) {
    expect(photoMotionDelta(id, 0.5, -2)).toEqual(photoMotionDelta(id, 0.5, 0));
    expect(photoMotionDelta(id, 0.5, 7)).toEqual(photoMotionDelta(id, 0.5, 1));
    expect(photoMotionDelta(id, 0.5, NaN)).toEqual(IDENTITY_DELTA);
  }
});

test("a photo at Fill never shows its background: the enlarged picture always covers the frame", () => {
  // The box is `scale` frames wide and its centre is `dx` from the frame's: it covers when scale / 2 − |dx| ≥ 1 / 2 (the same in y).
  for (const id of PHOTO_MOTION_IDS) for (const s of [0, 0.5, 1]) for (const p of [0, 0.1, 0.5, 0.9, 1]) {
    const d = photoMotionDelta(id, s, p);
    expect(d.scale / 2 - Math.abs(d.dx)).toBeGreaterThanOrEqual(0.5 - 1e-12);
    expect(d.scale / 2 - Math.abs(d.dy)).toBeGreaterThanOrEqual(0.5 - 1e-12);
  }
});

test("resolveClipMotion: a photo's motion at linear progress through the clip, on top of its own placement", () => {
  const c = photo("panLeft", 0.5, { transform: { scale: 1.2, x: 0.1, y: -0.2, rotation: 15, flipH: true, flipV: false } });
  const at = (t: number) => resolveClipMotion(c, t).transform;
  expect(at(0)).toEqual({ scale: expect.closeTo(1.32, 12), x: expect.closeTo(0.15, 12), y: -0.2, rotation: 15, flipH: true, flipV: false });   // 1.2·1.1, 0.1 + 0.05
  expect(at(2).x).toBeCloseTo(0.1, 12);                                                                                                          // half way: dx = 0
  expect(at(4).x).toBeCloseTo(0.05, 12);
  expect(at(1).x).toBeCloseTo(0.1 + 0.05 * (1 - 2 * 0.15625), 12);                                                                               // p = 0.25
  expect(resolveClipMotion(c, 2).opacity).toBe(1);
  expect(resolveClipMotion(c, NaN).transform).toEqual(c.transform);                                                                              // not a number: the base, no animation
});

test("resolveClipMotion: In / Out stay with a motion; a Combo or keyframes own the clip and the motion does not play", () => {
  const faded = photo("zoomIn", 0.5, { animation: { in: { id: "fade", duration: 1 }, out: null, combo: null } });
  expect(resolveClipMotion(faded, 0.5).opacity).toBeCloseTo(0.875, 12);                 // easeOut(0.5)
  expect(resolveClipMotion(faded, 4).transform.scale).toBeCloseTo(1.15, 12);
  const combo = photo("zoomIn", 0.5, { animation: { in: null, out: null, combo: "zoomOutSlow" } });
  expect(resolveClipMotion(combo, 4).transform.scale).toBe(1);                          // the Combo alone: 1 + 0.15·(1 − 1)
  const pinned = photo("zoomIn", 0.5, { keyframes: [makeKeyframe({ t: 0, scale: 2 })] });
  expect(resolveClipMotion(pinned, 4).transform.scale).toBe(2);
  expect(resolveClipMotion({ ...makeClip({ id: "v", sourceDuration: 4 }), motion: { id: "zoomIn", strength: 0.5 } }, 4).transform.scale).toBe(1);   // never a video
});

test("hasClipMotion: true for a photo whose motion plays, and only then", () => {
  expect(hasClipMotion(makePhotoClip({ id: "p" }))).toBe(false);
  expect(hasClipMotion(photo("zoomIn", 0.5))).toBe(true);
  expect(hasClipMotion({ ...makeClip({ id: "v", sourceDuration: 4 }), motion: { id: "zoomIn", strength: 0.5 } })).toBe(false);
});

test("photoMotionPins: two pins, at the start and the end, holding the placement combined with the motion there", () => {
  const c = photo("zoomCorner", 1, { transform: { scale: 1.5, x: 0.1, y: 0, rotation: 30, flipH: false, flipV: false } });
  expect(photoMotionPins(c, 4)).toEqual([
    { t: 0, x: 0.1, y: 0, scale: 1.5, rotation: 30, opacity: 1 },
    { t: 4, x: expect.closeTo(0.22, 12), y: expect.closeTo(0.12, 12), scale: expect.closeTo(1.86, 12), rotation: 30, opacity: 1 },   // 1.5·1.24, + 0.12
  ]);
  expect(photoMotionPins(makePhotoClip({ id: "p" }), 4)).toBeNull();
  expect(photoMotionPins(c, 0)).toBeNull();
  expect(photoMotionPins(c, NaN)).toBeNull();
  expect(photoMotionPins({ ...c, keyframes: [makeKeyframe({ t: 0 })] }, 4)).toBeNull();
});

test("PROOF the export's two pins play exactly what the preview shows, for every motion, at every time", () => {
  for (const id of PHOTO_MOTION_IDS) for (const strength of [0, 0.35, 1]) {
    const c = photo(id, strength, { transform: { scale: 1.3, x: 0.1, y: -0.2, rotation: 15, flipH: true, flipV: false } });
    const pins = photoMotionPins(c, clipDuration(c))!;
    expect(pins.map((k) => k.t)).toEqual([0, 4]);
    for (const t of [0, 0.4, 1, 2, 3.3, 4]) {
      const fromPins = sampleKeyframes(pins, t)!;      // Motion.swift samples pins with the same formula (parity-tested)
      const shown = resolveClipMotion(c, t).transform;
      expect(fromPins.x).toBeCloseTo(shown.x, 12);
      expect(fromPins.y).toBeCloseTo(shown.y, 12);
      expect(fromPins.scale).toBeCloseTo(shown.scale, 12);
      expect(fromPins.rotation).toBeCloseTo(shown.rotation, 12);
      expect(fromPins.opacity).toBe(1);
    }
  }
});

test("PROOF with an In animation too: the export combines its In delta with the pins, and that is the preview's value", () => {
  const c = photo("panUp", 0.8, { animation: { in: { id: "slideLeft", duration: 1 }, out: null, combo: null } });
  const pins = photoMotionPins(c, 4)!;
  for (const t of [0, 0.25, 0.5, 0.99]) {
    const exported = combine(sampleKeyframes(pins, t)!, animInDelta("slideLeft", t / 1, MOTION.slideClip));   // Motion.resolveClip: pins, then In / Out
    const shown = resolveClipMotion(c, t).transform;
    expect(exported.x).toBeCloseTo(shown.x, 12);
    expect(exported.y).toBeCloseTo(shown.y, 12);
    expect(exported.scale).toBeCloseTo(shown.scale, 12);
  }
});
