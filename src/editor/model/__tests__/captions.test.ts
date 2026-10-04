jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { CAPTION_STYLE } from "@/src/editor/effects";
import { linesToCaptions, mergeSegmentsIntoLines, segmentsToOutput } from "../captions";
import { CAPTION_PRESETS } from "@/src/editor/textTemplates";
import { applyCaptionPreset, replaceCaptions, setCaptionStyleForAll } from "../ops";
import { curveSteps } from "../timeline";
import { clampCaptionWords, makeClip, makeOverlay, makeProject, type TextOverlay } from "../types";

const w = (text: string, start: number, end: number) => ({ text, start, end });

test("merges words into lines by length, duration and pauses", () => {
  const words = [w("Hello", 0, 0.3), w("there", 0.35, 0.6), w("friends", 0.65, 1.0), w("this", 2.0, 2.2), w("is", 2.25, 2.4), w("Clipy", 2.45, 2.9)];
  expect(mergeSegmentsIntoLines(words)).toEqual([
    { text: "Hello there friends", start: 0, end: 1.0, words: words.slice(0, 3) },
    { text: "this is Clipy", start: 2.0, end: 2.9, words: words.slice(3) },
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
  const caps = linesToCaptions([{ text: "hi", start: 0, end: 1, words: [] }], () => `c${++n}`);
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

describe("caption words", () => {
  test("a line keeps the segments merged into it: trimmed text, rounded times, blanks dropped", () => {
    const lines = mergeSegmentsIntoLines([w("  Hello ", 1.00049, 1.3), w("   ", 1.3, 1.31), w("there\n", 1.35, 1.6004), w("next", 3, 3.4)]);
    expect(lines).toEqual([
      { text: "Hello there", start: 1, end: 1.6, words: [w("Hello", 1, 1.3), w("there", 1.35, 1.6)] },
      { text: "next", start: 3, end: 3.4, words: [w("next", 3, 3.4)] },
    ]);
    for (const l of lines) expect(l.words.map((x) => x.text).join(" ")).toBe(l.text);
  });
  test("every line of a long run is exactly its words joined by single spaces", () => {
    const long = Array.from({ length: 30 }, (_, i) => w(` word${i} `, i * 0.25, i * 0.25 + 0.2));
    const lines = mergeSegmentsIntoLines(long);
    expect(lines.flatMap((l) => l.words).map((x) => x.text)).toEqual(long.map((x) => x.text.trim()));
    for (const l of lines) {
      expect(l.words.map((x) => x.text).join(" ")).toBe(l.text);
      expect(l.start).toBe(l.words[0].start);
      expect(l.end).toBe(Math.max(...l.words.map((x) => x.end)));
    }
  });
  test("linesToCaptions stores the words relative to the caption's start, already in the loader's shape", () => {
    let n = 0;
    const lines = mergeSegmentsIntoLines([w("Hello", 4, 4.25), w("there", 4.5, 4.75), w("friends", 5, 6), w("again", 8, 8.5)]);
    const caps = linesToCaptions(lines, () => `c${++n}`);
    expect(caps.map((c) => c.text)).toEqual(["Hello there friends", "again"]);
    expect(caps[0].words).toEqual([w("Hello", 0, 0.25), w("there", 0.5, 0.75), w("friends", 1, 2)]);
    expect(caps[1].words).toEqual([w("again", 0, 0.5)]);
    for (const c of caps) {
      expect(c.words).toEqual(clampCaptionWords(c.words, c.text, c.end - c.start));
      expect(c.words.map((x) => x.text).join(" ")).toBe(c.text);
      expect(c.highlightColor).toBeNull();
    }
  });
  test("a word reaching outside its line is clamped inside the caption; a line without words gives none", () => {
    const caps = linesToCaptions([
      { text: "a b", start: 2, end: 3, words: [w("a", 1.5, 2.5), w("b", 2.5, 9)] },
      { text: "plain", start: 4, end: 5, words: [] },
      { text: "stale text", start: 6, end: 7, words: [w("other", 6, 7)] },
    ], () => "id");
    expect(caps[0].words).toEqual([w("a", 0, 0.5), w("b", 0.5, 1)]);
    expect(caps[1].words).toEqual([]);
    expect(caps[2].words).toEqual([]);
  });
  test("replaceCaptions keeps the words; a caption cut short by the project end has them re-clamped", () => {
    const p = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })] });
    const caps = linesToCaptions(mergeSegmentsIntoLines([w("one", 1, 1.5), w("two", 1.5, 2), w("late", 9.5, 10.5)]), () => "id");
    const next = replaceCaptions(p, caps);
    const [first, last] = next.overlays as TextOverlay[];
    expect(first.words).toEqual([w("one", 0, 0.5), w("two", 0.5, 1)]);
    expect(last).toMatchObject({ start: 9.5, end: 10, words: [w("late", 0, 0.5)] });
    for (const c of [first, last]) expect(c.words).toEqual(clampCaptionWords(c.words, c.text, c.end - c.start));
  });
});

