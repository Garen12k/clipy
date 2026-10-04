import { makeClip, makeProject } from "@/src/editor/model/types";
import { clipAt } from "@/src/editor/model/timeline";
import { nextPlayheadFromPlayer, nextPresentClipIndex } from "../usePreviewSync";

const a = makeClip({ id: "a", sourceDuration: 10, trimStart: 2, trimEnd: 5 }); // 3 s
const b = makeClip({ id: "b", sourceDuration: 8, trimStart: 1, trimEnd: 3 }); // 2 s
const c = makeClip({ id: "c", sourceDuration: 8 });                           // 8 s
const p = makeProject({ clips: [a, b, c] });

test("maps the player's source time back to the output timeline", () => {
  const hit = clipAt(p, 1)!; // in a
  expect(nextPlayheadFromPlayer(p, hit, 3.5, [])).toEqual({ playhead: 1.5, ended: false });
});

test("advances to the next clip when the trimmed end is reached", () => {
  const hit = clipAt(p, 1)!;
  expect(nextPlayheadFromPlayer(p, hit, 5.0, [])).toEqual({ playhead: 3, ended: false });
});

test("skips clips whose source file is missing", () => {
  const hit = clipAt(p, 1)!;
  expect(nextPlayheadFromPlayer(p, hit, 5.2, [b.sourceUri])).toEqual({ playhead: 5, ended: false });
});

test("ends at the end of the last clip", () => {
  const hit = clipAt(p, 6)!; // in c
  expect(nextPlayheadFromPlayer(p, hit, 8.1, [])).toEqual({ playhead: 13, ended: true });
});

test("holds at the clip start when the player hasn't seeked into the trim window yet", () => {
  const hit = clipAt(p, 1)!; // in a, trimStart 2
  expect(nextPlayheadFromPlayer(p, hit, 0, [])).toEqual({ playhead: 0, ended: false });
});

test("skips every clip that shares a missing source", () => {
  const b2 = makeClip({ id: "b2", sourceDuration: 8, sourceUri: b.sourceUri, trimStart: 3, trimEnd: 5 }); // other half of a split
  const q = makeProject({ clips: [a, b, b2, c] });
  expect(nextPlayheadFromPlayer(q, clipAt(q, 1)!, 5.2, [b.sourceUri])).toEqual({ playhead: 7, ended: false });
  expect(nextPresentClipIndex(q, 0, [b.sourceUri])).toBe(3);
});

test("player time maps through speed", () => {
  const fast = makeClip({ id: "f", sourceDuration: 10, trimStart: 2, trimEnd: 6, speed: 2 });
  const pf = makeProject({ clips: [fast, makeClip({ id: "g", sourceDuration: 2 })] });
  expect(nextPlayheadFromPlayer(pf, clipAt(pf, 0)!, 5, [])).toEqual({ playhead: 1.5, ended: false });
  expect(nextPlayheadFromPlayer(pf, clipAt(pf, 0)!, 6, [])).toEqual({ playhead: 2, ended: false });
});

describe("nextPresentClipIndex", () => {
  test("returns the next clip index when nothing is missing", () => {
    expect(nextPresentClipIndex(p, 0, [])).toBe(1);
  });

  test("skips missing clips to find the next present one", () => {
    expect(nextPresentClipIndex(p, 0, [b.sourceUri])).toBe(2);
  });

  test("returns null when there is no present clip left", () => {
    expect(nextPresentClipIndex(p, 1, [c.sourceUri])).toBeNull();
  });
});

test("a seek that lands a hair before the trim start stays in the clip (never falls back into the previous one)", () => {
  // Values from a device: AVPlayer lands on 9.905555555552969 when asked for 9.905555555555555.
  const first = makeClip({ id: "first", sourceDuration: 10.066666666666666, trimStart: 5.322222222222222, trimEnd: 10.066666666666666 });
  const second = makeClip({ id: "second", sourceDuration: 14.057333333333334, trimStart: 9.905555555555555, trimEnd: 14.057333333333334 });
  const q = makeProject({ clips: [first, second] });
  const start = 10.066666666666666 - 5.322222222222222;
  const hit = clipAt(q, start)!;
  expect(hit.clip.id).toBe("second");
  const { playhead, ended } = nextPlayheadFromPlayer(q, hit, 9.905555555552969, []);
  expect(ended).toBe(false);
  expect(clipAt(q, playhead)!.clip.id).toBe("second");
});
