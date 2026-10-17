jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-17T10:00:00.000Z" }));
jest.mock("@/src/lib/id", () => { let n = 0; return { newId: () => `piece-${++n}` }; });
import { canCutClip, extractClipAudio, removeCuts, removePauses } from "../ops";
import { totalDuration } from "../timeline";
import { makeAudioTrack, makeClip, makeEffect, makeLayer, makeOverlay, makePhotoClip, makeProject, type Project, type TextOverlay } from "../types";
import { contextFor } from "../../toolbarContext";

// a 0–4 · t 4–14 (trim 2 … 12) · u 14–20 · z 20–24
const base = (): Project => makeProject({
  clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "t", sourceDuration: 20, trimStart: 2, trimEnd: 12 }),
    makeClip({ id: "u", sourceDuration: 6 }), makeClip({ id: "z", sourceDuration: 4 })],
  overlays: [makeOverlay({ id: "before", start: 1, end: 3 }), makeOverlay({ id: "over", start: 9, end: 11 }), makeOverlay({ id: "later", start: 21, end: 23 }),
    makeOverlay({ id: "cap", kind: "caption", start: 15, end: 18, text: "hi there you", words: [{ text: "hi", start: 0, end: 0.4 }, { text: "there", start: 1, end: 1.4 }, { text: "you", start: 2, end: 2.5 }] })],
  audioTracks: [makeAudioTrack({ id: "m", sourceDuration: 30 })], beatMarkers: [5, 10, 15],
  effects: [makeEffect({ id: "e", start: 12, end: 16 })], layers: [makeLayer({ id: "L", sourceDuration: 2, start: 22 })], cover: { time: 21, title: "" },
});
const times = (p: Project) => p.overlays.map((o) => [o.id, o.start, o.end]);

test("Remove pauses moves what is over and after the clip; sounds and markers stay", () => {
  const p = base();
  const q = removePauses(p, "t", [[4, 5], [8, 9.5]]);   // project 6 … 7 and 10 … 11.5 go: 2.5 s
  expect(totalDuration(p) - totalDuration(q)).toBeCloseTo(2.5, 9);
  expect(times(q)).toEqual([["before", 1, 3], ["over", 8, 9], ["later", 18.5, 20.5], ["cap", 12.5, 15.5]]);
  expect(q.overlays[0]).toBe(p.overlays[0]);
  expect(q.effects.map((e) => [e.start, e.end])).toEqual([[9.5, 13.5]]);
  expect(q.layers[0].start).toBe(19.5);
  expect(q.cover).toEqual({ time: 18.5, title: "" });
  expect(q.audioTracks).toBe(p.audioTracks);
  expect(q.beatMarkers).toBe(p.beatMarkers);
});

test("two clips at once: ONE map from the original — equal to cutting them one by one, last first or first first", () => {
  const p = base();
  // t's cut removes project 6 … 7, u's 15 … 16. The caption starts exactly at 15 (not inside: → 14); its "hi" (middle 15.2) goes.
  const both = removeCuts(p, [{ clipId: "t", cuts: [[4, 5]] }, { clipId: "u", cuts: [[1, 2]] }]);
  expect(times(both)).toEqual([["before", 1, 3], ["over", 8, 10], ["later", 19, 21], ["cap", 14, 16]]);
  expect(both.overlays[3]).toMatchObject({ text: "there you", words: [{ text: "there", start: 0, end: 0.4 }, { text: "you", start: 1, end: 1.5 }] });
  const lastFirst = removePauses(removePauses(p, "u", [[1, 2]]), "t", [[4, 5]]);
  const firstFirst = removePauses(removePauses(p, "t", [[4, 5]]), "u", [[1, 2]]);
  for (const q of [lastFirst, firstFirst]) {
    expect(q.overlays).toEqual(both.overlays);
    expect(q.effects).toEqual(both.effects);
    expect(q.layers.map((l) => l.start)).toEqual(both.layers.map((l) => l.start));
    expect(q.cover).toEqual(both.cover);
  }
});

test("a caption word inside a cut goes with it, and the caption's text follows", () => {
  const q = removeCuts(base(), [{ clipId: "u", cuts: [[1.9, 2.5]] }]);   // project 15.9 … 16.5: "there" (16 … 16.4) goes
  const cap = q.overlays.find((o) => o.id === "cap") as TextOverlay;
  expect([cap.start, cap.end, cap.text]).toEqual([15, 17.4, "hi you"]);
  expect(cap.words).toEqual([{ text: "hi", start: 0, end: 0.4 }, { text: "you", start: 1.4, end: 1.9 }]);
});

test("all or nothing: one refused clip, the same clip twice, or an empty list → the same project", () => {
  const p = base();
  expect(removeCuts(p, [])).toBe(p);
  expect(removeCuts(p, [{ clipId: "t", cuts: [[4, 5]] }, { clipId: "nope", cuts: [[1, 2]] }])).toBe(p);
  expect(removeCuts(p, [{ clipId: "t", cuts: [[4, 5]] }, { clipId: "t", cuts: [[8, 9]] }])).toBe(p);
  expect(removeCuts(p, [{ clipId: "t", cuts: [[4, 5]] }, { clipId: "u", cuts: [[0, 6]] }])).toBe(p);   // no piece left in u
});

test("refused when the moved layers would put more video layers on screen at once than allowed (and than before)", () => {
  const p = { ...base(), layers: [makeLayer({ id: "L1", sourceDuration: 3, start: 3 }), makeLayer({ id: "L2", sourceDuration: 3, start: 3.5 }), makeLayer({ id: "L3", sourceDuration: 3, start: 9 })] };
  expect(removePauses(p, "t", [[2.5, 9.5]])).toBe(p);   // project 4.5 … 11.5 goes: L3 would land at 4.5, under L1 and L2
  expect(removePauses(p, "t", [[10, 11]]).layers.map((l) => l.start)).toEqual([3, 3.5, 9]);   // 12 … 13 goes: no layer after it
});

test("canCutClip agrees with the bar's Remove pauses on every kind of clip", () => {
  const p = makeProject({ clips: [makeClip({ id: "v", sourceDuration: 8 }), makePhotoClip({ id: "ph" }), makeClip({ id: "r", sourceDuration: 5, reversed: true }),
    makeClip({ id: "fast", sourceDuration: 8, speed: 2 }), makeClip({ id: "ramp", sourceDuration: 8, speedCurve: { id: "montage", steps: [{ from: 0, to: 8, speed: 1 }] } as never }),
    makeClip({ id: "x", sourceDuration: 8 })] });
  const q = extractClipAudio(p, "x", "bar");
  for (const id of ["v", "ph", "r", "fast", "ramp", "x"]) {
    const clip = q.clips.find((c) => c.id === id)!;
    expect(canCutClip(q, clip)).toBe(contextFor({ clipId: id, overlayId: null, effectId: null, audioId: null, section: null }, q).tools.includes("pauses"));
  }
  expect(canCutClip(q, makeLayer({ id: "L", sourceDuration: 2 }))).toBe(false);
});
