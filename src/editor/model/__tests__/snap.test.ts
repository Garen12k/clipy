import { clipSnapTargets, SNAP_POINTS, snapMove, snapTargets, snapThreshold, snapTime } from "../snap";
import { makeAudioTrack, makeClip, makeEffect, makeLayer, makeOverlay, makeProject, makeSticker } from "../types";

// Main track: a 0–4, b 4–7 (6 s of source at 2×). Text o 1–2.5. Sticker s 6–6.5. Music m 0.5–9.5 (past the end).
// Layer l 3–5. Effect e 5.5–6.5. Beats at 2 and 6. Playhead 3.3.
const p = makeProject({
  clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 6, speed: 2 })],
  overlays: [makeOverlay({ id: "o", start: 1, end: 2.5 }), makeSticker({ id: "s", start: 6, end: 6.5 })],
  audioTracks: [makeAudioTrack({ id: "m", sourceDuration: 9, start: 0.5 })],
  layers: [makeLayer({ id: "l", sourceDuration: 2, start: 3 })],
  effects: [makeEffect({ id: "e", start: 5.5, end: 6.5 })],
  beatMarkers: [2, 6],
});
const ALL = [0, 0.5, 1, 2, 2.5, 3, 3.3, 4, 5, 5.5, 6, 6.5, 7, 9.5];

test("the threshold is 8 points at the timeline's zoom", () => {
  expect(SNAP_POINTS).toBe(8);
  expect(snapThreshold(80)).toBe(0.1);     // 8 / 80
  expect(snapThreshold(20)).toBe(0.4);     // 8 / 20
});

test("snapTargets: every edge on the timeline, sorted, each time once", () => {
  // 0 · m start 0.5 · o start 1 · beat 2 · o end 2.5 · l start 3 · playhead 3.3 · cut 4 · l end 5 (3 + 2) · e start 5.5 ·
  // beat 6 = s start 6 (once) · e end 6.5 = s end 6.5 (once) · project end 7 (4 + 6 / 2) · m end 9.5 (0.5 + 9)
  expect(snapTargets(p, 3.3)).toEqual(ALL);
});

test("snapTargets leaves out the dragged item's own edges, whatever kind it is", () => {
  expect(snapTargets(p, 3.3, "o")).toEqual([0, 0.5, 2, 3, 3.3, 4, 5, 5.5, 6, 6.5, 7, 9.5]);
  expect(snapTargets(p, 3.3, "m")).toEqual([0, 1, 2, 2.5, 3, 3.3, 4, 5, 5.5, 6, 6.5, 7]);
  expect(snapTargets(p, 3.3, "l")).toEqual([0, 0.5, 1, 2, 2.5, 3.3, 4, 5.5, 6, 6.5, 7, 9.5]);
  expect(snapTargets(p, 3.3, "e")).toEqual([0, 0.5, 1, 2, 2.5, 3, 3.3, 4, 5, 6, 6.5, 7, 9.5]);   // 6.5 stays: the sticker ends there too
  expect(snapTargets(p, 3.3, "zz")).toEqual(ALL);
});

test("snapTargets: a playhead that is not a number is left out; an empty project has only 0", () => {
  expect(snapTargets(p, NaN)).toEqual(ALL.filter((t) => t !== 3.3));
  expect(snapTargets(makeProject(), 0)).toEqual([0]);
});

test("clipSnapTargets: the playhead and the beat markers only", () => {
  expect(clipSnapTargets(p, 3.3)).toEqual([2, 3.3, 6]);
  expect(clipSnapTargets(p, 6)).toEqual([2, 6]);
  expect(clipSnapTargets(makeProject(), NaN)).toEqual([]);
});

test("snapTime: the nearest target within the threshold, else the time itself", () => {
  expect(snapTime(3.95, ALL, 0.1)).toEqual({ time: 4, target: 4 });       // 0.05 from the cut
  expect(snapTime(3.8, ALL, 0.1)).toEqual({ time: 3.8, target: null });   // 0.2 from 4, 0.5 from 3.3
  expect(snapTime(6.2, ALL, 0.5)).toEqual({ time: 6, target: 6 });        // 0.2 from 6 beats 0.3 from 6.5
  expect(snapTime(3, [2, 4], 1)).toEqual({ time: 2, target: 2 });         // exactly 1 from both: inclusive, the earlier wins
  expect(snapTime(-0.05, ALL, 0.1)).toEqual({ time: 0, target: 0 });
  expect(snapTime(5, [], 1)).toEqual({ time: 5, target: null });
  expect(snapTime(NaN, ALL, 1)).toEqual({ time: NaN, target: null });
  expect(snapTime(4.05, ALL, 0)).toEqual({ time: 4.05, target: null });   // no reach
});

test("snapMove tries both edges of the bar; the nearer snap wins, a tie goes to the start", () => {
  // Start 2.95 is 0.05 from 3; the end 2.95 + 1.35 = 4.3 is 0.3 from 4 → the start snaps.
  expect(snapMove(2.95, 1.35, ALL, 0.15)).toEqual({ start: 3, target: 3 });
  // Start 2.9 is 0.1 from 3; the end 2.9 + 1.05 = 3.95 is 0.05 from 4 → the end snaps: start = 4 − 1.05.
  const end = snapMove(2.9, 1.05, ALL, 0.15);
  expect(end.target).toBe(4);
  expect(end.start).toBeCloseTo(2.95, 9);
  // Both edges exactly 0.25 away (start 1.75 → 2, end 4.25 → 4): the start edge wins → start 2.
  expect(snapMove(1.75, 2.5, [2, 4], 0.5)).toEqual({ start: 2, target: 2 });
  // Nothing near: 1.4 is 0.4 from 1, the end 1.7 is 0.3 from 2.
  expect(snapMove(1.4, 0.3, ALL, 0.05)).toEqual({ start: 1.4, target: null });
});
