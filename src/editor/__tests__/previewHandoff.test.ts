import { setClipSpeedCurve } from "@/src/editor/model/ops";
import { clipAt, clipDuration, outputToSource, sourceToOutput } from "@/src/editor/model/timeline";
import { makeClip, makePhotoClip, makeProject } from "@/src/editor/model/types";
import { canHandOver, earlyStartDelay, HANDOFF_LEAD, HANDOFF_SLACK, hasMoved, keepRolling, nextPreloadTarget, shouldStartEarly, type Playback, type StandbyState } from "../previewHandoff";

/** Playing steadily, the playhead fresh from the player. */
const PLAYING: Playback = { playing: true, moving: true, sinceTick: 0 };

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
    expect(shouldStartEarly(inside.hit, inside.target, prepared, PLAYING)).toBe(true);
    const outside = before(a, 0.3);
    expect(shouldStartEarly(outside.hit, outside.target, prepared, PLAYING)).toBe(false);
  });

  test("paused: no", () => {
    const { hit, target } = before(a, 0.1);
    expect(shouldStartEarly(hit, target, prepared, { ...PLAYING, playing: false })).toBe(false);
  });

  test("nothing to preload: no", () => {
    expect(shouldStartEarly(before(a, 0.1).hit, null, prepared, PLAYING)).toBe(false);
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
    expect(shouldStartEarly(hit, target, { ...prepared, ...over }, PLAYING)).toBe(false);
  });

  test("the window is output time: a 2x clip enters it 0.22 s of playback before its end", () => {
    const fast = makeClip({ id: "f", sourceDuration: 4, speed: 2 }); // 2 s of output
    const inside = before(fast, 0.2);
    expect(inside.hit.offsetInClip).toBeCloseTo(1.8, 9);
    expect(shouldStartEarly(inside.hit, inside.target, prepared, PLAYING)).toBe(true);
    const outside = before(fast, 0.3); // 0.6 s of source left, but 0.3 s of playback
    expect(shouldStartEarly(outside.hit, outside.target, prepared, PLAYING)).toBe(false);
  });

  test("a speed-curve clip: measured on its own output duration", () => {
    const p = setClipSpeedCurve(makeProject({ clips: [makeClip({ id: "k", sourceDuration: 8 }), b] }), "k", "hero");
    const total = clipDuration(p.clips[0]);
    expect(total).not.toBeCloseTo(8, 3);
    const target = nextPreloadTarget(p, 0, [])!;
    expect(shouldStartEarly(clipAt(p, total - 0.2)!, target, prepared, PLAYING)).toBe(true);
    expect(shouldStartEarly(clipAt(p, total - 0.3)!, target, prepared, PLAYING)).toBe(false);
  });

  test("a reversed clip: the same window at the end of its playback", () => {
    const r = makeClip({ id: "r", sourceDuration: 4, reversed: true });
    const inside = before(r, 0.2), outside = before(r, 0.3);
    expect(shouldStartEarly(inside.hit, inside.target, prepared, PLAYING)).toBe(true);
    expect(shouldStartEarly(outside.hit, outside.target, prepared, PLAYING)).toBe(false);
  });

  test("a clip shorter than the lead: from its very first frame", () => {
    const tiny = makeClip({ id: "t", sourceDuration: 4, trimStart: 1, trimEnd: 1.15 });
    const p = makeProject({ clips: [tiny, b] });
    expect(shouldStartEarly(clipAt(p, 0)!, nextPreloadTarget(p, 0, [])!, prepared, PLAYING)).toBe(true);
  });

  test("playback has only just started (the player on screen has not moved yet): no, even inside the window", () => {
    const { hit, target } = before(a, 0.1);
    expect(shouldStartEarly(hit, target, prepared, { ...PLAYING, moving: false })).toBe(false);
    expect(shouldStartEarly(hit, target, prepared, PLAYING)).toBe(true);
  });

  test("the playhead is as old as its last tick: the playback time since then counts as played", () => {
    const { hit, target } = before(a, 0.4);
    expect(shouldStartEarly(hit, target, prepared, { ...PLAYING, sinceTick: 0.1 })).toBe(false); // 0.3 s left
    expect(shouldStartEarly(hit, target, prepared, { ...PLAYING, sinceTick: 0.18 })).toBe(true); // 0.22 s left
    expect(shouldStartEarly(hit, target, prepared, { ...PLAYING, sinceTick: 0.3 })).toBe(true);
  });
});