describe("final review", () => {
  test("linesToCaptions: a word reaching the line's end is clamped without float residue (3.4 - 3)", () => {
    const caps = linesToCaptions([{ text: "a b", start: 3, end: 3.4, words: [w("a", 3, 3.2), w("b", 3.2, 3.9)] }], () => "c");
    expect(caps[0].words).toEqual([w("a", 0, 0.2), w("b", 0.2, 0.4)]);
  });

  test("replaceCaptions gives the new captions the look of the ones they replace, with their own words", () => {
    let o = 0;
    const base = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })], overlays: [makeOverlay({ id: "t" }),
      ...linesToCaptions([{ text: "old one", start: 0, end: 1, words: [w("old", 0, 0.5), w("one", 0.5, 1)] }, { text: "old two", start: 1, end: 2, words: [] }], () => `o${++o}`)] });
    const styled = setCaptionStyleForAll(applyCaptionPreset(base, "karaoke"), { align: "left", x: 0.3, y: 0.7 });
    const look = styled.overlays[1] as TextOverlay;
    let n = 0;
    const fresh = linesToCaptions([
      { text: "new words here", start: 2, end: 4, words: [w("new", 2, 2.5), w("words", 2.5, 3), w("here", 3, 4)] },
      { text: "again", start: 5, end: 6, words: [w("again", 5, 6)] },
    ], () => `n${++n}`);
    const next = replaceCaptions(styled, fresh);
    const caps = next.overlays.slice(1) as TextOverlay[];
    expect(next.overlays.map((x) => x.id)).toEqual(["t", "n1", "n2"]);
    const k = CAPTION_PRESETS.karaoke.patch;
    for (const c of caps) {
      expect(c).toMatchObject({ kind: "caption", fontId: k.fontId, fontScale: k.fontScale, color: k.color, background: null, outline: true,
        align: "left", x: 0.3, y: 0.7, style: k.style, highlightColor: k.highlightColor });
      expect(c.style).not.toBe(look.style);
    }
    expect(caps[0].style).not.toBe(caps[1].style);
    expect(caps.map((c) => c.text)).toEqual(["new words here", "again"]);
    expect(caps[0].words).toEqual([w("new", 0, 0.5), w("words", 0.5, 1), w("here", 1, 2)]);
    expect(caps[1].words).toEqual([w("again", 0, 1)]);
    // A background is copied, never shared.
    const bar = replaceCaptions(applyCaptionPreset(styled, "classicBar"), fresh).overlays.slice(1) as TextOverlay[];
    expect(bar[0].background).toEqual(CAPTION_PRESETS.classicBar.patch.background);
    expect(bar[0].background).not.toBe(bar[1].background);
    // No captions before: the generated look, as always.
    const first = replaceCaptions(makeProject({ clips: base.clips, overlays: [makeOverlay({ id: "t" })] }), fresh).overlays[1];
    expect(first).toMatchObject({ ...CAPTION_STYLE, highlightColor: null });
  });
});
