import {
  ANIM_COMBO_IDS, ANIM_IN_IDS, ANIM_LIMITS, ANIM_LOOP_IDS, clampAnimEdge, clampClipAnimation, clampClipKeyframes, clampOverlayAnimation,
  clampOverlayKeyframes, KEYFRAME_LIMITS, makeClip, makeKeyframe, makeOverlay, makePhotoClip, makeSticker, newPhotoClip, newVideoClip,
  NO_CLIP_ANIMATION, NO_OVERLAY_ANIMATION, OVERLAY_LIMITS, SCHEMA_VERSION, TRANSFORM_LIMITS,
} from "../types";

test("schema is v21 and the id lists are as specified", () => {
  expect(SCHEMA_VERSION).toBe(21);
  expect(ANIM_IN_IDS).toEqual(["fade", "slideLeft", "slideRight", "slideUp", "slideDown", "zoomIn", "zoomOut", "spin", "pop", "rise"]);
  expect(ANIM_COMBO_IDS).toEqual(["zoomInSlow", "zoomOutSlow", "panLeft", "panRight", "sway", "pulse"]);
  expect(ANIM_LOOP_IDS).toEqual(["wiggle", "pulse", "spin", "float", "blink", "shake"]);
  expect(ANIM_LIMITS).toEqual({ minDuration: 0.1, maxDuration: 2, defaultDuration: 0.5 });
  expect(KEYFRAME_LIMITS).toEqual({ minGap: 0.05, max: 50, opacity: [0, 1] });
  expect(NO_CLIP_ANIMATION).toEqual({ in: null, out: null, combo: null });
  expect(NO_OVERLAY_ANIMATION).toEqual({ in: null, out: null, loop: null });
});

test("clampAnimEdge", () => {
  expect(clampAnimEdge({ id: "fade", duration: 1 })).toEqual({ id: "fade", duration: 1 });
  expect(clampAnimEdge({ id: "bogus", duration: 1 })).toBeNull();
  expect(clampAnimEdge("fade")).toBeNull();
  expect(clampAnimEdge(null)).toBeNull();
  expect(clampAnimEdge({ id: "pop", duration: 0 })).toEqual({ id: "pop", duration: 0.1 });
  expect(clampAnimEdge({ id: "pop", duration: 9 })).toEqual({ id: "pop", duration: 2 });
  expect(clampAnimEdge({ id: "pop", duration: Number.NaN })).toEqual({ id: "pop", duration: 0.5 });
  expect(clampAnimEdge({ id: "pop" })).toEqual({ id: "pop", duration: 0.5 });
});

test("clampClipAnimation: combo wins, unknown ids null, junk input is no animation", () => {
  expect(clampClipAnimation({ in: { id: "fade", duration: 1 }, out: { id: "zoomOut", duration: 1 }, combo: null }))
    .toEqual({ in: { id: "fade", duration: 1 }, out: { id: "zoomOut", duration: 1 }, combo: null });
  expect(clampClipAnimation({ in: { id: "fade", duration: 1 }, out: { id: "fade", duration: 1 }, combo: "sway" })).toEqual({ in: null, out: null, combo: "sway" });
  expect(clampClipAnimation({ in: null, out: null, combo: "wiggle" })).toEqual(NO_CLIP_ANIMATION);
  expect(clampClipAnimation(undefined)).toEqual(NO_CLIP_ANIMATION);
  expect(clampClipAnimation(7)).toEqual(NO_CLIP_ANIMATION);
  expect(clampClipAnimation(undefined)).not.toBe(NO_CLIP_ANIMATION);
});

test("clampOverlayAnimation", () => {
  expect(clampOverlayAnimation({ in: { id: "rise", duration: 0.3 }, out: null, loop: "blink" })).toEqual({ in: { id: "rise", duration: 0.3 }, out: null, loop: "blink" });
  expect(clampOverlayAnimation({ in: { id: "x", duration: 1 }, out: null, loop: "sway" })).toEqual(NO_OVERLAY_ANIMATION);
  expect(clampOverlayAnimation(null)).toEqual(NO_OVERLAY_ANIMATION);
});

test("makeKeyframe defaults", () => {
  expect(makeKeyframe({ t: 1 })).toEqual({ t: 1, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 });
  expect(makeKeyframe({ t: 1, scale: 2 }).scale).toBe(2);
});

