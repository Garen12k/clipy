import {
  clampSpeedCurve, makeClip, makePhotoClip, newPhotoClip, newVideoClip, SCHEMA_VERSION, SPEED_CURVE_IDS, SPEED_CURVE_LIMITS, SPEED_LIMITS,
} from "../types";
import { curveSteps } from "../timeline";
import { SPEED_CURVES } from "../../effects";

const video = { kind: "video" as const };

test("schema is v12; curve ids and limits are as specified", () => {
  expect(SCHEMA_VERSION).toBe(12);
  expect(SPEED_CURVE_IDS).toEqual(["montage", "hero", "bullet", "jumpCut", "flashIn", "flashOut"]);
  expect(SPEED_CURVE_LIMITS).toEqual({ slices: 8, maxSteps: 64, minStep: 0.01 });
});

test("every factory defaults speedCurve to null", () => {
  expect(newVideoClip({ id: "a", sourceUri: "file:///a.mp4", sourceDuration: 4, width: 1, height: 1 }).speedCurve).toBeNull();
  expect(newPhotoClip({ id: "p", sourceUri: "file:///p.jpg", width: 1, height: 1 }).speedCurve).toBeNull();
  expect(makeClip({ id: "a", sourceDuration: 4 }).speedCurve).toBeNull();
  expect(makePhotoClip({ id: "p" }).speedCurve).toBeNull();
});

test("clampSpeedCurve keeps a valid curve as it is", () => {
  const steps = curveSteps("hero", 0, 8);
  expect(clampSpeedCurve({ id: "hero", steps }, video)).toEqual({ id: "hero", steps });
});

test("clampSpeedCurve: junk, unknown ids, empty step lists and photos are no curve", () => {
  const steps = [{ from: 0, speed: 2 }];
  expect(clampSpeedCurve(null, video)).toBeNull();
  expect(clampSpeedCurve(undefined, video)).toBeNull();
  expect(clampSpeedCurve("hero", video)).toBeNull();
  expect(clampSpeedCurve({ id: "bogus", steps }, video)).toBeNull();
  expect(clampSpeedCurve({ id: "hero", steps: "no" }, video)).toBeNull();
  expect(clampSpeedCurve({ id: "hero", steps: [] }, video)).toBeNull();
  expect(clampSpeedCurve({ id: "hero" }, video)).toBeNull();
  expect(clampSpeedCurve({ id: "hero", steps: [{ from: Number.NaN, speed: 1 }, "x", null, { from: 1 }] }, video)).toBeNull();   // nothing usable left
  expect(clampSpeedCurve({ id: "hero", steps }, { kind: "photo" })).toBeNull();
});

test("clampSpeedCurve repairs steps: non-finite dropped, speeds clamped, sorted, extra fields removed", () => {
  const out = clampSpeedCurve({ id: "bullet", extra: 1, steps: [
    { from: 3, speed: 9 },                              // clamped to 4
    { from: 1, speed: 0.01, junk: true },               // clamped to 0.25
    { from: Number.POSITIVE_INFINITY, speed: 1 },       // dropped
    { from: 2, speed: Number.NaN },                     // dropped
    { from: "2", speed: 1 },                            // dropped
    { from: 0, speed: 2 },
  ] }, video);
  expect(out).toEqual({ id: "bullet", steps: [{ from: 0, speed: 2 }, { from: 1, speed: SPEED_LIMITS[0] }, { from: 3, speed: SPEED_LIMITS[1] }] });
});

test("clampSpeedCurve drops a step whose span to the next step is shorter than 0.01 s", () => {
  const out = clampSpeedCurve({ id: "hero", steps: [
    { from: 0, speed: 1 }, { from: 1, speed: 2 }, { from: 1.005, speed: 3 }, { from: 2, speed: 4 }, { from: 2.01, speed: 0.5 },
  ] }, video);
  // the 1 → 1.005 step is 0.005 s long → dropped; 2 → 2.01 is exactly 0.01 s → kept; the last step runs on, so it always stays
  expect(out!.steps).toEqual([{ from: 0, speed: 1 }, { from: 1.005, speed: 3 }, { from: 2, speed: 4 }, { from: 2.01, speed: 0.5 }]);
  expect(clampSpeedCurve(out, video)).toEqual(out);   // idempotent
});

test("clampSpeedCurve keeps at most 64 steps (the first 64)", () => {
  const steps = Array.from({ length: 100 }, (_, i) => ({ from: i, speed: 1 + (i % 3) }));
  const out = clampSpeedCurve({ id: "montage", steps }, video);
  expect(out!.steps).toHaveLength(64);
  expect(out!.steps).toEqual(steps.slice(0, 64));
});

test("curveSteps: from_i = trimStart + i × (trimEnd − trimStart) / 8, speeds from the preset within the speed limits", () => {
  for (const id of SPEED_CURVE_IDS) {
    const steps = curveSteps(id, 1, 5);
    expect(steps.map((s) => s.from)).toEqual([1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5]);
    expect(steps.map((s) => s.speed)).toEqual([...SPEED_CURVES[id].shape]);
    for (const s of steps) { expect(s.speed).toBeGreaterThanOrEqual(SPEED_LIMITS[0]); expect(s.speed).toBeLessThanOrEqual(SPEED_LIMITS[1]); }
    expect(clampSpeedCurve({ id, steps }, video)).toEqual({ id, steps });   // what a preset writes survives the sanity pass untouched
  }
  // the shortest clip (0.1 s) still gives eight steps that survive the sanity pass
  const tiny = curveSteps("jumpCut", 3, 3.1);
  expect(clampSpeedCurve({ id: "jumpCut", steps: tiny }, video)!.steps).toHaveLength(8);
});
