jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { CAPTION_STYLE } from "@/src/editor/effects";
import { linesToCaptions, mergeSegmentsIntoLines, segmentsToOutput } from "../captions";
import { replaceCaptions, setCaptionStyleForAll } from "../ops";
import { curveSteps } from "../timeline";
import { makeClip, makeOverlay, makeProject } from "../types";

const w = (text: string, start: number, end: number) => ({ text, start, end });

test("merges words into lines by length, duration and pauses", () => {
  const words = [w("Hello", 0, 0.3), w("there", 0.35, 0.6), w("friends", 0.65, 1.0), w("this", 2.0, 2.2), w("is", 2.25, 2.4), w("Clipy", 2.45, 2.9)];
  expect(mergeSegmentsIntoLines(words)).toEqual([
    { text: "Hello there friends", start: 0, end: 1.0 },
    { text: "this is Clipy", start: 2.0, end: 2.9 },
  ]); // pause of 1.0 s > 0.6 splits
  const long = Array.from({ length: 12 }, (_, i) => w("word" + i, i * 0.2, i * 0.2 + 0.15)); // "word0 word1 …" > 40 chars
  const lines = mergeSegmentsIntoLines(long);
  expect(lines.length).toBeGreaterThan(1);
  for (const l of lines) expect(l.text.length).toBeLessThanOrEqual(40);
  const slow = [w("a", 0, 1), w("b", 1.1, 2), w("c", 2.1, 3.2), w("d", 3.3, 4)];
  expect(mergeSegmentsIntoLines(slow).map((l) => l.text)).toEqual(["a b", "c d"]); // 3 s limit
  expect(mergeSegmentsIntoLines([])).toEqual([]);
});

test("segmentsToOutput maps through the clip's trim, speed and start", () => {
  const clip = makeClip({ id: "a", sourceDuration: 10, trimStart: 2, trimEnd: 6, speed: 2 });
  expect(segmentsToOutput(clip, 5, [w("x", 3, 4), w("out", 7, 8), w("edge", 1, 2.5)])).toEqual([
    { text: "edge", start: 5, end: 5.25 },
    { text: "x", start: 5.5, end: 6 },
  ]); // "out" is past trimEnd; "edge" is clamped to the trim
});

test("linesToCaptions applies the caption style; replaceCaptions swaps only captions; style applies to all", () => {
  let n = 0;
  const caps = linesToCaptions([{ text: "hi", start: 0, end: 1 }], () => `c${++n}`);
  expect(caps[0]).toMatchObject({ id: "c1", kind: "caption", text: "hi", start: 0, end: 1, ...CAPTION_STYLE });
  const p = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })], overlays: [makeOverlay({ id: "t" }), makeOverlay({ id: "old", kind: "caption" })] });
  const next = replaceCaptions(p, caps);
  expect(next.overlays.map((o) => o.id)).toEqual(["t", "c1"]);
  const styled = setCaptionStyleForAll(next, { color: "#F5C542", y: 0.9 });
  expect(styled.overlays[1]).toMatchObject({ color: "#F5C542", y: 0.9 });
  expect(styled.overlays[0]).toMatchObject({ color: makeOverlay({ id: "t" }).color });
  expect(setCaptionStyleForAll(styled, { color: "#F5C542" })).toBe(styled);
});

test("segmentsToOutput on a curved clip maps each end through the curve", () => {
  // hero on 0–8: speeds 1, 2, 3, 0.5, 0.5, 3, 2, 1 for the 1 s slices; output boundaries 0, 1, 1.5, 11/6, 23/6, …
  const clip = { ...makeClip({ id: "h", sourceDuration: 8 }), speedCurve: { id: "hero" as const, steps: curveSteps("hero", 0, 8) } };
  expect(segmentsToOutput(clip, 5, [w("slow", 3, 4), w("fast", 1, 2), w("across", 2.5, 3.5)])).toEqual([
    { text: "fast", start: 6, end: 6.5 },          // 1 s of source at 2×
    { text: "across", start: 6.667, end: 7.833 },  // half the 3× slice, then half the 0.5× slice
    { text: "slow", start: 6.833, end: 8.833 },    // 1 s of source at 0.5×
  ]);
  // Trimmed after the curve was applied: the steps stay, the clip now starts at source 2.
  const t = { ...clip, trimStart: 2, trimEnd: 7 };
  expect(segmentsToOutput(t, 0, [w("edge", 1, 2.5), w("slow", 3, 4), w("out", 7.2, 8)])).toEqual([
    { text: "edge", start: 0, end: 0.167 },
    { text: "slow", start: 0.333, end: 2.333 },
  ]);
});
