jest.mock("@/src/lib/id", () => ({ newId: jest.fn(() => "new-id") }));
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { makeClip, makeProject } from "../types";
import { clipAt, clipDuration, clipStartTimes, outputToSource, sourceToOutput, totalDuration } from "../timeline";
import { splitClipAt } from "../ops";

const a = makeClip({ id: "a", sourceDuration: 10, trimStart: 2, trimEnd: 6, speed: 2 });   // 2 s output
const b = makeClip({ id: "b", sourceDuration: 4, trimStart: 0, trimEnd: 4, speed: 0.5 });  // 8 s output
const p = makeProject({ clips: [a, b] });

test("durations and conversions honour speed", () => {
  expect(clipDuration(a)).toBe(2);
  expect(clipDuration(b)).toBe(8);
  expect(totalDuration(p)).toBe(10);
  expect(clipStartTimes(p)).toEqual([0, 2]);
  expect(outputToSource(a, 0.5)).toBe(3);
  expect(sourceToOutput(a, 5)).toBe(1.5);
  expect(outputToSource(b, 6)).toBe(3);
});

test("clipAt uses output seconds", () => {
  expect(clipAt(p, 1.5)).toEqual({ clip: a, index: 0, offsetInClip: 1.5 });
  expect(clipAt(p, 6)).toEqual({ clip: b, index: 1, offsetInClip: 4 });
});

test("splitClipAt cuts at the source time under speed and keeps speed on both halves", () => {
  const next = splitClipAt(p, 1); // 1 s into a → source 4
  expect(next.clips[0]).toMatchObject({ trimStart: 2, trimEnd: 4, speed: 2 });
  expect(next.clips[1]).toMatchObject({ id: "new-id", trimStart: 4, trimEnd: 6, speed: 2 });
});
