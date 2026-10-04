import { CAPTION_STYLE } from "@/src/editor/effects";
import { sourceToOutput } from "./timeline";
import { captionLength, clampCaptionWords, makeOverlay, type Clip, type TextOverlay } from "./types";

export interface Segment { text: string; start: number; end: number }
/** `words`: the segments merged into the line (trimmed text, same time base as the line); `text` is their texts joined by single spaces. */
export interface Line { text: string; start: number; end: number; words: Segment[] }
export interface MergeOptions { maxChars?: number; maxSeconds?: number; pauseGap?: number }

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Groups timed words/phrases into caption lines: break on long pauses, line length, or line duration. Input and output are in the same time base. */
export function mergeSegmentsIntoLines(segments: Segment[], opts: MergeOptions = {}): Line[] {
  const maxChars = opts.maxChars ?? 40, maxSeconds = opts.maxSeconds ?? 3, pauseGap = opts.pauseGap ?? 0.6;
  const lines: Line[] = [];
  let cur: Line | null = null;
  for (const s of segments) {
    const text = s.text.trim();
    if (!text) continue;
    const breakHere = cur !== null && (s.start - cur.end > pauseGap || `${cur.text} ${text}`.length > maxChars || s.end - cur.start > maxSeconds);
    const word: Segment = { text, start: r3(s.start), end: r3(s.end) };
    if (cur === null || breakHere) { if (cur) lines.push(cur); cur = { text, start: word.start, end: word.end, words: [word] }; }
    else { cur.text = `${cur.text} ${text}`; cur.end = Math.max(cur.end, word.end); cur.words.push(word); }
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Converts source-time segments of one clip into output-time segments; drops segments outside the trim, clamps partial ones. */
export function segmentsToOutput(clip: Clip, clipStart: number, segments: Segment[]): Segment[] {
  const out: Segment[] = [];
  for (const s of segments) {
    const a = Math.max(s.start, clip.trimStart), b = Math.min(s.end, clip.trimEnd);
    if (b <= a) continue;
    out.push({ text: s.text, start: r3(clipStart + sourceToOutput(clip, a)), end: r3(clipStart + sourceToOutput(clip, b)) });
  }
  return out.sort((x, y) => x.start - y.start);
}

/** Each caption keeps its line's words as seconds from the caption's start, through the loader's rule (clamped inside the caption; [] when they are not the text). */
export function linesToCaptions(lines: Line[], newId: () => string): TextOverlay[] {
  return lines.map((l) => {
    const words = l.words.map((w) => ({ text: w.text, start: r3(w.start - l.start), end: r3(w.end - l.start) }));
    return makeOverlay({ id: newId(), kind: "caption", text: l.text, ...CAPTION_STYLE, scale: 1, rotation: 0, start: l.start, end: l.end,
      words: clampCaptionWords(words, l.text, captionLength(l.start, l.end)) });
  });
}
