import { clampCaptionWords, captionLength, makeClip, makeEffect, makeKeyframe, makeLayer, makeOverlay, makeProject, type TextOverlay } from "../types";
import { inRemoved, mapTime, mergeRemoved, removedOf, rippleTimed } from "../rippleCuts";

const RS = [[2, 3], [5, 7]] as const;

test("mergeRemoved: sorted, merged, empty and non-finite ranges dropped", () => {
  expect(mergeRemoved([[5, 7], [2, 3], [2.5, 4], [1, 1], [NaN, 2]])).toEqual([[2, 4], [5, 7]]);
  expect(mergeRemoved([[1, 2], [2, 3]])).toEqual([[1, 3]]);   // touching ranges are one
  expect(mergeRemoved([])).toEqual([]);
});

test("mapTime: identity before, a removed time collapses to its range's start, later times lose what was removed before them", () => {
  expect([1, 2, 2.5, 3, 4, 5, 6, 7, 8].map((t) => mapTime(RS, t))).toEqual([1, 2, 2, 2, 3, 4, 4, 4, 5]);
  expect(mapTime([], 3)).toBe(3);
});

test("mapTime is monotone (never decreasing)", () => {
  let last = -Infinity;
  for (let t = 0; t <= 10; t += 0.01) { const m = mapTime(RS, t); expect(m).toBeGreaterThanOrEqual(last - 1e-12); last = m; }
});

test("inRemoved: strictly inside only", () => {
  expect([2, 2.5, 3, 4, 6].map((t) => inRemoved(RS, t))).toEqual([false, true, false, false, true]);
});

test("removedOf: source cuts → project ranges through timeline.ts, clamped to the trim; [] for an unknown id", () => {
  const p = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "t", sourceDuration: 20, trimStart: 2, trimEnd: 12 })] });
  expect(removedOf(p, "t", [[4, 5], [8, 9.5]])).toEqual([[6, 7], [10, 11.5]]);
  expect(removedOf(p, "t", [[1, 3]])).toEqual([[4, 5]]);   // clamped to trimStart 2
  const fast = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "t", sourceDuration: 20, trimStart: 2, trimEnd: 12, speed: 2 })] });
  expect(removedOf(fast, "t", [[4, 6]])).toEqual([[5, 6]]);
  expect(removedOf(p, "nope", [[4, 5]])).toEqual([]);
});

const caption = (more: Partial<TextOverlay> = {}): TextOverlay => makeOverlay({ id: "c", kind: "caption", start: 5, end: 9, text: "so um we go", words: [
  { text: "so", start: 0, end: 0.4 }, { text: "um", start: 0.6, end: 0.9 }, { text: "we", start: 1.5, end: 1.8 }, { text: "go", start: 2.6, end: 3 }], ...more });

test("a caption: shortened, a word whose middle is cut is dropped, the others mapped, the text rebuilt and valid", () => {
  const p = makeProject({ overlays: [caption()] });
  const { overlays } = rippleTimed(p, [[6, 7]], 20);
  const c = overlays[0] as TextOverlay;
  expect([c.start, c.end, c.text]).toEqual([5, 8, "so um go"]);
  expect(c.words).toEqual([{ text: "so", start: 0, end: 0.4 }, { text: "um", start: 0.6, end: 0.9 }, { text: "go", start: 1.6, end: 2 }]);
  expect(clampCaptionWords(c.words, c.text, captionLength(c.start, c.end))).toEqual(c.words);   // the normaliser keeps them
});

test("a caption keeps its text byte for byte when no word is dropped; one with no words left, or under 0.2 s, is removed", () => {
  const spaced = caption({ text: "so  um we go" });   // two spaces: still valid words
  const kept = rippleTimed(makeProject({ overlays: [spaced] }), [[3, 4]], 20).overlays[0] as TextOverlay;
  expect([kept.start, kept.end, kept.text]).toEqual([4, 8, "so  um we go"]);
  expect(rippleTimed(makeProject({ overlays: [caption()] }), [[4, 9.5]], 20).overlays).toEqual([]);
  const one = makeOverlay({ id: "u", kind: "caption", start: 5, end: 6, text: "um", words: [{ text: "um", start: 0.2, end: 0.6 }] });
  expect(rippleTimed(makeProject({ overlays: [one] }), [[5.1, 5.7]], 20).overlays).toEqual([]);
});

