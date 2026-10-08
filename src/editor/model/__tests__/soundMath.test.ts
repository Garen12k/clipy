import { dbToGain, LEVEL, levelGainDb, SOFT_CLIP, softClip } from "../soundMath";
import { CLIP_VECTORS, LEVEL_VECTORS } from "./soundMath.vectors";

test("the constants", () => {
  expect(LEVEL).toEqual({ targetDb: -18, gateDb: -45, maxBoostDb: 18, maxCutDb: 6, blockSeconds: 0.4 });
  expect(SOFT_CLIP).toEqual({ knee: 0.9, ceiling: 0.98 });
});

test("dbToGain: 0 dB is 1, 6 dB about 2, not a number is 1", () => {
  expect(dbToGain(0)).toBe(1);
  expect(dbToGain(6)).toBeCloseTo(1.995262, 5);
  expect(dbToGain(-6)).toBeCloseTo(0.501187, 5);
  expect(dbToGain(18)).toBeCloseTo(7.943282, 5);
  expect(dbToGain(NaN)).toBe(1);
  expect(dbToGain(Infinity)).toBe(1);
  expect(dbToGain(-Infinity)).toBe(1);
});

test("levelGainDb: the gain that brings the gated level to the target, inside −6 … +18 dB", () => {
  for (const v of LEVEL_VECTORS) expect(levelGainDb(v.blocks)).toBeCloseTo(v.db, 3);
  expect(levelGainDb([Math.pow(10, -18 / 10)])).toBeCloseTo(0, 9);   // already at the target
});

test("levelGainDb never gives anything but a number inside its range", () => {
  const odd: number[][] = [[NaN], [Infinity, -Infinity], [-1, -0.5], [0], [-0], [Number.MAX_VALUE, Number.MAX_VALUE], [Number.MIN_VALUE], [1e300, 0.001, NaN]];
  for (const blocks of odd) {
    const db = levelGainDb(blocks);
    expect(Number.isFinite(db)).toBe(true);
    expect(db).toBeGreaterThanOrEqual(-LEVEL.maxCutDb);
    expect(db).toBeLessThanOrEqual(LEVEL.maxBoostDb);
  }
  expect(levelGainDb([-1, -0.5])).toBe(0);                                   // a negative block is not a level: left out
  expect(levelGainDb([Number.MAX_VALUE, Number.MAX_VALUE])).toBe(-6);        // a sum past the largest number still cuts by the most
  // A block exactly at the gate is silence; just above it counts.
  expect(levelGainDb([Math.pow(10, LEVEL.gateDb / 10)])).toBe(0);
  expect(levelGainDb([Math.pow(10, LEVEL.gateDb / 10) * 1.01])).toBe(18);
});

test("softClip: unchanged up to the knee, never above the ceiling, odd", () => {
  for (const v of CLIP_VECTORS) expect(softClip(v.x)).toBeCloseTo(v.y, 5);
  for (const x of [0.91, 1, 3, 100]) { expect(softClip(x)).toBeLessThanOrEqual(SOFT_CLIP.ceiling); expect(softClip(-x)).toBe(-softClip(x)); }
  expect(softClip(0.9)).toBe(0.9);
  expect(softClip(NaN)).toBe(0);
  expect(softClip(Infinity)).toBe(0);
  expect(softClip(-Infinity)).toBe(0);
  expect(softClip(Number.MAX_VALUE)).toBe(SOFT_CLIP.ceiling);
  // Continuous at the knee: no step.
  expect(softClip(0.9000001) - 0.9).toBeLessThan(1e-6);
  // Rising all the way: a louder sample never comes out quieter.
  let last = 0;
  for (let x = 0; x <= 3; x += 0.01) { const y = softClip(x); expect(y).toBeGreaterThanOrEqual(last); last = y; }
});