describe("earlyStartDelay (the timer that starts the standby player between two playhead ticks)", () => {
  const b = makeClip({ id: "b", sourceDuration: 8, trimStart: 1, trimEnd: 3 });
  const prepared: StandbyState = { clipId: "b", sourceUri: b.sourceUri, seekedTo: 1, ready: true, pendingSeek: null, rolling: false };
  /** A project of `first` then b, the hit at `sourceTime` of the first clip (as a tick of its player reports it), and the target (b). */
  const atSource = (first: ReturnType<typeof makeClip>, sourceTime: number) => {
    const p = makeProject({ clips: [first, b] });
    return { hit: { clip: p.clips[0], index: 0, offsetInClip: sourceToOutput(p.clips[0], sourceTime) }, target: nextPreloadTarget(p, 0, [])! };
  };

  // The player ticks every 0.05 s of MEDIA time: at 0.25× that is 0.2 s of playback, so no tick need fall early in the window.
  test.each<[string, number, number, number]>([
    ["0.25×, 0.4 s left at the tick", 0.25, 3.9, 0.18],
    ["0.25×, far from the cut", 0.25, 1, 11.78],
    ["0.5×, 0.3 s left at the tick", 0.5, 3.85, 0.08],
    ["1×, 0.25 s left at the tick", 1, 3.75, 0.03],
    ["1×, far from the cut", 1, 1, 2.78],
  ])("%s: not yet, a timer for what is left beyond the lead; when it fires, start", (_name, speed, sourceTime, delay) => {
    const { hit, target } = atSource(makeClip({ id: "s", sourceDuration: 4, speed }), sourceTime);
    expect(earlyStartDelay(hit, target, prepared, PLAYING)).toBeCloseTo(delay, 9);
    expect(shouldStartEarly(hit, target, prepared, PLAYING)).toBe(false);
    // When the timer fires the playhead is still the old tick's, that much playback ago: now is the time, and no further timer.
    const fired = { ...PLAYING, sinceTick: earlyStartDelay(hit, target, prepared, PLAYING)! };
    expect(shouldStartEarly(hit, target, prepared, fired)).toBe(true);
    expect(earlyStartDelay(hit, target, prepared, fired)).toBeNull();
  });

  test("0.25×: the last tick outside the window leaves 0.24 s, the next one only 0.04 s — the timer fires in between", () => {
    const slow = makeClip({ id: "s", sourceDuration: 4, trimEnd: 3.96, speed: 0.25 });
    const last = atSource(slow, 3.9), next = atSource(slow, 3.95);
    expect(clipDuration(slow) - last.hit.offsetInClip).toBeCloseTo(0.24, 9);
    expect(clipDuration(slow) - next.hit.offsetInClip).toBeCloseTo(0.04, 9);
    expect(earlyStartDelay(last.hit, last.target, prepared, PLAYING)).toBeCloseTo(0.02, 9);
  });

  test("time already played since the tick shortens the wait", () => {
    const { hit, target } = atSource(makeClip({ id: "s", sourceDuration: 4 }), 3);
    expect(earlyStartDelay(hit, target, prepared, { ...PLAYING, sinceTick: 0.5 })).toBeCloseTo(0.28, 9);
  });

  test("a timer that fires a hair early still starts the player, rather than being armed again", () => {
    const { hit, target } = atSource(makeClip({ id: "s", sourceDuration: 4 }), 3);
    expect(shouldStartEarly(hit, target, prepared, { ...PLAYING, sinceTick: 0.7795 })).toBe(true);
    expect(earlyStartDelay(hit, target, prepared, { ...PLAYING, sinceTick: 0.7795 })).toBeNull();
    expect(shouldStartEarly(hit, target, prepared, { ...PLAYING, sinceTick: 0.77 })).toBe(false);
  });

  test("inside the window already, or a clip shorter than the lead: no timer (it starts at once)", () => {
    const inside = atSource(makeClip({ id: "s", sourceDuration: 4 }), 3.9);
    expect(earlyStartDelay(inside.hit, inside.target, prepared, PLAYING)).toBeNull();
    expect(shouldStartEarly(inside.hit, inside.target, prepared, PLAYING)).toBe(true);
    const tiny = atSource(makeClip({ id: "t", sourceDuration: 4, trimStart: 1, trimEnd: 1.15 }), 1);
    expect(earlyStartDelay(tiny.hit, tiny.target, prepared, PLAYING)).toBeNull();
    expect(shouldStartEarly(tiny.hit, tiny.target, prepared, PLAYING)).toBe(true);
  });

  test("paused, playback only just started, or nothing to preload: no timer", () => {
    const { hit, target } = atSource(makeClip({ id: "s", sourceDuration: 4 }), 1);
    expect(earlyStartDelay(hit, target, prepared, { ...PLAYING, playing: false })).toBeNull();
    expect(earlyStartDelay(hit, target, prepared, { ...PLAYING, moving: false })).toBeNull();
    expect(earlyStartDelay(hit, null, prepared, PLAYING)).toBeNull();
  });

  test.each<[string, Partial<StandbyState>]>([
    ["already rolling", { rolling: true }],
    ["holding another clip", { clipId: "z" }],
    ["holding another file", { sourceUri: "file:///media/other.mp4" }],
    ["not ready", { ready: false }],
    ["a seek still pending", { pendingSeek: 1 }],
    ["not seeked", { seekedTo: null }],
    ["seeked somewhere else", { seekedTo: 2 }],
  ])("the standby is %s: no timer", (_name, over) => {
    const { hit, target } = atSource(makeClip({ id: "s", sourceDuration: 4 }), 1);
    expect(earlyStartDelay(hit, target, { ...prepared, ...over }, PLAYING)).toBeNull();
  });
});

