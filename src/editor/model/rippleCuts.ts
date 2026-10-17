import type { PauseCut } from "./pauses";
import { clipStartTimes, sourceToOutput } from "./timeline";
import { captionLength, clampCaptionWords, clampOverlayKeyframes, EFFECT_LIMITS, OVERLAY_LIMITS, type Cover, type EffectItem, type LayerClip, type Overlay, type Project } from "./types";

/**
 * Cuts made inside main clips, and what follows them (spec §2.1–2.2). Pure TypeScript, no speed arithmetic (timeline.ts converts).
 * ONE map per operation: `t → t − removed time before t`; a time inside a removed range collapses to the range's start. What is tied
 * to the picture follows it — overlays (and their pins and caption words), effect bars, layers' starts, the cover; sounds and beat
 * markers are never passed here.
 */
export type Removed = readonly [number, number];

const EPS = 1e-9;
const r3 = (v: number): number => Math.round(v * 1000) / 1000;
/** `t` mapped and capped at `total`, to 3 decimals — or `t` itself, unrounded, when the map leaves it where it was (so an untouched item stays the same object). */
const moved = (rs: readonly Removed[], t: number, total = Infinity): number => { const m = Math.min(mapTime(rs, t), total); return m === t ? t : r3(m); };

/** A main clip's cuts (source seconds) as the project time they take away, each clamped to the trim; [] for an id that is not a main clip. */
export function removedOf(p: Project, clipId: string, cuts: readonly PauseCut[]): Removed[] {
  const i = p.clips.findIndex((c) => c.id === clipId);
  if (i < 0) return [];
  const clip = p.clips[i], start = clipStartTimes(p)[i];
  const out: Removed[] = [];
  for (const [a, b] of cuts) {
    const from = Math.max(a, clip.trimStart), to = Math.min(b, clip.trimEnd);
    if (!(to > from)) continue;
    out.push([start + sourceToOutput(clip, from), start + sourceToOutput(clip, to)]);
  }
  return out;
}

/** Finite, non-empty ranges, sorted, overlapping or touching ones merged. */
export function mergeRemoved(ranges: readonly Removed[]): [number, number][] {
  const sorted = ranges.filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a).map(([a, b]): [number, number] => [a, b]).sort((x, y) => x[0] - y[0]);
  const out: [number, number][] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1] + EPS) last[1] = Math.max(last[1], r[1]);
    else out.push(r);
  }
  return out;
}

/** `t` once the (merged) ranges are gone: identity before the first, a removed time → its range's start. Monotone. */
export function mapTime(ranges: readonly Removed[], t: number): number {
  let gone = 0;
  for (const [a, b] of ranges) {
    if (t <= a) break;
    if (t < b) return a - gone;
    gone += b - a;
  }
  return t - gone;
}

/** Strictly inside a removed range. */
export const inRemoved = (ranges: readonly Removed[], t: number): boolean => ranges.some(([a, b]) => t > a && t < b);

/** Each element through `f` (null = removed); the SAME array when nothing changed. */
function each<T>(list: readonly T[], f: (x: T) => T | null): T[] {
  let changed = false;
  const out: T[] = [];
  for (const x of list) { const y = f(x); if (y !== x) changed = true; if (y !== null) out.push(y); }
  return changed ? out : (list as T[]);
}

function rippleOverlay(o: Overlay, rs: readonly Removed[], total: number): Overlay | null {
  const start = moved(rs, o.start, total), end = moved(rs, o.end, total);
  if (start === o.start && end === o.end) return o;
  if (end - start < OVERLAY_LIMITS.minDuration - EPS) return null;
  const at = (rel: number): number => r3(mapTime(rs, o.start + rel) - start);
  const keyframes = o.keyframes.length === 0 ? o.keyframes : clampOverlayKeyframes(o.keyframes.map((k) => ({ ...k, t: at(k.t) })));
  if (o.kind !== "caption" || o.words.length === 0) return { ...o, start, end, keyframes };
  // A word whose middle is cut is no longer heard: it goes. The rest keep their text, so the joined words stay the caption's text.
  const kept = o.words.filter((w) => !inRemoved(rs, o.start + (w.start + w.end) / 2));
  if (kept.length === 0) return null;
  const text = kept.length === o.words.length ? o.text : kept.map((w) => w.text).join(" ");
  const words = kept.map((w) => ({ text: w.text, start: at(w.start), end: at(w.end) }));
  return { ...o, start, end, keyframes, text, words: clampCaptionWords(words, text, captionLength(start, end)) };
}

function rippleEffect(e: EffectItem, rs: readonly Removed[], total: number): EffectItem | null {
  const start = moved(rs, e.start, total), end = moved(rs, e.end, total);
  if (start === e.start && end === e.end) return e;
  return end - start < EFFECT_LIMITS.minDuration - EPS ? null : { ...e, start, end, rect: e.rect ? { ...e.rect } : null };
}

function rippleLayer(l: LayerClip, rs: readonly Removed[]): LayerClip {
  const start = moved(rs, l.start);
  return start === l.start ? l : { ...l, start };
}

function rippleCover(c: Cover | null, rs: readonly Removed[], total: number): Cover | null {
  if (c === null || !Number.isFinite(c.time)) return c;
  const time = Math.max(0, moved(rs, c.time, total));
  return time === c.time ? c : { ...c, time };
}

/** What is tied to the picture, after `removed` (project ranges of the ORIGINAL project, any order) is taken out; `total` is the new length. */
export function rippleTimed(p: Project, removed: readonly Removed[], total: number): Pick<Project, "overlays" | "effects" | "layers" | "cover"> {
  const rs = mergeRemoved(removed);
  if (rs.length === 0) return { overlays: p.overlays, effects: p.effects, layers: p.layers, cover: p.cover };
  return {
    overlays: each(p.overlays, (o) => rippleOverlay(o, rs, total)),
    effects: each(p.effects, (e) => rippleEffect(e, rs, total)),
    layers: each(p.layers, (l) => rippleLayer(l, rs)),
    cover: rippleCover(p.cover, rs, total),
  };
}
