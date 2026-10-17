jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-17T10:00:00.000Z" }));
import { extractClipAudio, removeCuts } from "../ops";
import { FILLER, fillerPlan, isFiller } from "../fillers";
import { makeClip, makeOverlay, makePhotoClip, makeProject, type CaptionWord, type Clip, type Project, type TextOverlay } from "../types";

const cap = (id: string, start: number, end: number, words: CaptionWord[]): TextOverlay =>
  makeOverlay({ id, kind: "caption", start, end, text: words.map((w) => w.text).join(" "), words });
const W = (text: string, start: number, end: number): CaptionWord => ({ text, start, end });
const sentence = () => cap("c", 1, 4, [W("so", 0, 0.3), W("um", 0.5, 0.8), W("we", 1, 1.3), W("uh", 1.4, 1.6), W("go", 2, 2.4)]);
const one = (overlays: TextOverlay[], clips: Clip[] = [makeClip({ id: "a", sourceDuration: 10 })]): Project => makeProject({ clips, overlays });

test("the table: um, uh, uhm, erm, hm, mm and their long forms, any case, punctuation stripped; never er, ah, or a word that contains one", () => {
  for (const w of ["um", "Um,", "UMM", "uh", "uhh.", "uhm", "erm…", "hm", "hmm?", "“mm”", "mmm", "(uh)", "um-"]) expect(isFiller(w, null)).toBe(true);
  for (const w of ["er", "ah", "oh", "umbrella", "hum", "uhuh", "ümm", "m", "like", "so", ""]) expect(isFiller(w, null)).toBe(false);
  expect(isFiller("mm", "5")).toBe(false);    // "5 mm"
  expect(isFiller("mm", "10,")).toBe(false);
  expect(isFiller("mm", "okay")).toBe(true);
  expect(FILLER.pad).toBe(0.04);
});

test("the vector: padded cuts that never reach a neighbour word, in source seconds", () => {
  const plan = fillerPlan(one([sentence()]));
  expect(plan).toEqual({ found: 2, removable: 2, cannot: 0, cuts: [{ clipId: "a", cuts: [[1.46, 1.84], [2.36, 2.64]] }] });
});

test("removed: the fillers are gone from the caption, every other word stays, timed with the picture", () => {
  const p = one([sentence()]);
  const q = removeCuts(p, fillerPlan(p).cuts);
  const c = q.overlays[0] as TextOverlay;
  expect([c.start, c.end, c.text]).toEqual([1, 3.34, "so we go"]);
  expect(c.words).toEqual([W("so", 0, 0.3), W("we", 0.62, 0.92), W("go", 1.34, 1.74)]);
  expect(q.clips.map((k) => [k.trimStart, k.trimEnd])).toEqual([[0, 1.46], [1.84, 2.36], [2.64, 10]]);
});

test("neighbouring fillers merge into one cut; a gap longer than two pads is not cut", () => {
  const close = fillerPlan(one([cap("c", 0, 3, [W("so", 0, 0.5), W("um", 1, 1.2), W("uh", 1.25, 1.45), W("go", 2, 2.5)])]));
  expect(close).toMatchObject({ found: 2, removable: 2, cuts: [{ clipId: "a", cuts: [[0.96, 1.49]] }] });
  const apart = fillerPlan(one([cap("c", 0, 3, [W("so", 0, 0.5), W("um", 1, 1.2), W("uh", 1.8, 2), W("go", 2.5, 3)])]));
  expect(apart.cuts[0].cuts).toEqual([[0.96, 1.24], [1.76, 2.04]]);
});

test("the pad never crosses a neighbour word, nor the clip's edges", () => {
  const tight = fillerPlan(one([cap("c", 0, 3, [W("so", 0, 0.98), W("um", 1, 1.2), W("go", 1.21, 2)])]));
  expect(tight.cuts[0].cuts).toEqual([[0.98, 1.21]]);
});

