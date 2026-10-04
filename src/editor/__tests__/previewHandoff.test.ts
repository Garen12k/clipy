import { setClipSpeedCurve } from "@/src/editor/model/ops";
import { clipAt, outputToSource } from "@/src/editor/model/timeline";
import { makeClip, makePhotoClip, makeProject } from "@/src/editor/model/types";
import { canHandOver, nextPreloadTarget, type StandbyState } from "../previewHandoff";

describe("nextPreloadTarget", () => {
  const a = makeClip({ id: "a", sourceDuration: 4 });
  const b = makeClip({ id: "b", sourceDuration: 8, trimStart: 1, trimEnd: 3 });

  test("the next clip from another file: that clip, its index and the source time of its first frame", () => {
    expect(nextPreloadTarget(makeProject({ clips: [a, b] }), 0, [])).toEqual({ clip: b, index: 1, sourceTime: 1 });
  });

  test("a photo next: nothing", () => {
    expect(nextPreloadTarget(makeProject({ clips: [a, makePhotoClip({ id: "p", seconds: 1 }), b] }), 0, [])).toBeNull();
  });

  test("a missing next clip: nothing (the clip after it is not preloaded in its place)", () => {
    const c = makeClip({ id: "c", sourceDuration: 4 });
    expect(nextPreloadTarget(makeProject({ clips: [a, b, c] }), 0, [b.sourceUri])).toBeNull();
  });

  test("the last clip: nothing", () => {
    expect(nextPreloadTarget(makeProject({ clips: [a, b] }), 1, [])).toBeNull();
    expect(nextPreloadTarget(makeProject({ clips: [] }), 0, [])).toBeNull();
  });

  test("the next clip is from the same file (the same-file seek path takes that cut): nothing", () => {
    const half = makeClip({ id: "a2", sourceDuration: 4, sourceUri: a.sourceUri });
    expect(nextPreloadTarget(makeProject({ clips: [a, half, b] }), 0, [])).toBeNull();
    expect(nextPreloadTarget(makeProject({ clips: [a, half, b] }), 1, [])).toEqual({ clip: b, index: 2, sourceTime: 1 });
  });

  test("a photo, or a missing clip, under the playhead: nothing", () => {
    expect(nextPreloadTarget(makeProject({ clips: [makePhotoClip({ id: "p", seconds: 1 }), b] }), 0, [])).toBeNull();
    expect(nextPreloadTarget(makeProject({ clips: [a, b] }), 0, [a.sourceUri])).toBeNull();
  });

  test("a reversed clip starts where the preview plays it from: forwards, at its trim start", () => {
    const r = makeClip({ id: "r", sourceDuration: 8, trimStart: 2, trimEnd: 6, reversed: true, speed: 2 });
    const t = nextPreloadTarget(makeProject({ clips: [a, r] }), 0, [])!;
    expect(t.sourceTime).toBe(2);
    expect(t.sourceTime).toBe(outputToSource(r, 0));
  });

  test("a speed-curve clip starts at the source time its curve gives for offset 0", () => {
    const p = setClipSpeedCurve(makeProject({ clips: [a, makeClip({ id: "k", sourceDuration: 8, trimStart: 1.5, trimEnd: 7 })] }), "k", "hero");
    const t = nextPreloadTarget(p, 0, [])!;
    expect(t.clip.speedCurve).not.toBeNull();
    expect(t.sourceTime).toBe(outputToSource(p.clips[1], 0));
    expect(t.sourceTime).toBeCloseTo(1.5, 9);
  });
});

describe("canHandOver", () => {
  const a = makeClip({ id: "a", sourceDuration: 4 });
  const b = makeClip({ id: "b", sourceDuration: 8, trimStart: 1, trimEnd: 3 });
  const p = makeProject({ clips: [a, b] });
  const atCut = clipAt(p, 4)!;
  const good: StandbyState = { clipId: "b", sourceUri: b.sourceUri, seekedTo: 1, ready: true, pendingSeek: null };

  test("the standby holds exactly the clip the playhead enters, seeked to its start and ready: yes", () => {
    expect(atCut.clip.id).toBe("b");
    expect(canHandOver(good, atCut)).toBe(true);
  });

  test.each<[string, Partial<StandbyState>]>([
    ["another clip", { clipId: "a" }],
    ["no clip", { clipId: null }],
    ["another file (the clip's media was replaced)", { sourceUri: "file:///media/other.mp4" }],
    ["not seeked yet", { seekedTo: null }],
    ["seeked somewhere else", { seekedTo: 1.5 }],
    ["not ready", { ready: false }],
    ["a seek still pending", { pendingSeek: 1 }],
  ])("%s: no", (_name, over) => {
    expect(canHandOver({ ...good, ...over }, atCut)).toBe(false);
  });

  test("the playhead is inside the clip, not at its start (a seek by the user): no", () => {
    expect(canHandOver(good, clipAt(p, 4.5)!)).toBe(false);
  });

  test("a photo under the playhead: no", () => {
    const photo = makePhotoClip({ id: "b", seconds: 1 });
    expect(canHandOver({ ...good, sourceUri: photo.sourceUri, seekedTo: outputToSource(photo, 0) }, { clip: photo, index: 1, offsetInClip: 0 })).toBe(false);
  });
});
