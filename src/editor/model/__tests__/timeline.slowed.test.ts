import { isSlowed, slowestSpeed } from "../timeline";
import { makeClip, makePhotoClip, SPEED_CURVE_IDS, type Clip } from "../types";

const curved = (trimEnd: number): Clip => ({
  ...makeClip({ id: "c", sourceDuration: 8, trimEnd }),
  speed: 1, speedCurve: { id: SPEED_CURVE_IDS[0], steps: [{ from: 0, speed: 2 }, { from: 4, speed: 0.4 }, { from: 6, speed: 1.5 }] },
});

test("a constant-speed clip: its speed; slowed only under 1×", () => {
  expect(slowestSpeed(makeClip({ id: "a", sourceDuration: 8 }))).toBe(1);
  expect(isSlowed(makeClip({ id: "a", sourceDuration: 8 }))).toBe(false);
  expect(slowestSpeed(makeClip({ id: "a", sourceDuration: 8, speed: 0.5 }))).toBe(0.5);
  expect(isSlowed(makeClip({ id: "a", sourceDuration: 8, speed: 0.5 }))).toBe(true);
  expect(isSlowed(makeClip({ id: "a", sourceDuration: 8, speed: 0.99 }))).toBe(true);
  expect(isSlowed(makeClip({ id: "a", sourceDuration: 8, speed: 2 }))).toBe(false);
});

test("a curve: the slowest span INSIDE the trim decides", () => {
  expect(slowestSpeed(curved(8))).toBe(0.4);
  expect(isSlowed(curved(8))).toBe(true);
  expect(slowestSpeed(curved(3))).toBe(2);            // trimmed before the slow part
  expect(isSlowed(curved(3))).toBe(false);
});

test("total: a photo is never slowed, and a speed that is not a number counts as 1", () => {
  expect(isSlowed(makePhotoClip({ id: "p" }))).toBe(false);
  expect(slowestSpeed({ ...makeClip({ id: "a", sourceDuration: 8 }), speed: NaN })).toBe(1);
});
