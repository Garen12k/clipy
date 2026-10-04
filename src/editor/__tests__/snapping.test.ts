import * as Haptics from "expo-haptics";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { makeAudioTrack, makeClip, makeEffect, makeLayer, makeOverlay, makeProject, makeSticker } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { createSnapper, sameTime, useSnapGuide } from "../snapping";

// The project of model/__tests__/snap.test.ts: targets 0, 0.5, 1, 2, 2.5, 3, 3.3 (playhead), 4, 5, 5.5, 6, 6.5, 7, 9.5.
const p = makeProject({
  clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 6, speed: 2 })],
  overlays: [makeOverlay({ id: "o", start: 1, end: 2.5 }), makeSticker({ id: "s", start: 6, end: 6.5 })],
  audioTracks: [makeAudioTrack({ id: "m", sourceDuration: 9, start: 0.5 })],
  layers: [makeLayer({ id: "l", sourceDuration: 2, start: 3 })],
  effects: [makeEffect({ id: "e", start: 5.5, end: 6.5 })],
  beatMarkers: [2, 6],
});
const store = () => useEditorStore.getState();
const buzz = Haptics.impactAsync as jest.Mock;
const guide = () => useSnapGuide.getState().time;

beforeEach(() => {
  store().reset(); store().setProject(p); store().seek(3.3); store().setZoom(80);   // threshold 8 / 80 = 0.1 s
  useSnapGuide.setState({ time: null }); buzz.mockClear();
});

test("one light haptic when a snap is entered: holding it and leaving it are silent; the guide follows the target", () => {
  const s = createSnapper();
  s.begin("o");
  expect(s.time(3.95)).toBe(4);
  expect(guide()).toBe(4);
  expect(buzz).toHaveBeenCalledTimes(1);
  expect(buzz).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
  expect(s.time(3.97)).toBe(4);
  expect(buzz).toHaveBeenCalledTimes(1);   // held
  expect(s.time(3.6)).toBe(3.6);
  expect(guide()).toBeNull();
  expect(s.snapped()).toBe(false);
  expect(buzz).toHaveBeenCalledTimes(1);   // leaving is silent
  expect(s.time(3.96)).toBe(4);
  expect(buzz).toHaveBeenCalledTimes(2);   // entered again
  expect(s.snapped()).toBe(true);
  s.end();
  expect(guide()).toBeNull();
  expect(s.snapped()).toBe(false);
});

test("moving from one target straight onto another buzzes twice", () => {
  const s = createSnapper();
  s.begin("o");
  expect(s.time(3.95)).toBe(4);
  expect(s.time(3.25)).toBe(3.3);
  expect(guide()).toBe(3.3);
  expect(buzz).toHaveBeenCalledTimes(2);
});

test("a moved bar snaps by its nearer edge; the guide is at the target, not at the bar's start", () => {
  const s = createSnapper();
  s.begin("o");
  expect(s.move(2.9, 1.05)).toBeCloseTo(2.95, 9);   // the end 3.95 → the cut at 4
  expect(guide()).toBe(4);
  expect(buzz).toHaveBeenCalledTimes(1);
});

test("a main-clip trim snaps to the playhead and the beats only", () => {
  const s = createSnapper();
  s.begin(null, true);
  expect(s.time(3.95)).toBe(3.95);   // a cut is not a target
  expect(s.snapped()).toBe(false);
  expect(s.time(2.04)).toBe(2);
  expect(s.time(3.26)).toBe(3.3);
});

test("targets are read at begin; without begin, or with no project, nothing snaps and nothing buzzes", () => {
  const s = createSnapper();
  expect(s.time(3.95)).toBe(3.95);
  expect(s.move(2.9, 1.05)).toBe(2.9);
  s.begin("o");
  store().seek(1.5);
  expect(s.time(1.52)).toBe(1.52);   // the new playhead is not a target
  expect(s.time(3.28)).toBe(3.3);    // the one read at begin still is
  s.end();
  expect(s.time(3.28)).toBe(3.28);   // ended: no targets
  buzz.mockClear();
  store().reset();
  s.begin("o");
  expect(s.time(3.95)).toBe(3.95);
  expect(s.move(2.9, 1.05)).toBe(2.9);
  expect(buzz).not.toHaveBeenCalled();
  expect(guide()).toBeNull();
});