describe("hasMoved (the player on screen is running after Play)", () => {
  test("the time it stood at, or a hair past it (where a seek can land): no", () => {
    expect(hasMoved(3.9, 3.9)).toBe(false);
    expect(hasMoved(3.9, 3.905)).toBe(false);
    expect(hasMoved(3.9, 3.8)).toBe(false);
  });

  test("one tick of a 1× clip, or a few of a fast one: yes", () => {
    expect(hasMoved(3.9, 3.95)).toBe(true);
    expect(hasMoved(1, 1.0125)).toBe(false); // 4×: one tick is 0.0125 s of playback
    expect(hasMoved(1, 1.025)).toBe(true);
  });
});

describe("keepRolling", () => {
  const a = makeClip({ id: "a", sourceDuration: 4 });
  const b = makeClip({ id: "b", sourceDuration: 8, trimStart: 1, trimEnd: 3 });
  const p = makeProject({ clips: [a, b] });
  const target = nextPreloadTarget(p, 0, [])!;
  const rolling: StandbyState = { clipId: "b", sourceUri: b.sourceUri, seekedTo: 1, ready: true, pendingSeek: null, rolling: true };
  const left = (seconds: number) => clipAt(p, 4 - seconds)!;

  test("playing inside the window, the target still the clip it was started for: yes", () => {
    expect(keepRolling(left(0.2), target, rolling, PLAYING)).toBe(true);
    expect(keepRolling(left(0.01), target, rolling, PLAYING)).toBe(true);
  });

  test("its status while it starts is not asked", () => {
    expect(keepRolling(left(0.2), target, { ...rolling, ready: false }, PLAYING)).toBe(true);
  });

  test("paused: no", () => {
    expect(keepRolling(left(0.2), target, rolling, { ...PLAYING, playing: false })).toBe(false);
  });

  test("nothing under the playhead, or nothing to preload any more: no", () => {
    expect(keepRolling(null, target, rolling, PLAYING)).toBe(false);
    expect(keepRolling(left(0.2), null, rolling, PLAYING)).toBe(false);
  });

  test("the playhead moved back out of the window (a seek away): no", () => {
    expect(keepRolling(left(1), target, rolling, PLAYING)).toBe(false);
    expect(keepRolling(left(HANDOFF_LEAD + HANDOFF_SLACK + 0.01), target, rolling, PLAYING)).toBe(false);
  });

  test("started by the timer, the playhead still at the tick before: the playback since then counts", () => {
    expect(keepRolling(left(0.4), target, rolling, { ...PLAYING, sinceTick: 0.18 })).toBe(true);
    expect(keepRolling(left(0.4), target, rolling, PLAYING)).toBe(false);
  });

  test("the next tick finding it a hair outside the window (the timer was a little early) does not stop it", () => {
    expect(HANDOFF_SLACK).toBe(0.05);
    expect(keepRolling(left(HANDOFF_LEAD + 0.03), target, rolling, PLAYING)).toBe(true);
  });

  test.each<[string, Partial<StandbyState>]>([
    ["another clip", { clipId: "z" }],
    ["another file (the next clip's media was replaced)", { sourceUri: "file:///media/other.mp4" }],
    ["somewhere other than the clip's start (the clip was trimmed)", { seekedTo: 1.5 }],
    ["nowhere it remembers", { seekedTo: null }],
  ])("it was started for %s: no", (_name, over) => {
    expect(keepRolling(left(0.2), target, { ...rolling, ...over }, PLAYING)).toBe(false);
  });
});
