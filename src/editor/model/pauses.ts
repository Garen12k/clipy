import type { PeaksAnswer, PeaksCall } from "./peaks";

/**
 * Remove pauses: where a talking clip is quiet, and what to cut. Pure TypeScript — no React, no store, no phone, nothing mirrored
 * in Swift (the phone only answers `soundPeaks` with numbers). Times are SOURCE seconds of the clip's file; the caller turns the
 * chips' output seconds into source seconds through timeline.ts (`pauseOptions`), never here.
 */
export const PAUSES = {
  /** Slices a second: 10 ms — a pause's edge is placed to a hundredth of a second. */
  perSecond: 100,
  /** The most values one native answer holds (`SoundPeaks.most`), the fewest (`SoundPeaks.fewest`), the most calls (30 × 20 s). */
  perCall: 2000, fewest: 16, calls: 30,
  /** The longest trimmed clip listened to, in source seconds (ten minutes = 60 000 slices). */
  longest: 600,
  /** Outlines kept in memory for the session (the oldest goes first). */
  remember: 8,
  /** Sound kept each side of a cut that touches sound; a cut shorter than `minCut` after it is not made. */
  pad: 0.1, minCut: 0.05,
  /** No piece of sound shorter than this, in OUTPUT seconds (the caller converts it). */
  minPiece: 0.3,
  /** A loud run this short with quiet on both sides is a click, not a word. */
  blip: 0.02,
  /** −60 dB of full scale: the quiet line is never lower, and a clip whose loudest moment is lower is silent. */
  floor: 0.001,
  /** The most cuts one Remove makes (the longest are kept). */
  maxCuts: 60,
} as const;

export type PauseGapId = "short" | "medium" | "long";
export type PauseQuietId = "silent" | "quiet" | "noisy";
/** "Cut pauses longer than": OUTPUT seconds. */
export const PAUSE_GAPS: readonly { id: PauseGapId; label: string; spoken: string; seconds: number }[] = [
  { id: "short", label: "0.3 s", spoken: "Longer than 0.3 seconds", seconds: 0.3 },
  { id: "medium", label: "0.6 s", spoken: "Longer than 0.6 seconds", seconds: 0.6 },
  { id: "long", label: "1 s", spoken: "Longer than 1 second", seconds: 1 },
];
/** "What counts as quiet": dB under the clip's own loudest slice. */
export const PAUSE_QUIET: readonly { id: PauseQuietId; label: string; db: number }[] = [
  { id: "silent", label: "Silent", db: -45 },
  { id: "quiet", label: "Quiet", db: -35 },
  { id: "noisy", label: "Noisy Room", db: -25 },
];
export type PauseChoice = { gap: PauseGapId; quiet: PauseQuietId };
export const DEFAULT_PAUSE_CHOICE: PauseChoice = { gap: "medium", quiet: "quiet" };

export type PauseCut = readonly [number, number];
/** A clip's sound over `from` … `to`: `levels[i]` (0 … 1, a float) is the loudest moment of the i-th of `levels.length` equal slices. */
export type PauseOutline = { from: number; to: number; levels: Float32Array };
export type PauseOptions = { minGap: number; minPiece: number; pad: number; quietDb: number };
export type PauseFind = { cuts: PauseCut[]; silent: boolean };

const known = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const EPS = 1e-6;
const ms = (v: number): number => Math.round(v * 1000) / 1000;

/** The native calls a clip's range costs (as `peaksPlan`, over `from` … `to`), or null: not a positive span, or over `PAUSES.longest`. */
export function pausePlan(from: number, to: number): PeaksCall[] | null {
  if (!known(from) || !known(to) || !(to > from) || to - from > PAUSES.longest + 1e-9) return null;
  const span = to - from;
  const total = Math.max(PAUSES.fewest, Math.round(span * PAUSES.perSecond));
  const calls = Math.ceil(total / PAUSES.perCall);
  const edge = (i: number): number => Math.round((i * total) / calls);
  const out: PeaksCall[] = [];
  for (let i = 0; i < calls; i++) out.push({ from: from + (edge(i) / total) * span, to: i === calls - 1 ? to : from + (edge(i + 1) / total) * span, count: edge(i + 1) - edge(i) });
  return out;
}

