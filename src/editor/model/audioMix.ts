import { DUCKING, isPhoto, type AudioTrack, type Clip, type Project } from "./types";
import { trackEnd } from "./audioSync";
import { clipDuration } from "./timeline";

/**
 * Every audio gain in the app: fades, ducking, and the gain curves the export plays (spec section 3).
 * Mirrored by AudioMix.swift: keep constants and formulas identical. Pure maths — no React, no store.
 * Track times are project seconds; clip times are clip-local OUTPUT seconds. Volumes above 1 are kept (the export can
 * boost; the preview caps at 1 elsewhere).
 */
export interface GainPoint { time: number; gain: number }

/** Where a fade overlaps a duck ramp the gain is a product of two lines (a parabola): the curve gets a breakpoint this often there. */
export const CURVE_STEP = 0.05;
/** Curve times are rounded to this many decimals (and de-duplicated); gains are not rounded. */
export const CURVE_DECIMALS = 4;

const finitePositive = (v: number): number => (Number.isFinite(v) && v > 0 ? v : 0);
const roundTime = (v: number): number => { const k = 10 ** CURVE_DECIMALS; return Math.round(v * k) / k; };

/** Scaled fades so fadeIn + fadeOut ≤ length: negative / non-finite → 0; both shrink by `length / (in + out)` when they do not fit. */
export function fitFades(fadeIn: number, fadeOut: number, length: number): { in: number; out: number } {
  const a = finitePositive(fadeIn);
  const b = finitePositive(fadeOut);
  const len = finitePositive(length);
  if (len === 0) return { in: 0, out: 0 };
  if (a + b <= len) return { in: a, out: b };
  const k = len / (a + b);
  return { in: a * k, out: b * k };
}

/**
 * 0…1 fade envelope at `local` seconds into something `length` seconds long: `min(1, local / in, (length − local) / out)`
 * with fitted fades, zero-length fades ignored. 0 outside `[0, length]`, for no length and for non-finite `local` / `length`.
 */
export function fadeEnvelope(local: number, length: number, fadeIn: number, fadeOut: number): number {
  if (!Number.isFinite(local) || !Number.isFinite(length) || !(length > 0)) return 0;
  if (local < 0 || local > length) return 0;
  const f = fitFades(fadeIn, fadeOut, length);
  const up = f.in > 0 ? local / f.in : 1;
  const down = f.out > 0 ? (length - local) / f.out : 1;
  return Math.min(1, up, down);
}

/** Intervals of project time during which any voice track is audible: `[start, trackEnd]` each, merged when they touch or overlap, sorted. */
export function voiceIntervals(tracks: AudioTrack[]): [number, number][] {
  const spans: [number, number][] = [];
  for (const t of tracks) {
    if (t.kind !== "voice") continue;
    const end = trackEnd(t);
    if (Number.isFinite(t.start) && Number.isFinite(end) && end > t.start) spans.push([t.start, end]);
  }
  spans.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const s of spans) {
    const last = merged.length > 0 ? merged[merged.length - 1] : null;
    if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]);
    else merged.push([s[0], s[1]]);
  }
  return merged;
}

/** One interval's factor: `level` inside, a linear ramp of `ramp` seconds before its start and after its end, 1 beyond. */
function duckFactorOf(start: number, end: number, time: number): number {
  const distance = time < start ? start - time : time > end ? time - end : 0;
  if (distance >= DUCKING.ramp) return 1;
  return Math.min(1, DUCKING.level + (1 - DUCKING.level) * (distance / DUCKING.ramp));
}

/**
 * Music gain factor from ducking at a project time: 1 outside, DUCKING.level inside, linear ramps of DUCKING.ramp before / after
 * each interval (ramps sit OUTSIDE the interval; overlapping ramps take the lower value). A non-finite time → 1.
 */
export function duckFactorAt(intervals: [number, number][], time: number): number {
  if (!Number.isFinite(time)) return 1;
  let factor = 1;
  for (const [start, end] of intervals) factor = Math.min(factor, duckFactorOf(start, end, time));
  return factor;
}

const isDucked = (p: Project, t: AudioTrack): boolean => p.ducking && t.kind === "music";
const trackLength = (t: AudioTrack): number => finitePositive(t.trimEnd - t.trimStart);

/** The gain on the closed span `[start, end]`: at the very end this is the limit from inside, which the curve's last breakpoint uses. */
function trackGainInside(t: AudioTrack, intervals: [number, number][] | null, time: number): number {
  const fade = fadeEnvelope(time - t.start, trackLength(t), t.fadeIn, t.fadeOut);
  return finitePositive(t.volume) * fade * (intervals ? duckFactorAt(intervals, time) : 1);
}

