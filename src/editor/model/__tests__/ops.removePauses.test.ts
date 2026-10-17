jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-16T10:00:00.000Z" }));
jest.mock("@/src/lib/id", () => { let n = 0; return { newId: () => `piece-${++n}` }; });
import { removePauses } from "../ops";
import { clipDuration, totalDuration } from "../timeline";
import { makeAudioTrack, makeClip, makeEffect, makeKeyframe, makeLayer, makeOverlay, makePhotoClip, makeProject, type Clip, type Project } from "../types";

const fade = { type: "fade" as const, duration: 0.5 };
const talk = (more: Partial<Clip> = {}): Clip => makeClip({ id: "t", sourceDuration: 20, trimStart: 2, trimEnd: 12, fadeIn: 1, fadeOut: 2,
  animation: { in: { id: "fade", duration: 0.5 }, out: { id: "zoomOut", duration: 0.5 }, combo: null }, transitionOut: fade,
  keyframes: [makeKeyframe({ t: 3 })], ...more });
const project = (c: Clip = talk()): Project => makeProject({
  clips: [makeClip({ id: "a", sourceDuration: 4, transitionOut: fade }), c, makeClip({ id: "z", sourceDuration: 4 })],
  overlays: [makeOverlay({ id: "o", start: 9, end: 11 })], audioTracks: [makeAudioTrack({ id: "m", sourceDuration: 30 })],
  layers: [makeLayer({ id: "L", sourceDuration: 2, start: 10 })], effects: [makeEffect({ id: "e", start: 1, end: 2 })],
});
const ids = (p: Project) => p.clips.map((c) => c.id);

test("the clip becomes its pieces of sound, in place; the first keeps the id", () => {
  const p = project();
  const q = removePauses(p, "t", [[4, 5], [8, 9.5]]);
  expect(ids(q)).toEqual(["a", "t", "piece-1", "piece-2", "z"]);
  expect(q.clips.slice(1, 4).map((c) => [c.trimStart, c.trimEnd])).toEqual([[2, 4], [5, 8], [9.5, 12]]);
  expect(totalDuration(p) - totalDuration(q)).toBeCloseTo(2.5, 9);
});

test("the split rules: In and fade in on the first, Out, fade out and transition on the last, nothing between; pins on every piece", () => {
  const [first, mid, last] = removePauses(project(), "t", [[4, 5], [8, 9.5]]).clips.slice(1, 4);
  expect([first.animation.in?.id, mid.animation.in, last.animation.in]).toEqual(["fade", null, null]);
  expect([first.animation.out, mid.animation.out, last.animation.out?.id]).toEqual([null, null, "zoomOut"]);
  expect([first.fadeIn, mid.fadeIn, last.fadeIn]).toEqual([1, 0, 0]);
  expect([first.fadeOut, mid.fadeOut, last.fadeOut]).toEqual([0, 0, 2]);
  expect([first.transitionOut.type, mid.transitionOut.type, last.transitionOut]).toEqual(["none", "none", fade]);
  for (const c of [first, mid, last]) expect(c.keyframes).toEqual([makeKeyframe({ t: 3 })]);
  expect(mid.adjust).not.toBe(first.adjust);
});

test("the transition into the clip stays, re-capped against the first piece — dropped under TRANSITION_LIMITS.min; sounds and markers do not move", () => {
  const p = project();
  const q = removePauses(p, "t", [[2.8, 11.5]]);
  expect(q.clips[0].transitionOut).toEqual({ type: "fade", duration: 0.4 });    // capped by the 0.8-s first piece
  expect(removePauses(p, "t", [[2.5, 11.5]]).clips[0].transitionOut.type).toBe("none");   // 0.25 s would be under the 0.3-s minimum
  expect(q.overlays).toEqual([]); expect(q.layers.map((l) => l.start)).toEqual([4.8]); expect(q.effects).toBe(p.effects);
  expect(q.audioTracks).toBe(p.audioTracks); expect(q.beatMarkers).toBe(p.beatMarkers);
});

test("leading and trailing cuts: one piece = the clip trimmed, keeping everything", () => {
  const q = removePauses(project(), "t", [[2, 3], [11, 12]]);
  const t = q.clips[1];
  expect(ids(q)).toEqual(["a", "t", "z"]);
  expect([t.trimStart, t.trimEnd, t.fadeIn, t.fadeOut, t.transitionOut, t.animation.in?.id, t.animation.out?.id]).toEqual([3, 11, 1, 2, fade, "fade", "zoomOut"]);
});

test("a constant speed: pieces keep it, and their lengths are timeline.ts's", () => {
  const q = removePauses(project(talk({ speed: 2 })), "t", [[4, 6]]);
  expect(q.clips.slice(1, 3).map(clipDuration)).toEqual([1, 3]);
});

test("refused (the same project): not a main clip, a photo, reversed, ramped, bad cuts, a piece too short, too many", () => {
  const p = project();
  for (const [id, c] of [["L", [[0.5, 1]]], ["nope", [[4, 5]]], ["t", []], ["t", [[5, 4]]], ["t", [[4, 6], [5, 7]]], ["t", [[1, 3]]], ["t", [[11, 13]]], ["t", [[NaN, 5]]],
    ["t", [[2, 12]]], ["t", [[4, 5], [5.05, 6]]]] as const) expect(removePauses(p, id, c as never)).toBe(p);
  const many = Array.from({ length: 61 }, (_, i) => [2.1 + i * 0.15, 2.15 + i * 0.15] as const);
  expect(removePauses(p, "t", many)).toBe(p);
  for (const c of [makePhotoClip({ id: "t" }), talk({ reversed: true }), talk({ speedCurve: { id: "montage", steps: [{ from: 2, to: 12, speed: 1 }] } as never })]) {
    const q = project(c);
    expect(removePauses(q, "t", [[4, 5]])).toBe(q);
  }
});

test("refused when the clip's sound is on its own bar (Extract audio, Voice / Sound): the bar would play on uncut", () => {
  const c = talk({ muted: true });
  const q = { ...project(c), audioTracks: [makeAudioTrack({ id: "x", sourceUri: c.sourceUri, sourceDuration: 20, start: 4, trimStart: 2, trimEnd: 12 })] };
  expect(removePauses(q, "t", [[4, 5]])).toBe(q);
});
