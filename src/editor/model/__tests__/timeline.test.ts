import { makeClip, makeProject } from "../types";
import { clipAt, clipDuration, clipStartTimes, timeToX, totalDuration, xToTime } from "../timeline";

const a = makeClip({ id: "a", sourceDuration: 10, trimStart: 2, trimEnd: 5 }); // 3 s
const b = makeClip({ id: "b", sourceDuration: 8, trimStart: 0, trimEnd: 4 });  // 4 s
const p = makeProject({ clips: [a, b] });

test("clipDuration and totalDuration use trims", () => {
  expect(clipDuration(a)).toBe(3);
  expect(totalDuration(p)).toBe(7);
  expect(totalDuration(makeProject({ clips: [] }))).toBe(0);
});

test("clipStartTimes accumulates", () => {
  expect(clipStartTimes(p)).toEqual([0, 3]);
});

test("clipAt finds the clip under a time with offset", () => {
  expect(clipAt(p, 0)).toEqual({ clip: a, index: 0, offsetInClip: 0 });
  expect(clipAt(p, 2.5)).toEqual({ clip: a, index: 0, offsetInClip: 2.5 });
  expect(clipAt(p, 3)).toEqual({ clip: b, index: 1, offsetInClip: 0 });
  expect(clipAt(p, 6.9)?.clip.id).toBe("b");
});

test("clipAt clamps to the ends and returns null when empty", () => {
  expect(clipAt(p, -1)).toEqual({ clip: a, index: 0, offsetInClip: 0 });
  expect(clipAt(p, 7)).toEqual({ clip: b, index: 1, offsetInClip: 4 });
  expect(clipAt(p, 99)).toEqual({ clip: b, index: 1, offsetInClip: 4 });
  expect(clipAt(makeProject({ clips: [] }), 0)).toBeNull();
});

test("timeToX/xToTime are inverses", () => {
  expect(timeToX(2.5, 40)).toBe(100);
  expect(xToTime(100, 40)).toBe(2.5);
});