test("a snap the bar's own op would clamp away is not a snap: the finger's time, no haptic, no guide", () => {
  const s = createSnapper();
  s.begin("o");
  const lands = jest.fn((_snapped: number, _target: number) => false);
  expect(s.time(3.95, lands)).toBe(3.95);
  expect(lands).toHaveBeenCalledWith(4, 4);
  expect(s.move(2.9, 1.05, lands)).toBe(2.9);
  expect(lands.mock.calls[1][1]).toBe(4);
  expect(lands.mock.calls[1][0]).toBeCloseTo(2.95, 9);
  expect(s.snapped()).toBe(false);
  expect(guide()).toBeNull();
  expect(buzz).not.toHaveBeenCalled();
  // Nothing near: the op is not asked.
  s.time(3.6, lands);
  expect(lands).toHaveBeenCalledTimes(2);
  // An op that does land there: a snap as usual.
  expect(s.time(3.95, () => true)).toBe(4);
  expect(buzz).toHaveBeenCalledTimes(1);
});

test("an edge already on a target when the gesture starts is held, not entered: no haptic until it leaves and comes back", () => {
  const s = createSnapper();
  s.begin("e");            // the effect ends at 6.5, where the sticker ends too
  s.rest(6.5);
  expect(guide()).toBe(6.5);
  expect(s.time(6.52)).toBe(6.5);
  expect(buzz).not.toHaveBeenCalled();
  expect(s.time(6.98)).toBe(7);
  expect(buzz).toHaveBeenCalledTimes(1);
  expect(s.time(6.52)).toBe(6.5);
  expect(buzz).toHaveBeenCalledTimes(2);
  // An edge merely near a target is not on it: the first frame enters the snap.
  s.end(); buzz.mockClear();
  s.begin("o");
  s.rest(3.96, 1.2);
  expect(guide()).toBeNull();
  expect(s.time(3.96)).toBe(4);
  expect(buzz).toHaveBeenCalledTimes(1);
});

test("sameTime: within a millisecond", () => {
  expect(sameTime(4, 4.0005)).toBe(true);
  expect(sameTime(4, 4.002)).toBe(false);
});

test("ending a snapper that never began leaves another bar's guide alone", () => {
  const dragged = createSnapper(), tapped = createSnapper();
  dragged.begin("o");
  dragged.time(3.95);
  tapped.end();
  expect(guide()).toBe(4);
  dragged.end();
  expect(guide()).toBeNull();
});

test("ending an active snapper clears only the guide it set itself: another active snapper's guide stays", () => {
  const showing = createSnapper(), idle = createSnapper();
  showing.begin("o"); idle.begin("e");
  expect(showing.time(3.95)).toBe(4);
  idle.end();                      // began, never snapped: the guide is not its own
  expect(guide()).toBe(4);
  expect(showing.snapped()).toBe(true);
  // A snapper that leaves its own snap after another one took the guide over does not hide the other's guide either.
  idle.begin("e");
  expect(idle.time(2.04)).toBe(2);
  expect(guide()).toBe(2);
  expect(showing.time(3.6)).toBe(3.6);
  expect(guide()).toBe(2);
  showing.end();
  expect(guide()).toBe(2);
  idle.end();
  expect(guide()).toBeNull();
});

test("at zoom 0 the threshold is not a number of seconds: nothing snaps", () => {
  useEditorStore.setState({ pixelsPerSecond: 0 });   // setZoom never gives 0; the snapper must cope anyway
  const s = createSnapper();
  s.begin("o");
  expect(s.time(3.95)).toBe(3.95);
  expect(s.move(2.9, 1.05)).toBe(2.9);
  expect(buzz).not.toHaveBeenCalled();
  expect(guide()).toBeNull();
});