test("a caption without words (its text was edited) is only shortened", () => {
  const c = makeOverlay({ id: "c", kind: "caption", start: 5, end: 9, text: "edited", words: [] });
  expect(rippleTimed(makeProject({ overlays: [c] }), [[6, 7]], 20).overlays[0]).toMatchObject({ start: 5, end: 8, text: "edited", words: [] });
});

test("texts and stickers: start / end mapped, pins re-based on the new start, the ones that collapse kept once; short ones removed", () => {
  const t = makeOverlay({ id: "t", start: 4, end: 10, keyframes: [makeKeyframe({ t: 1 }), makeKeyframe({ t: 2.5, x: 0.2 }), makeKeyframe({ t: 2.8, x: 0.3 }), makeKeyframe({ t: 4 })] });
  const q = rippleTimed(makeProject({ overlays: [t] }), [[6, 7]], 20).overlays[0];
  expect([q.start, q.end]).toEqual([4, 9]);
  expect(q.keyframes.map((k) => [k.t, k.x])).toEqual([[1, 0], [2, 0.2], [3, 0]]);   // 6.5 and 6.8 both land on 6 → the earlier pin stays
  const tiny = makeOverlay({ id: "s", start: 6.1, end: 6.9 });
  expect(rippleTimed(makeProject({ overlays: [tiny] }), [[6, 7]], 20).overlays).toEqual([]);
});

test("an overlay's end never passes the new total; the animation durations are kept", () => {
  const t = makeOverlay({ id: "t", start: 8, end: 10, animation: { in: { id: "fade", duration: 0.5 }, out: { id: "fade", duration: 0.5 }, loop: null } });
  const q = rippleTimed(makeProject({ overlays: [t] }), [[2, 3]], 8.9).overlays[0];
  expect([q.start, q.end]).toEqual([7, 8.9]);
  expect(q.animation).toEqual(t.animation);
});

test("effects mapped (short ones removed); layers' starts mapped (their length is their own); the cover's time mapped", () => {
  const p = makeProject({
    effects: [makeEffect({ id: "e1", start: 1, end: 2 }), makeEffect({ id: "e2", start: 4, end: 9 }), makeEffect({ id: "e3", start: 6.2, end: 6.8 })],
    layers: [makeLayer({ id: "L1", sourceDuration: 2, start: 1 }), makeLayer({ id: "L2", sourceDuration: 2, start: 6.5 }), makeLayer({ id: "L3", sourceDuration: 2, start: 8 })],
    cover: { time: 8, title: "" },
  });
  const r = rippleTimed(p, [[6, 7]], 20);
  expect(r.effects.map((e) => [e.id, e.start, e.end])).toEqual([["e1", 1, 2], ["e2", 4, 8]]);
  expect(r.effects[0]).toBe(p.effects[0]);
  expect(r.layers.map((l) => [l.id, l.start])).toEqual([["L1", 1], ["L2", 6], ["L3", 7]]);
  expect(r.layers[0]).toBe(p.layers[0]);
  expect(r.cover).toEqual({ time: 7, title: "" });
});

test("nothing after the first range: the same arrays and the same cover", () => {
  const p = makeProject({ overlays: [makeOverlay({ id: "o", start: 0, end: 2 })], effects: [makeEffect({ id: "e", start: 0, end: 1 })],
    layers: [makeLayer({ id: "L", sourceDuration: 1, start: 0 })], cover: { time: 1, title: "x" } });
  const r = rippleTimed(p, [[5, 6]], 20);
  expect(r.overlays).toBe(p.overlays); expect(r.effects).toBe(p.effects); expect(r.layers).toBe(p.layers); expect(r.cover).toBe(p.cover);
  expect(rippleTimed(p, [], 20).overlays).toBe(p.overlays);
});

test("nothing after the first range keeps its object even with times of more than 3 decimals (a drag's), not rounded or judged", () => {
  const p = makeProject({ overlays: [makeOverlay({ id: "o", start: 0.12345, end: 1.23456 })], effects: [makeEffect({ id: "e", start: 0.0001, end: 0.10004 })],
    layers: [makeLayer({ id: "L", sourceDuration: 1, start: 0.33333 })], cover: { time: 1.00049, title: "x" } });
  const r = rippleTimed(p, [[5, 6]], 20);
  expect(r.overlays).toBe(p.overlays); expect(r.effects).toBe(p.effects); expect(r.layers).toBe(p.layers); expect(r.cover).toBe(p.cover);
});
