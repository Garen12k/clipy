import { clampOpacity, LAYER_LIMITS, makeClip, makeLayer, makePhotoClip, makeProject, MASK, MASK_IDS, newLayer, newPhotoClip, newVideoClip, SCHEMA_VERSION } from "../types";

test("schema constants", () => {
  expect(SCHEMA_VERSION).toBe(15);
  expect(MASK_IDS).toEqual(["none", "rounded", "circle"]);
  expect(LAYER_LIMITS).toEqual({ max: 8, maxVideoAtOnce: 2, defaultScale: 0.4, minDuration: 0.3 });
  expect(MASK).toEqual({ roundedRadius: 0.12 });
});

test("clampOpacity clamps finite numbers and sends anything else to 1", () => {
  expect(clampOpacity(0.5)).toBe(0.5);
  expect(clampOpacity(-3)).toBe(0);
  expect(clampOpacity(7)).toBe(1);
  for (const v of [NaN, Infinity, "0.2", null, undefined, {}]) expect(clampOpacity(v)).toBe(1);
});

test("factories default opacity, mask and layers", () => {
  expect(newVideoClip({ id: "a", sourceUri: "u", sourceDuration: 5, width: 1, height: 1 })).toMatchObject({ opacity: 1, mask: "none" });
  expect(newPhotoClip({ id: "a", sourceUri: "u", width: 1, height: 1 })).toMatchObject({ opacity: 1, mask: "none" });
  expect(makeClip({ id: "a", sourceDuration: 5 })).toMatchObject({ opacity: 1, mask: "none" });
  expect(makeProject().layers).toEqual([]);
  expect(makeProject().layers).not.toBe(makeProject().layers);
});

test("makeLayer is a clip with a start", () => {
  expect(makeLayer({ id: "l", sourceDuration: 5 })).toMatchObject({ id: "l", start: 0, kind: "video", opacity: 1 });
  expect(makeLayer({ id: "l", sourceDuration: 5, start: 2 }).start).toBe(2);
});

test("newLayer deep-copies the clip, centres it at the default scale and drops the transition", () => {
  const clip = makeClip({
    id: "c", sourceDuration: 8, transform: { scale: 1.5, x: 0.3, y: -0.2, rotation: 20, flipH: true, flipV: false },
    transitionOut: { type: "fade", duration: 0.5 }, keyframes: [{ t: 1, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 }],
    speedCurve: { id: "montage", steps: [{ from: 0, speed: 2 }] }, animation: { in: { id: "fade", duration: 0.5 }, out: null, combo: null },
  });
  const l = newLayer(clip, 1.23456);
  expect(l.start).toBe(1.235);
  expect(l.transform).toEqual({ scale: LAYER_LIMITS.defaultScale, x: 0, y: 0, rotation: 20, flipH: true, flipV: false });
  expect(l.transitionOut).toEqual({ type: "none", duration: 0 });
  expect(clip.transform.scale).toBe(1.5);
  expect(clip.transitionOut.type).toBe("fade");
  expect(l.transform).not.toBe(clip.transform);
  expect(l.crop).not.toBe(clip.crop);
  expect(l.background).not.toBe(clip.background);
  expect(l.adjust).not.toBe(clip.adjust);
  expect(l.animation).not.toBe(clip.animation);
  expect(l.animation.in).not.toBe(clip.animation.in);
  expect(l.keyframes).not.toBe(clip.keyframes);
  expect(l.keyframes[0]).not.toBe(clip.keyframes[0]);
  expect(l.speedCurve).not.toBe(clip.speedCurve);
  expect(l.speedCurve!.steps).not.toBe(clip.speedCurve!.steps);
  expect(l.speedCurve!.steps[0]).not.toBe(clip.speedCurve!.steps[0]);
  expect(newLayer(clip, -4).start).toBe(0);
  expect(newLayer(makePhotoClip({ id: "p" }), 0).speedCurve).toBeNull();
});
