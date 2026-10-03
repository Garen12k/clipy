import { applyDrag, applyPinch, applyTwist, composeGesture, gestureTransform, restingMagnets } from "../clipGesture";
import { DEFAULT_TRANSFORM, FULL_CROP, type ClipTransform } from "../types";

const t = (patch: Partial<ClipTransform> = {}): ClipTransform => ({ ...DEFAULT_TRANSFORM, ...patch });
const portrait = { width: 1080, height: 1920 };

test("a drag of half the frame width moves x by 0.5; vertical drags move y by frame height", () => {
  expect(applyDrag(t({ x: 0.1 }), 135, 0, 270, 480).x).toBeCloseTo(0.6, 10);
  expect(applyDrag(t(), 0, -120, 270, 480).y).toBeCloseTo(-0.25, 10);
  expect(applyDrag(t(), 1000, 0, 270, 480).x).toBe(1); // clamped
  expect(applyDrag(t({ x: 0.2 }), 50, 50, 0, 0)).toEqual(t({ x: 0.2 })); // no frame yet: unchanged
});

test("a pinch multiplies the scale, clamped at 5", () => {
  expect(applyPinch(t({ scale: 1.5 }), 2).scale).toBe(3);
  expect(applyPinch(t({ scale: 3 }), 2).scale).toBe(5);
  expect(applyPinch(t({ scale: 1 }), 0.01).scale).toBe(0.2);
});

test("a twist of π/2 adds 90°, normalised", () => {
  expect(applyTwist(t(), Math.PI / 2).rotation).toBeCloseTo(90, 10);
  expect(applyTwist(t({ rotation: 135 }), Math.PI / 2).rotation).toBeCloseTo(-135, 10);
  expect(applyTwist(t({ rotation: 10 }), -Math.PI / 18).rotation).toBeCloseTo(0, 10);
});

test("each gesture keeps the fields it does not own, including flips", () => {
  const s = t({ x: 0.1, y: -0.2, scale: 1.4, rotation: 30, flipH: true });
  expect(applyDrag(s, 27, 0, 270, 480)).toMatchObject({ scale: 1.4, rotation: 30, flipH: true });
  expect(applyPinch(s, 2)).toMatchObject({ x: 0.1, y: -0.2, rotation: 30, flipH: true });
  expect(applyTwist(s, 0.1)).toMatchObject({ x: 0.1, y: -0.2, scale: 1.4, flipH: true });
});

test("composition does not depend on which gesture is applied first", () => {
  const s = t({ x: 0.3, scale: 2, rotation: 170 });
  const a = applyTwist(applyPinch(applyDrag(s, 100, -40, 270, 480), 1.7), 0.4);
  const b = applyDrag(applyTwist(applyPinch(s, 1.7), 0.4), 100, -40, 270, 480);
  const c = applyPinch(applyDrag(applyTwist(s, 0.4), 100, -40, 270, 480), 1.7);
  expect(b).toEqual(a);
  expect(c).toEqual(a);
  expect(composeGesture(s, { dx: 100, dy: -40, scale: 1.7, rotation: 0.4 }, 270, 480)).toEqual(a);
});

test("gestureTransform snaps the composed transform and reports the magnets that engaged", () => {
  // 3 px of a 270 px frame ≈ 0.011 — inside the 0.02 centre magnet.
  const r = gestureTransform(t({ x: 0.2 }), { dx: -51, dy: 0, scale: 1, rotation: 0 }, portrait, FULL_CROP, 270, 480);
  expect(r.transform.x).toBe(0);
  expect(r.snapped).toEqual(["x"]);
  // Well away from every magnet: the raw value comes through.
  const free = gestureTransform(t(), { dx: 54, dy: 0, scale: 1.5, rotation: 0.3 }, portrait, FULL_CROP, 270, 480);
  expect(free.transform.x).toBeCloseTo(0.2, 10);
  expect(free.transform.scale).toBeCloseTo(1.5, 10);
  expect(free.snapped).toEqual([]);
});

test("gestureTransform snaps to Fit using the snapped rotation (a portrait picture twisted to 89°)", () => {
  // Portrait 1080×1920 in a 9:16 frame: upright Fit = 1; on its side Fit = (270/1920)/(480/1080) ≈ 0.3164.
  const fitTurned = (270 / 1920) / (480 / 1080);
  const r = gestureTransform(t(), { dx: 0, dy: 0, scale: 0.32, rotation: (89 * Math.PI) / 180 }, portrait, FULL_CROP, 270, 480);
  expect(r.transform.rotation).toBe(90);
  expect(r.transform.scale).toBeCloseTo(fitTurned, 10);
  expect(r.snapped).toEqual(["rotation", "scale"]);
});

test("restingMagnets lists the magnets a transform already sits on", () => {
  expect(restingMagnets(t(), 0.5)).toEqual(["x", "y", "rotation", "scale"]);
  expect(restingMagnets(t({ x: 0.3, rotation: 12, scale: 0.5 }), 0.5)).toEqual(["y", "scale"]);
  expect(restingMagnets(t({ x: 0.3, y: 0.1, rotation: -90, scale: 2 }), 0.5)).toEqual(["rotation"]);
});