test("clampClipKeyframes: drops non-finite, clamps, keeps rotation un-normalised, sorts, min gap, max count", () => {
  expect(clampClipKeyframes(undefined)).toEqual([]);
  expect(clampClipKeyframes("x")).toEqual([]);
  const [lo, hi] = TRANSFORM_LIMITS.offset; const [sLo, sHi] = TRANSFORM_LIMITS.scale;
  const out = clampClipKeyframes([
    { t: 2, x: 9, y: -9, scale: 99, rotation: 720, opacity: 5 },
    { t: 1, x: 0, y: 0, scale: 0, rotation: 350, opacity: -1 },
    { t: Number.NaN, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    { t: 3, x: Number.POSITIVE_INFINITY, y: 0, scale: 1, rotation: 0, opacity: 1 },
    { t: -1, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    "junk", null,
  ]);
  expect(out).toEqual([
    { t: 0, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    { t: 1, x: 0, y: 0, scale: sLo, rotation: 350, opacity: 0 },
    { t: 2, x: hi, y: lo, scale: sHi, rotation: 720, opacity: 1 },
  ]);
});

test("keyframes: min gap drops the later entry; at most max kept", () => {
  const gap = clampClipKeyframes([makeKeyframe({ t: 1 }), makeKeyframe({ t: 1.03, x: 1 }), makeKeyframe({ t: 1.05, x: 0.5 })]);
  expect(gap.map((k) => k.t)).toEqual([1, 1.05]);
  // Exactly minGap apart counts as apart, whatever the float noise (0.15 − 0.1 is a hair under 0.05).
  expect(clampClipKeyframes([makeKeyframe({ t: 0.1 }), makeKeyframe({ t: 0.15 })]).map((k) => k.t)).toEqual([0.1, 0.15]);
  const many = Array.from({ length: 80 }, (_, i) => makeKeyframe({ t: i }));
  const kept = clampClipKeyframes(many);
  expect(kept).toHaveLength(KEYFRAME_LIMITS.max);
  expect(kept[49].t).toBe(49);
});

test("clampOverlayKeyframes uses overlay units", () => {
  const [sLo, sHi] = OVERLAY_LIMITS.scale;
  const out = clampOverlayKeyframes([
    { t: 0, x: 3, y: -3, scale: 100, rotation: 400, opacity: 0.5 },
    { t: 1, x: 0.3, y: 0.4, scale: 0, rotation: 0, opacity: 1 },
  ]);
  expect(out).toEqual([
    { t: 0, x: 1, y: 0, scale: sHi, rotation: 400, opacity: 0.5 },
    { t: 1, x: 0.3, y: 0.4, scale: sLo, rotation: 0, opacity: 1 },
  ]);
});

test("factories give every item fresh animation / keyframes", () => {
  const a = newVideoClip({ id: "a", sourceUri: "u", sourceDuration: 1, width: 1, height: 1 });
  const b = newVideoClip({ id: "b", sourceUri: "u", sourceDuration: 1, width: 1, height: 1 });
  expect(a.animation).toEqual(NO_CLIP_ANIMATION); expect(a.keyframes).toEqual([]);
  expect(a.animation).not.toBe(b.animation); expect(a.keyframes).not.toBe(b.keyframes);
  expect(newPhotoClip({ id: "p", sourceUri: "u", width: 1, height: 1 })).toMatchObject({ animation: NO_CLIP_ANIMATION, keyframes: [] });
  expect(makeClip({ id: "c", sourceDuration: 1 })).toMatchObject({ animation: NO_CLIP_ANIMATION, keyframes: [] });
  expect(makePhotoClip({ id: "d" })).toMatchObject({ animation: NO_CLIP_ANIMATION, keyframes: [] });
  const o1 = makeOverlay({ id: "o1" }); const o2 = makeOverlay({ id: "o2" });
  expect(o1).toMatchObject({ animation: NO_OVERLAY_ANIMATION, keyframes: [] });
  expect(o1.animation).not.toBe(o2.animation); expect(o1.keyframes).not.toBe(o2.keyframes);
  const s1 = makeSticker({ id: "s1" }); const s2 = makeSticker({ id: "s2" });
  expect(s1).toMatchObject({ animation: NO_OVERLAY_ANIMATION, keyframes: [] });
  expect(s1.animation).not.toBe(s2.animation); expect(s1.keyframes).not.toBe(s2.keyframes);
});
