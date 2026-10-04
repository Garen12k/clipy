import { DUCKING, isPhoto, type AudioTrack, type Clip, type Project } from "./types";
import { trackEnd } from "./audioSync";
import { clipDuration } from "./timeline";

/**
 * Every audio gain in the app: fades, ducking, and the gain curves the export plays (spec section 3).
 * Mirrored by AudioMix.swift (constants, `fitFades`, `fadeEnvelope`, `voiceIntervals`, `duckFactorAt`): keep them identical. The curves
 * are built here only — the export request carries them and Swift just draws ramps. Pure maths — no React, no store.
 * Track times are project seconds; clip times are clip-local OUTPUT seconds. Volumes above 1 are kept (the export can
 * boost; the preview caps at 1 elsewhere).
 */
export interface GainPoint { time: number; gain: number }

/**
 * Where a fade overlaps a duck ramp the gain is a product of two lines (a parabola), so the curve gets extra breakpoints there:
 * at most CURVE_STEP apart, never closer than CURVE_MIN_STEP, at most CURVE_MAX_POINTS per overlap, spaced so the curve stays
 * within CURVE_TOLERANCE of the true gain (see `overlapStep`).
 */
export const CURVE_STEP = 0.05;
export const CURVE_MIN_STEP = 0.005;
export const CURVE_MAX_POINTS = 400;
export const CURVE_TOLERANCE = 0.01;
/** Curve times are rounded to this many decimals (and de-duplicated); gains are not rounded. */
export const CURVE_DECIMALS = 4;
/** Slack for deciding whether a time is inside a track: `start + length − start` is not always `length` in floating point. */
const EDGE_EPSILON = 1e-9;

const finitePositive = (v: number): number => (Number.isFinite(v) && v > 0 ? v : 0);
const roundTime = (v: number): number => { const k = 10 ** CURVE_DECIMALS; return Math.round(v * k) / k; };

/**
 * Spacing of the extra breakpoints where a fade of `fade` (fitted) seconds overlaps a duck ramp, for a track at `volume`.
 * There the gain is volume × (x / fade) × (level + (1 − level) × y / ramp): a parabola with second derivative 2a,
 * a = volume × (1 − level) / (fade × ramp). A straight line across a step h is off by at most a × h² / 4, so
 * h = sqrt(4 × tolerance × fade × ramp / ((1 − level) × volume)) keeps it within the tolerance. Below the CURVE_MIN_STEP floor
 * the overlap itself (never longer than the fade) is the step, and a × fade² / 4 is still under the tolerance for volume ≤ 2.
 * CURVE_STEP_SAFETY shortens the step a little because the extra points are then moved onto the 4-decimal time grid.
 */
export const CURVE_STEP_SAFETY = 0.9;
function overlapStep(volume: number, fade: number): number {
  const exact = Math.sqrt((4 * CURVE_TOLERANCE * fade * DUCKING.ramp) / ((1 - DUCKING.level) * Math.max(volume, 1e-6)));
  return Math.max(CURVE_MIN_STEP, Math.min(CURVE_STEP, CURVE_STEP_SAFETY * exact));
}

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

/**
 * Intervals of project time during which any voice track is audible: `[start, trackEnd]` each, merged when they touch or overlap,
 * sorted. A voice at volume 0 (or a broken volume) is not audible and is left out.
 */
