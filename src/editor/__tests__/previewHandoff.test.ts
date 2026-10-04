import { setClipSpeedCurve } from "@/src/editor/model/ops";
import { clipAt, clipDuration, outputToSource } from "@/src/editor/model/timeline";
import { makeClip, makePhotoClip, makeProject } from "@/src/editor/model/types";
import { canHandOver, HANDOFF_LEAD, nextPreloadTarget, shouldStartEarly, type StandbyState } from "../previewHandoff";

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
  const good: StandbyState = { clipId: "b", sourceUri: b.sourceUri, seekedTo: 1, ready: true, pendingSeek: null, rolling: false };

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

  test("a rolling standby (started early from the clip's start) takes over, whatever its status reports while it starts", () => {
    expect(canHandOver({ ...good, rolling: true }, atCut)).toBe(true);
    expect(canHandOver({ ...good, rolling: true, ready: false }, atCut)).toBe(true);
  });

  test.each<[string, Partial<StandbyState>]>([
    ["rolling for another clip", { clipId: "a" }],
    ["rolling in another file", { sourceUri: "file:///media/other.mp4" }],
    ["rolling from somewhere other than the clip's start", { seekedTo: 1.5 }],
  ])("%s: no", (_name, over) => {
    expect(canHandOver({ ...good, rolling: true, ...over }, atCut)).toBe(false);
  });

  test("a rolling standby and a playhead inside the clip (a seek by the user): no", () => {
    expect(canHandOver({ ...good, rolling: true }, clipAt(p, 4.5)!)).toBe(false);
  });

  test("a photo under the playhead: no", () => {
    const photo = makePhotoClip({ id: "b", seconds: 1 });
    expect(canHandOver({ ...good, sourceUri: photo.sourceUri, seekedTo: outputToSource(photo, 0) }, { clip: photo, index: 1, offsetInClip: 0 })).toBe(false);
  });
});

describe("shouldStartEarly", () => {
  const b = makeClip({ id: "b", sourceDuration: 8, trimStart: 1, trimEnd: 3 });
  const prepared: StandbyState = { clipId: "b", sourceUri: b.sourceUri, seekedTo: 1, ready: true, pendingSeek: null, rolling: false };
  /** A project of `first` then b, the hit `left` output seconds before the cut, and the preload target (b). */
  const before = (first: ReturnType<typeof makeClip>, left: number) => {
    const p = makeProject({ clips: [first, b] });
    return { hit: clipAt(p, clipDuration(p.clips[0]) - left)!, target: nextPreloadTarget(p, 0, [])! };
  };
  const a = makeClip({ id: "a", sourceDuration: 4 });

  test("the lead is the measured start-up time of a ready player", () => {
    expect(HANDOFF_LEAD).toBe(0.22);
  });

  test("playing, the standby prepared, within the lead of the clip's end: yes; before the window: no", () => {
    const inside = before(a, 0.2);
    expect(inside.hit.clip.id).toBe("a");
    expect(shouldStartEarly(inside.hit, inside.target, prepared, true)).toBe(true);
    const outside = before(a, 0.3);
    expect(shouldStartEarly(outside.hit, outside.target, prepared, true)).toBe(false);
  });

  test("paused: no", () => {
    const { hit, target } = before(a, 0.1);
    expect(shouldStartEarly(hit, target, prepared, false)).toBe(false);
  });

  test("nothing to preload: no", () => {
    expect(shouldStartEarly(before(a, 0.1).hit, null, prepared, true)).toBe(false);
  });

  test.each<[string, Partial<StandbyState>]>([
    ["already rolling", { rolling: true }],
    ["holding another clip", { clipId: "z" }],
    ["holding another file", { sourceUri: "file:///media/other.mp4" }],
    ["not ready", { ready: false }],
    ["a seek still pending", { pendingSeek: 1 }],
    ["not seeked", { seekedTo: null }],
    ["seeked somewhere else", { seekedTo: 2 }],
  ])("the standby is %s: no", (_name, over) => {
    const { hit, target } = before(a, 0.1);
    expect(shouldStartEarly(hit, target, { ...prepared, ...over }, true)).toBe(false);
  });

  test("the window is output time: a 2x clip enters it 0.22 s of playback before its end", () => {
    const fast = makeClip({ id: "f", sourceDuration: 4, speed: 2 }); // 2 s of output
    const inside = before(fast, 0.2);
    expect(inside.hit.offsetInClip).toBeCloseTo(1.8, 9);
    expect(shouldStartEarly(inside.hit, inside.target, prepared, true)).toBe(true);
    const outside = before(fast, 0.3); // 0.6 s of source left, but 0.3 s of playback
    expect(shouldStartEarly(outside.hit, outside.target, prepared, true)).toBe(false);
  });

  test("a speed-curve clip: measured on its own output duration", () => {
    const p = setClipSpeedCurve(makeProject({ clips: [makeClip({ id: "k", sourceDuration: 8 }), b] }), "k", "hero");
    const total = clipDuration(p.clips[0]);
    expect(total).not.toBeCloseTo(8, 3);
    const target = nextPreloadTarget(p, 0, [])!;
    expect(shouldStartEarly(clipAt(p, total - 0.2)!, target, prepared, true)).toBe(true);
    expect(shouldStartEarly(clipAt(p, total - 0.3)!, target, prepared, true)).toBe(false);
  });

  test("a reversed clip: the same window at the end of its playback", () => {
    const r = makeClip({ id: "r", sourceDuration: 4, reversed: true });
    const inside = before(r, 0.2), outside = before(r, 0.3);
    expect(shouldStartEarly(inside.hit, inside.target, prepared, true)).toBe(true);
    expect(shouldStartEarly(outside.hit, outside.target, prepared, true)).toBe(false);
  });

  test("a clip shorter than the lead: from its very first frame", () => {
    const tiny = makeClip({ id: "t", sourceDuration: 4, trimStart: 1, trimEnd: 1.15 });
    const p = makeProject({ clips: [tiny, b] });
    expect(shouldStartEarly(clipAt(p, 0)!, nextPreloadTarget(p, 0, [])!, prepared, true)).toBe(true);
  });
});