test("can't be cut: over a photo, a reversed clip, a clip whose sound is on its own bar, or across two clips; counted, never cut", () => {
  const clips = [makeClip({ id: "a", sourceDuration: 3 }), makePhotoClip({ id: "ph", seconds: 3 }), makeClip({ id: "r", sourceDuration: 3, reversed: true }), makeClip({ id: "x", sourceDuration: 3 })];
  const p = extractClipAudio(one([
    cap("c1", 0.5, 2.5, [W("so", 0, 0.4), W("um", 1, 1.3), W("go", 1.6, 2)]),        // over a: cuttable
    cap("c2", 2.6, 3.6, [W("uh", 0.2, 0.6)]),                                          // 2.8 … 3.2: across a | ph
    cap("c3", 4, 5, [W("um", 0.2, 0.5)]),                                              // over the photo
    cap("c4", 7, 8, [W("um", 0.2, 0.5)]),                                              // over the reversed clip
    cap("c5", 10, 11, [W("hmm", 0.2, 0.5)]),                                           // over x, whose sound is extracted
  ], clips), "x", "bar");
  const plan = fillerPlan(p);
  expect([plan.found, plan.removable, plan.cannot]).toEqual([5, 1, 4]);
  expect(plan.cuts.map((c) => c.clipId)).toEqual(["a"]);
});

test("the piece rules of pauses: no piece under 0.3 s heard — a filler right after the clip's start or before its end that would leave one is not cut", () => {
  const p = one([cap("c", 0, 3, [W("um", 0.2, 0.4), W("go", 1, 2.9)])], [makeClip({ id: "a", sourceDuration: 3 })]);
  expect(fillerPlan(p)).toMatchObject({ found: 1, removable: 0, cannot: 1, cuts: [] });
  const edge = one([cap("c", 0, 3, [W("um", 0, 0.2), W("go", 1, 2.9)])], [makeClip({ id: "a", sourceDuration: 3 })]);
  expect(fillerPlan(edge).cuts).toEqual([{ clipId: "a", cuts: [[0, 0.24]] }]);   // a cut at the very start leaves no short piece
});

test("a caption that was only a filler goes; a duplicated caption counts each moment once", () => {
  const p = one([sentence(), cap("solo", 6, 7, [W("Um.", 0.2, 0.5)]), { ...sentence(), id: "copy" }]);
  const plan = fillerPlan(p);
  expect([plan.found, plan.removable]).toEqual([3, 3]);
  const q = removeCuts(p, plan.cuts);
  expect(q.overlays.map((o) => o.id)).toEqual(["c", "copy"]);
  expect(q.overlays.map((o) => (o as TextOverlay).text)).toEqual(["so we go", "so we go"]);
});

test("nothing to find: no captions, captions without words, texts, or no filler", () => {
  for (const p of [one([]), one([makeOverlay({ id: "t", text: "um" })]), one([makeOverlay({ id: "c", kind: "caption", text: "um", words: [] })]),
    one([cap("c", 0, 2, [W("hello", 0, 0.5), W("there", 0.6, 1)])])]) expect(fillerPlan(p)).toEqual({ found: 0, removable: 0, cannot: 0, cuts: [] });
});

test("several clips: one ClipCuts per clip, in clip order, and removeCuts applies them as one step", () => {
  const p = one([cap("c1", 0.5, 2.5, [W("so", 0, 0.4), W("um", 1, 1.3), W("go", 1.6, 2)]), cap("c2", 4.5, 6.5, [W("so", 0, 0.4), W("uh", 1, 1.3), W("go", 1.6, 2)])],
    [makeClip({ id: "a", sourceDuration: 3 }), makeClip({ id: "b", sourceDuration: 4 })]);
  const plan = fillerPlan(p);
  expect(plan.cuts.map((c) => c.clipId)).toEqual(["a", "b"]);
  const q = removeCuts(p, plan.cuts);
  expect(q.overlays.map((o) => (o as TextOverlay).text)).toEqual(["so go", "so go"]);
  expect(q.overlays[1].start).toBeCloseTo(4.5 - 0.38, 9);   // b's caption moved left by a's cut (1.46 … 1.84)
});
