import { canCutClip, removeCuts, type ClipCuts } from "./ops";
import { fitCuts, PAUSES } from "./pauses";
import { clipDuration, clipStartTimes, outputToSource, sourceAfter } from "./timeline";
import type { Project } from "./types";

/**
 * Remove filler words (spec §2.4): which caption words are hesitations, and the cuts that take their moments out of the video
 * clips under them. Pure TypeScript — no listening, no phone: only the caption words already in the project. The words themselves
 * leave their captions through the cut (`rippleTimed` drops a word whose middle is cut), never by id.
 */
export const FILLER = {
  /** OUTPUT seconds of room each side of a filler's recorded edges — never into a neighbour word. */
  pad: 0.04,
} as const;

/** English hesitations: um, uh, uhm, erm, hm, mm and their long forms. Never "er" (German "he"), "ah" / "oh" (they carry meaning). */
const FORMS = /^(?:u+m+|u+h+|u+h+m+|e+r+m+|h+m+|m{2,})$/;
const MARKS = "\\s.,!?;:…\"'“”‘’()\\[\\]\\-–—";
const EDGES = new RegExp(`^[${MARKS}]+|[${MARKS}]+$`, "g");
const bare = (w: string): string => w.toLowerCase().replace(EDGES, "");

/** A filler word (case and leading / trailing punctuation ignored); "mm" right after a number is the unit, not a filler. */
export function isFiller(word: string, before: string | null): boolean {
  const w = bare(word);
  if (!FORMS.test(w)) return false;
  return !(/^m+$/.test(w) && before !== null && /\d$/.test(bare(before)));
}

/** `found` filler moments; `removable` of them cut by `cuts` (one entry per clip, in clip order); `cannot` = the rest. */
export type FillerPlan = { found: number; removable: number; cannot: number; cuts: ClipCuts[] };
export const NO_FILLERS: FillerPlan = { found: 0, removable: 0, cannot: 0, cuts: [] };

const EPS = 1e-6;
const ms = (v: number): number => Math.round(v * 1000) / 1000;
type Moment = { text: string; start: number; end: number };
type Planned = { cut: [number, number]; words: number };

/** Every filler of every caption with words, and the cuts that remove the ones that can be cut. Never throws. */
export function fillerPlan(p: Project): FillerPlan {
  // Every caption word at its project time, once per moment (a duplicated caption's words are the same moments).
  const seen = new Set<string>();
  const words: Moment[] = [];
  for (const o of p.overlays) {
    if (o.kind !== "caption") continue;
    for (const w of o.words) {
      const m = { text: w.text, start: ms(o.start + w.start), end: ms(o.start + w.end) };
      const key = `${m.start}|${m.end}|${bare(m.text)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      words.push(m);
    }
  }
  words.sort((a, b) => a.start - b.start || a.end - b.end);
  const starts = clipStartTimes(p);
  const perClip = new Map<number, Planned[]>();
  let found = 0;
  words.forEach((w, i) => {
    if (!isFiller(w.text, i > 0 ? words[i - 1].text : null)) return;
    found++;
    const j = p.clips.findIndex((c, k) => starts[k] - EPS <= w.start && w.end <= starts[k] + clipDuration(c) + EPS);
    if (j < 0 || !canCutClip(p, p.clips[j])) return;
    const clip = p.clips[j], s = starts[j], d = clipDuration(clip);
    const prev = i > 0 ? words[i - 1].end : -Infinity, next = i < words.length - 1 ? words[i + 1].start : Infinity;
    const lo = Math.max(s, Math.min(w.start, Math.max(w.start - FILLER.pad, prev)));
    const hi = Math.min(s + d, Math.max(w.end, Math.min(w.end + FILLER.pad, next)));
    const a = Math.max(clip.trimStart, ms(outputToSource(clip, lo - s))), b = Math.min(clip.trimEnd, ms(outputToSource(clip, hi - s)));
    const list = perClip.get(j) ?? [];
    list.push({ cut: [a, b], words: 1 });
    perClip.set(j, list);
  });
  const cuts: ClipCuts[] = [];
  let removable = 0;
  for (const [j, list] of [...perClip.entries()].sort((x, y) => x[0] - y[0])) {
    const clip = p.clips[j];
    list.sort((x, y) => x.cut[0] - y.cut[0]);
    const merged: Planned[] = [];
    for (const e of list) {
      const last = merged[merged.length - 1];
      if (last && e.cut[0] <= last.cut[1] + EPS) { last.cut[1] = Math.max(last.cut[1], e.cut[1]); last.words += e.words; }
      else merged.push({ cut: [e.cut[0], e.cut[1]], words: e.words });
    }
    const long = merged.filter((e) => e.cut[1] - e.cut[0] >= PAUSES.minCut - EPS);
    const minPiece = sourceAfter(clip, clip.trimStart, PAUSES.minPiece) - clip.trimStart;
    const kept = fitCuts(long.map((e) => e.cut), clip.trimStart, clip.trimEnd, minPiece);
    // The op is the oracle: a clip it would still refuse alone (no piece left, the layers' limit) cuts nothing.
    if (kept.length === 0 || removeCuts(p, [{ clipId: clip.id, cuts: kept }]) === p) continue;
    const keep = new Set(kept);
    removable += long.reduce((n, e) => n + (keep.has(e.cut) ? e.words : 0), 0);
    cuts.push({ clipId: clip.id, cuts: kept });
  }
  // … and so is the whole: clips each accepted alone can still be refused together (two maps pull a later layer onto earlier ones).
  if (cuts.length > 1 && removeCuts(p, cuts) === p) return { found, removable: 0, cannot: found, cuts: [] };
  return { found, removable, cannot: found - removable, cuts };
}