/** The answers as one outline of floats (never bytes), or null when they are not the plan's. `assemblePeaks`' lookup rule. */
export function assemblePauseOutline(plan: readonly PeaksCall[], answers: readonly PeaksAnswer[]): PauseOutline | null {
  if (!plan.length || answers.length !== plan.length) return null;
  const levels = new Float32Array(plan.reduce((n, c) => n + c.count, 0));
  let at = 0;
  for (let i = 0; i < plan.length; i++) {
    const call = plan[i], a = answers[i];
    if (!a || !Array.isArray(a.peaks) || a.peaks.length === 0 || !known(a.from) || !known(a.to)) return null;
    const n = a.peaks.length, read = a.to - a.from;
    for (let j = 0; j < call.count; j++, at++) {
      const t = call.from + ((j + 0.5) * (call.to - call.from)) / call.count;
      const k = read > 0 ? Math.floor(((t - a.from) / read) * n) : -1;
      const v = k >= 0 && k < n ? a.peaks[k] : 0;
      levels[at] = known(v) ? Math.min(1, Math.max(0, v)) : 0;
    }
  }
  return { from: plan[0].from, to: plan[plan.length - 1].to, levels };
}

/** The pauses of an outline (spec §2.5): what to cut, in time order, or that the clip is silent. Never throws. */
export function findPauses(o: PauseOutline, opt: PauseOptions): PauseFind {
  const n = o.levels?.length ?? 0, span = o.to - o.from;
  if (n === 0 || !(span > 0) || ![o.from, o.to, opt.minGap, opt.minPiece, opt.pad, opt.quietDb].every(known)) return { cuts: [], silent: false };
  const level = (i: number): number => { const v = o.levels[i]; return known(v) && v > 0 ? v : 0; };
  let top = 0;
  for (let i = 0; i < n; i++) if (level(i) > top) top = level(i);
  if (top < PAUSES.floor) return { cuts: [], silent: true };
  const line = Math.max(PAUSES.floor, top * Math.pow(10, opt.quietDb / 20));
  const quiet = new Uint8Array(n);
  for (let i = 0; i < n; i++) quiet[i] = level(i) < line ? 1 : 0;
  // A click: a loud run of at most `blip` with quiet on both sides.
  const blip = Math.floor(PAUSES.blip / (span / n) + 1e-9);
  for (let i = 0; i < n;) {
    if (quiet[i]) { i++; continue; }
    let j = i;
    while (j < n && !quiet[j]) j++;
    if (i > 0 && j < n && j - i <= blip) quiet.fill(1, i, j);
    i = j;
  }
  // Nothing left but quiet (the loudest moments were clicks): the clip is silent — never one cut over the whole clip.
  if (quiet.every((q) => q === 1)) return { cuts: [], silent: true };
  // Quiet runs → cuts: less `pad` where they touch sound, to the clip's exact edge where they reach it.
  const at = (k: number): number => o.from + (k / n) * span;
  const found: [number, number][] = [];
  for (let i = 0; i < n;) {
    if (!quiet[i]) { i++; continue; }
    let j = i;
    while (j < n && quiet[j]) j++;
    const a = i === 0 ? o.from : at(i), b = j === n ? o.to : at(j);
    if (b - a >= opt.minGap - EPS) {
      const from = i === 0 ? o.from : ms(a + opt.pad), to = j === n ? o.to : ms(b - opt.pad);
      if (to - from >= PAUSES.minCut - EPS) found.push([from, to]);
    }
    i = j;
  }
  return { cuts: fitCuts(found, o.from, o.to, opt.minPiece), silent: false };
}

/**
 * The piece rules, shared by Remove pauses and Remove filler words: no piece of sound under `minPiece` (source seconds) — the cut
 * after a short piece is dropped (it joins the next), then the last cut while the tail is short — and at most `PAUSES.maxCuts` (the
 * longest kept, in order). Answers the SAME cut objects, in order, between `from` and `to`.
 */
export function fitCuts<C extends readonly [number, number]>(found: readonly C[], from: number, to: number, minPiece: number): C[] {
  const kept: C[] = [];
  let start = from;
  for (const c of found) {
    const piece = c[0] - start;
    if (piece <= EPS || piece >= minPiece - EPS) { kept.push(c); start = c[1]; }
  }
  while (kept.length > 0) {
    const tail = to - kept[kept.length - 1][1];
    if (tail <= EPS || tail >= minPiece - EPS) break;
    kept.pop();
  }
  if (kept.length <= PAUSES.maxCuts) return kept;
  return kept.map((c, i) => ({ c, i }))
    .sort((x, y) => (y.c[1] - y.c[0]) - (x.c[1] - x.c[0]) || x.i - y.i)
    .slice(0, PAUSES.maxCuts)
    .sort((x, y) => x.i - y.i)
    .map((x) => x.c);
}
