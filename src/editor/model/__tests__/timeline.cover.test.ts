import { coverTimeOf, frameAt, LAST_FRAME_SLACK } from "../timeline";
import { makeClip, makePhotoClip, makeProject, type Cover } from "../types";

const a = makeClip({ id: "a", sourceDuration: 4 });              // timeline 0–4
const b = makeClip({ id: "b", sourceDuration: 6, speed: 2 });    // 6 / 2 = 3 s → timeline 4–7
const p = (cover: Cover | null = null) => makeProject({ clips: [a, b], cover });

test("coverTimeOf: 0 without a cover, else the time clamped to the project as it is now", () => {
  expect(coverTimeOf(p())).toBe(0);
  expect(coverTimeOf(p({ time: 5, title: "" }))).toBe(5);
  expect(coverTimeOf(p({ time: 99, title: "" }))).toBe(7);    // beyond the end (clips were deleted) → the end, 4 + 3
  expect(coverTimeOf(p({ time: -2, title: "" }))).toBe(0);
  expect(coverTimeOf(p({ time: NaN, title: "" }))).toBe(0);
  expect(coverTimeOf(makeProject({ cover: { time: 3, title: "" } }))).toBe(0);   // no clips
});

test("frameAt gives the clip and the source second shown at a project time", () => {
  expect(LAST_FRAME_SLACK).toBe(0.05);
  expect(frameAt(p(), 2)).toEqual({ clip: a, sourceTime: 2 });
  expect(frameAt(p(), 5)).toEqual({ clip: b, sourceTime: 2 });     // 1 s into b at 2× → source 0 + 1 × 2
  expect(frameAt(p(), -1)).toEqual({ clip: a, sourceTime: 0 });
  // The end is pulled back by the slack: 7 − 0.05 = 6.95 → 2.95 s into b → source 2.95 × 2 = 5.9
  const end = frameAt(p(), 7)!;
  expect(end.clip).toBe(b);
  expect(end.sourceTime).toBeCloseTo(5.9, 9);
  expect(frameAt(p(), Infinity)).toEqual({ clip: a, sourceTime: 0 });   // not finite → the start
  expect(frameAt(makeProject(), 1)).toBeNull();
});

test("frameAt: a reversed clip is read backwards, a photo is always its one picture", () => {
  const rb = { ...b, reversed: true };
  expect(frameAt(makeProject({ clips: [a, rb] }), 5)).toEqual({ clip: rb, sourceTime: 4 });   // trimEnd 6 − 1 × 2
  const ph = makePhotoClip({ id: "ph", seconds: 3 });
  expect(frameAt(makeProject({ clips: [ph, a] }), 1)).toEqual({ clip: ph, sourceTime: 0 });
});

test("frameAt: a time exactly on a cut is the later clip at its start; any offset inside a photo is the photo", () => {
  expect(frameAt(p(), 4)).toEqual({ clip: b, sourceTime: 0 });
  const tb = { ...b, trimStart: 1 };                                   // 5 s of source at 2× → timeline 4–6.5
  expect(frameAt(makeProject({ clips: [a, tb] }), 4)).toEqual({ clip: tb, sourceTime: 1 });
  const ph = makePhotoClip({ id: "ph", seconds: 3 });                  // timeline 4–7
  const q = makeProject({ clips: [a, ph, b] });
  expect(frameAt(q, 4)).toEqual({ clip: ph, sourceTime: 0 });
  expect(frameAt(q, 5.7)).toEqual({ clip: ph, sourceTime: 0 });
  expect(frameAt(q, 7)).toEqual({ clip: b, sourceTime: 0 });
});