/**
 * A track's total gain at a project time: volume × fade envelope × (ducking factor for music when the project ducks).
 * 0 outside `[start, end)` — exactly at the end the track is over — and for a non-finite time.
 */
export function trackGainAt(p: Project, t: AudioTrack, time: number): number {
  if (!Number.isFinite(time) || !Number.isFinite(t.start)) return 0;
  if (time < t.start || time >= t.start + trackLength(t)) return 0;
  return trackGainInside(t, isDucked(p, t) ? voiceIntervals(p.audioTracks) : null, time);
}

/** A clip's own-sound gain at an output offset: (muted ? 0 : volume) × fade envelope. Photos are silent. */
export function clipGainAt(c: Clip, offsetInClip: number): number {
  if (c.muted || isPhoto(c)) return 0;
  return finitePositive(c.volume) * fadeEnvelope(offsetInClip, clipDuration(c), c.fadeIn, c.fadeOut);
}

/** Sorted (time, gain) points from raw times: gains are taken at the raw time, times are rounded, the first of equal times is kept. */
function curveFrom(times: number[], gainAt: (time: number) => number): GainPoint[] {
  const out: GainPoint[] = [];
  for (const raw of [...times].sort((a, b) => a - b)) {
    const time = roundTime(raw);
    if (out.length > 0 && out[out.length - 1].time === time) continue;
    out.push({ time, gain: gainAt(raw) });
  }
  return out;
}

/**
 * Piecewise-linear gain curve for the export, in project seconds, from the track's start to its end.
 * Breakpoints: the start, the end of the fade-in, the start of the fade-out, the end (its gain is the limit from inside:
 * 0 after a fade-out, the plateau otherwise) and, for ducked music, every ramp boundary strictly inside the track plus the
 * time two neighbouring ramps cross (the lower of two lines has a kink there). Between breakpoints the true gain is linear,
 * so the curve equals `trackGainAt` — except where a fade overlaps a duck ramp: that product is a parabola, and extra
 * breakpoints every CURVE_STEP seconds keep the curve within 0.01 of `trackGainAt` (at volume 1 with a fade of 0.15 s or
 * longer; the worst case, for shorter fades, is 0.03 × volume). An empty curve for a track with no length.
 */
export function trackGainCurve(p: Project, t: AudioTrack): GainPoint[] {
  const length = trackLength(t);
  if (length === 0 || !Number.isFinite(t.start)) return [];
  const start = t.start;
  const end = start + length;
  const fades = fitFades(t.fadeIn, t.fadeOut, length);
  const intervals = isDucked(p, t) ? voiceIntervals(p.audioTracks) : null;
  const times = [start, start + fades.in, end - fades.out, end];
  if (intervals) {
    const fadeSpans: [number, number][] = [[start, start + fades.in], [end - fades.out, end]];
    intervals.forEach(([from, to], i) => {
      const rampSpans: [number, number][] = [[from - DUCKING.ramp, from], [to, to + DUCKING.ramp]];
      times.push(rampSpans[0][0], from, to, rampSpans[1][1]);
      const next = i + 1 < intervals.length ? intervals[i + 1] : null;
      if (next && next[0] - to < 2 * DUCKING.ramp) times.push((to + next[0]) / 2);
      for (const ramp of rampSpans) {
        for (const fade of fadeSpans) {
          const lo = Math.max(ramp[0], fade[0]);
          const hi = Math.min(ramp[1], fade[1]);
          for (let k = 1; lo + k * CURVE_STEP < hi - 1e-9; k++) times.push(lo + k * CURVE_STEP);
        }
      }
    });
  }
  return curveFrom(times.filter((x) => x >= start && x <= end), (time) => trackGainInside(t, intervals, time));
}

/**
 * A clip's own-sound gain curve in clip-local output seconds over `[0, clipDuration]`: start, end of the fade-in, start of the
 * fade-out, end. A muted clip or a photo is flat 0. An empty curve for a clip with no length.
 */
export function clipGainCurve(c: Clip): GainPoint[] {
  const length = finitePositive(clipDuration(c));
  if (length === 0) return [];
  if (c.muted || isPhoto(c)) return [{ time: 0, gain: 0 }, { time: roundTime(length), gain: 0 }];
  const fades = fitFades(c.fadeIn, c.fadeOut, length);
  return curveFrom([0, fades.in, length - fades.out, length], (time) => clipGainAt(c, time));
}
