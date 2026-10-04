jest.mock("@/src/lib/id", () => ({ newId: jest.fn(() => "right-id") }));
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { makeClip, makePhotoClip, makeProject, PHOTO } from "../types";
import { clipDuration, freezeSourceTime, splitSourceRanges, totalDuration } from "../timeline";
import { insertFreezeFrame, splitClipAt } from "../ops";

const still = { id: "still", sourceUri: "file:///p/media/still.jpg", width: 720, height: 1280 };
const edits = {
  filter: "warm" as const,
  transform: { scale: 1.5, x: 0.1, y: -0.2, rotation: 90, flipH: true, flipV: false },
  crop: { x: 0.1, y: 0.1, w: 0.5, h: 0.6 },
  background: { type: "color" as const, color: "#112233" },
};
const vid = makeClip({ id: "a", sourceDuration: 10, trimStart: 0, trimEnd: 6, transitionOut: { type: "fade", duration: 0.5 }, width: 720, height: 1280, ...edits });
const next = makeClip({ id: "b", sourceDuration: 4 });
const p = makeProject({ clips: [vid, next] });

test("splits the clip and inserts a 2 s still between the halves", () => {
  const out = insertFreezeFrame(p, 2, still);
  expect(out.clips.map((c) => c.id)).toEqual(["a", "still", "right-id", "b"]);
  expect([clipDuration(out.clips[0]), clipDuration(out.clips[1]), clipDuration(out.clips[2])]).toEqual([2, PHOTO.freezeSeconds, 4]);
  expect(totalDuration(out)).toBe(totalDuration(p) + PHOTO.freezeSeconds);
});

test("the still is a silent photo that inherits filter, transform, crop and background", () => {
  const s = insertFreezeFrame(p, 2, still).clips[1];
  expect(s).toMatchObject({ kind: "photo", sourceUri: still.sourceUri, width: 720, height: 1280, speed: 1, muted: true, reversed: false, trimStart: 0, ...edits });
  expect(s.transitionOut.type).toBe("none");
  expect(s.transform).not.toBe(vid.transform);
});

test("the still copies the clip's opacity and mask", () => {
  const masked = makeProject({ clips: [{ ...vid, opacity: 0.4, mask: "circle" as const }, next] });
  expect(insertFreezeFrame(masked, 2, still).clips[1]).toMatchObject({ opacity: 0.4, mask: "circle" });
  expect(insertFreezeFrame(p, 2, still).clips[1]).toMatchObject({ opacity: 1, mask: "none" });
});

test("no transition into the still; the right half keeps the original transition", () => {
  const out = insertFreezeFrame(p, 2, still);
  expect(out.clips[0].transitionOut.type).toBe("none");
  expect(out.clips[2].transitionOut).toEqual({ type: "fade", duration: 0.5 });
});

test("refused within MIN_CLIP_SECONDS of either end", () => {
  expect(insertFreezeFrame(p, 0.05, still)).toBe(p);
  expect(insertFreezeFrame(p, 5.95, still)).toBe(p);
  expect(insertFreezeFrame(p, 0, still)).toBe(p);
  expect(insertFreezeFrame(p, 100, still)).toBe(p);
});

test("refused on a photo or an empty project", () => {
  const photoP = makeProject({ clips: [makePhotoClip({ id: "ph", seconds: 3 })] });
  expect(insertFreezeFrame(photoP, 1.5, still)).toBe(photoP);
  const empty = makeProject();
  expect(insertFreezeFrame(empty, 1, still)).toBe(empty);
});

test("returns a new project without mutating the input; overlays are untouched", () => {
  const snapshot = JSON.stringify(p);
  const out = insertFreezeFrame(p, 2, still);
  expect(out).not.toBe(p);
  expect(JSON.stringify(p)).toBe(snapshot);
  expect(out.overlays).toBe(p.overlays);
});

describe("freezeSourceTime", () => {
  test("forward clips map through trimStart and speed", () => {
    expect(freezeSourceTime(makeClip({ id: "x", sourceDuration: 10, trimStart: 2, trimEnd: 6, speed: 2 }), 1)).toBe(4);
  });
  test("reversed clips mirror inside the trim span", () => {
    expect(freezeSourceTime(makeClip({ id: "x", sourceDuration: 10, trimStart: 2, trimEnd: 6, reversed: true }), 1)).toBe(5);
    expect(freezeSourceTime(makeClip({ id: "x", sourceDuration: 10, trimStart: 2, trimEnd: 6, speed: 2, reversed: true }), 1)).toBe(4);
  });
});

describe("reversed-aware split", () => {
  const rev = (speed: number) => makeClip({ id: "r", sourceDuration: 10, trimStart: 2, trimEnd: 8, speed, reversed: true });
  const spans = (c: { trimStart: number; trimEnd: number }) => [c.trimStart, c.trimEnd];

  test("speed 1: left [7, 8], right [2, 7], both stay reversed", () => {
    const out = splitClipAt(makeProject({ clips: [rev(1)] }), 1);
    expect(spans(out.clips[0])).toEqual([7, 8]);
    expect(spans(out.clips[1])).toEqual([2, 7]);
    expect(out.clips.every((c) => c.reversed)).toBe(true);
  });
  test("speed 2: left [6, 8], right [2, 6]; output durations sum to the original", () => {
    const c = rev(2);
    const out = splitClipAt(makeProject({ clips: [c] }), 1);
    expect(spans(out.clips[0])).toEqual([6, 8]);
    expect(spans(out.clips[1])).toEqual([2, 6]);
    expect(clipDuration(out.clips[0]) + clipDuration(out.clips[1])).toBe(clipDuration(c));
  });
  test("forward clips are unchanged", () => {
    const c = makeClip({ id: "f", sourceDuration: 10, trimStart: 2, trimEnd: 8, speed: 2 });
    expect(splitSourceRanges(c, 1)).toEqual({ left: [2, 4], right: [4, 8] });
    const out = splitClipAt(makeProject({ clips: [c] }), 1);
    expect([spans(out.clips[0]), spans(out.clips[1])]).toEqual([[2, 4], [4, 8]]);
  });
  test("freeze on a reversed clip: halves as above and the capture time is the cut", () => {
    const c = rev(1);
    const out = insertFreezeFrame(makeProject({ clips: [c] }), 1, still);
    expect(spans(out.clips[0])).toEqual([7, 8]);
    expect(spans(out.clips[2])).toEqual([2, 7]);
    expect(freezeSourceTime(c, 1)).toBe(7);
  });
});