export function voiceIntervals(tracks: AudioTrack[]): [number, number][] {
  const spans: [number, number][] = [];
  for (const t of tracks) {
    if (t.kind !== "voice" || finitePositive(t.volume) === 0) continue;
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

/**
 * The gain on the closed span `[start, end]`, the local time clamped into `[0, length]` (`end − start` can be a hair above
 * `length` in floating point): at the very end this is the limit from inside, which the curve's last breakpoint uses.
 */
function trackGainInside(t: AudioTrack, intervals: [number, number][] | null, time: number): number {
  const length = trackLength(t);
  const local = Math.min(Math.max(time - t.start, 0), length);
  return finitePositive(t.volume) * fadeEnvelope(local, length, t.fadeIn, t.fadeOut) * (intervals ? duckFactorAt(intervals, time) : 1);
}

/**
 * A track's total gain at a project time: volume × fade envelope × (ducking factor for music when the project ducks).
 * 0 outside `[start, end)` — exactly at the end the track is over — and for a non-finite time. "Outside" is decided on the
 * local time with EDGE_EPSILON of slack, so a time at the start is never lost to rounding and the end is always over.
 */
export function trackGainAt(p: Project, t: AudioTrack, time: number): number {
  if (!Number.isFinite(time) || !Number.isFinite(t.start)) return 0;
  const local = time - t.start;
  if (local < -EDGE_EPSILON || local >= trackLength(t) - EDGE_EPSILON) return 0;
  return trackGainInside(t, isDucked(p, t) ? voiceIntervals(p.audioTracks) : null, time);
}

/**
 * The gain a track's preview player rests at while the playhead is outside the track (the player is paused there): the track's
 * own volume — what an un-faded track plays at everywhere, so such a track's volume is written once. Never negative; 0 when broken.
 */
export function restGain(t: AudioTrack): number {
  return finitePositive(t.volume);
}

/** A clip's own-sound gain at an output offset: (muted ? 0 : volume) × fade envelope. Photos are silent. */
export function clipGainAt(c: Clip, offsetInClip: number): number {
  if (c.muted || isPhoto(c)) return 0;
  return finitePositive(c.volume) * fadeEnvelope(offsetInClip, clipDuration(c), c.fadeIn, c.fadeOut);
}

/**
 * Sorted (time, gain) points from raw times: gains are taken at the raw time, times are rounded. Of points that round to the
 * same time the first is kept — except at the very start, where the LATER gain wins (a fade-in too short to survive the
 * rounding must not turn into a ramp up to the next breakpoint; the mirror case at the end keeps the earlier gain).
 */
function curveFrom(times: number[], gainAt: (time: number) => number): GainPoint[] {
  const out: GainPoint[] = [];
  for (const raw of [...times].sort((a, b) => a - b)) {
    const time = roundTime(raw);
    if (out.length > 0 && out[out.length - 1].time === time) {
      if (out.length === 1) out[0].gain = gainAt(raw);
      continue;
    }
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
 * breakpoints every `overlapStep` seconds (0.05 s at most, finer for short or loud fades) keep the curve within
 * CURVE_TOLERANCE (0.01) of `trackGainAt` for any volume up to 2 and any fade. An empty curve for a track with no length.
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
    const volume = finitePositive(t.volume);
    const fadeSpans: { from: number; to: number; step: number }[] = [
      { from: start, to: start + fades.in, step: overlapStep(volume, fades.in) },
      { from: end - fades.out, to: end, step: overlapStep(volume, fades.out) }];
    intervals.forEach(([from, to], i) => {
      const rampSpans: [number, number][] = [[from - DUCKING.ramp, from], [to, to + DUCKING.ramp]];
      times.push(rampSpans[0][0], from, to, rampSpans[1][1]);
      const next = i + 1 < intervals.length ? intervals[i + 1] : null;
      if (next && next[0] - to < 2 * DUCKING.ramp) times.push((to + next[0]) / 2);
      for (const ramp of rampSpans) {
        for (const fade of fadeSpans) {
          const lo = Math.max(ramp[0], fade.from);
          const hi = Math.min(ramp[1], fade.to);
          // these are samples of a smooth stretch, not kinks: put them on the time grid so their gains are exact where they are played
          for (let k = 1; k <= CURVE_MAX_POINTS && lo + k * fade.step < hi - EDGE_EPSILON; k++) times.push(roundTime(lo + k * fade.step));
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

/**
 * The export's safety fade for music that is still playing when the video ends: over the last `seconds` (or the whole kept part
 * when that is shorter). A track counts as playing to the end when it ends no more than `slack` seconds before the video does.
 */
export const END_FADE = { seconds: 1, slack: 0.01 };

/**
 * A piecewise-linear curve read at `time`: exact on a breakpoint, a straight line between two, the first / last gain outside.
 * 0 for an empty curve or a non-finite time.
 */
export function gainOnCurve(curve: GainPoint[], time: number): number {
  if (curve.length === 0 || !Number.isFinite(time)) return 0;
  if (time <= curve[0].time) return curve[0].gain;
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1];
    const b = curve[i];
    if (time === b.time) return b.gain;
    if (time < b.time) return a.gain + (b.gain - a.gain) * ((time - a.time) / (b.time - a.time));
  }
  return curve[curve.length - 1].gain;
}

/**
 * The part of a curve inside `[from, to]`: its breakpoints there, unchanged, plus an interpolated breakpoint at each cut (on the
 * time grid). Empty when nothing of the curve is inside, or what is left has no length on the time grid.
 */
export function cutCurve(curve: GainPoint[], from: number, to: number): GainPoint[] {
  if (curve.length === 0 || !Number.isFinite(from) || !Number.isFinite(to)) return [];
  const lo = Math.max(from, curve[0].time);
  const hi = Math.min(to, curve[curve.length - 1].time);
  if (!(hi > lo)) return [];
  const inside = curve.map((b) => b.time).filter((time) => time > lo && time < hi);
  const out = curveFrom([lo, ...inside, hi], (time) => gainOnCurve(curve, time));
  return out.length < 2 ? [] : out;
}

/**
 * The curve with its last `seconds` before `endTime` multiplied by a linear ramp from 1 down to 0 (never longer than the curve
 * before `endTime`). The result is piecewise linear again: a breakpoint where the ramp starts and one at `endTime`; where the
 * curve itself slopes inside the ramp the product is a parabola (second derivative 2 × slope / seconds), so that stretch gets
 * extra breakpoints, spaced like `overlapStep`, to stay within CURVE_TOLERANCE. A broken `endTime` / `seconds`, no fade, or a
 * curve of fewer than two points → the curve as it is.
 */
export function withEndFade(curve: GainPoint[], endTime: number, seconds: number): GainPoint[] {
  if (curve.length < 2 || !Number.isFinite(endTime)) return curve;
  const length = Math.min(finitePositive(seconds), endTime - curve[0].time);
  if (!(length > 0)) return curve;
  const from = endTime - length;
  const factor = (time: number): number => (time <= from ? 1 : time >= endTime ? 0 : (endTime - time) / length);
  const marks = [...new Set([...curve.map((b) => b.time), from, endTime])].sort((a, b) => a - b);
  const times = [...marks];
  for (let i = 1; i < marks.length; i++) {
    const lo = marks[i - 1];
    const hi = marks[i];
    if (lo < from || hi > endTime) continue;
    const slope = Math.abs((gainOnCurve(curve, hi) - gainOnCurve(curve, lo)) / (hi - lo));
    if (!(slope > 0)) continue;
    const step = Math.max(CURVE_MIN_STEP, Math.min(CURVE_STEP, CURVE_STEP_SAFETY * Math.sqrt((4 * CURVE_TOLERANCE * length) / slope)));
    for (let k = 1; k <= CURVE_MAX_POINTS && lo + k * step < hi - EDGE_EPSILON; k++) times.push(roundTime(lo + k * step));
  }
  return curveFrom(times, (time) => gainOnCurve(curve, time) * factor(time));
}

/**
 * The gain curve the export plays for a track in a video `total` seconds long (composition seconds): `trackGainCurve` cut to
 * `[0, total]`; empty when nothing of the track is inside. Music that is still playing when the video ends (END_FADE.slack)
 * and is not silent there gets the END_FADE safety fade, so it never stops dead — whether or not it has a fade-out of its own
 * (a fade-out the video never reaches does nothing; one the video cuts through is multiplied by the safety fade).
 */
export function exportTrackCurve(p: Project, t: AudioTrack, total: number): GainPoint[] {
  const cut = cutCurve(trackGainCurve(p, t), 0, total);
  if (cut.length < 2) return [];
  const last = cut[cut.length - 1];
  const playsToTheEnd = t.kind === "music" && trackEnd(t) >= total - END_FADE.slack;
  if (!playsToTheEnd || !(last.gain > 0)) return cut;
  return withEndFade(cut, last.time, END_FADE.seconds);
}
