import { SPEED_CURVES } from "../effects";
import { clampNum, SPEED_CURVE_LIMITS, SPEED_LIMITS, TRANSITION_LIMITS, type Clip, type LayerClip, type Project, type SpeedCurveId, type SpeedStep } from "./types";

// Speed arithmetic lives ONLY in this file. A clip either has one constant `speed` or a speed curve: constant-speed steps in SOURCE
// time (step i covers [steps[i].from, steps[i + 1].from); the first step also covers everything before it, the last everything after).
// Every function branches on the curve first, so a clip without one runs exactly the expressions it always has.

export type SpeedSpan = { from: number; to: number; speed: number };

/** The curve's steps, or null for a constant-speed clip (an empty step list counts as no curve). */
const stepsOf = (c: Clip): SpeedStep[] | null => (c.speedCurve && c.speedCurve.steps.length > 0 ? c.speedCurve.steps : null);

/** True when the clip plays on a speed curve — the one rule everything outside this file goes by (an empty step list is no curve). */
export const hasSpeedCurve = (c: Clip): boolean => stepsOf(c) !== null;

/** Eight equal slices of [trimStart, trimEnd] with the preset's speeds (clamped to SPEED_LIMITS). */
export function curveSteps(id: SpeedCurveId, trimStart: number, trimEnd: number): SpeedStep[] {
  const slice = (trimEnd - trimStart) / SPEED_CURVE_LIMITS.slices;
  return SPEED_CURVES[id].shape.slice(0, SPEED_CURVE_LIMITS.slices).map((speed, i) => ({ from: trimStart + i * slice, speed: clampNum(speed, SPEED_LIMITS[0], SPEED_LIMITS[1]) }));
}

/** Smooth ramps: every one of a preset's slices is cut into this many pieces (8 × 4 = 32 steps, under SPEED_CURVE_LIMITS.maxSteps). */
export const SMOOTH_PER_SLICE = 4;
const r4 = (v: number): number => Math.round(v * 1e4) / 1e4;
/**
 * A preset's speed at position `u` (0 … 1 along the clip) when it is smooth: each slice's speed sits at the slice's centre, a
 * straight line joins neighbouring centres, and before the first / after the last centre the edge speed holds. Total: a position
 * that is not a number counts as the start, and a shape without speeds plays at 1.
 */
export function smoothSpeedAt(shape: readonly number[], u: number): number {
  if (shape.length === 0) return 1;
  const last = shape.length - 1;
  const x = u * shape.length - 0.5;
  if (!(x > 0)) return shape[0];
  if (x >= last) return shape[last];
  const i = Math.floor(x);
  return shape[i] + (shape[i + 1] - shape[i]) * (x - i);
}
/**
 * The speeds of a preset's pieces in source order, clamped to SPEED_LIMITS: its eight slice speeds, or — smooth — 32, each the
 * smooth speed at its piece's centre (4 decimals). What a tile draws and what a pick stores are both this list.
 */
export function curveProfile(id: SpeedCurveId, smooth: boolean): number[] {
  const shape = SPEED_CURVES[id].shape.slice(0, SPEED_CURVE_LIMITS.slices).map((speed) => clampNum(speed, SPEED_LIMITS[0], SPEED_LIMITS[1]));
  if (!smooth) return shape;
  const pieces = shape.length * SMOOTH_PER_SLICE;
  return Array.from({ length: pieces }, (_, j) => r4(smoothSpeedAt(shape, (j + 0.5) / pieces)));
}
/**
 * The smooth form of a preset: equal pieces of [trimStart, trimEnd] with the speeds of `curveProfile(id, true)`. Like `curveSteps`
 * it does not judge the range: one too short (or empty, or not a number) is refused where the curve is stored (`presetCurve`, ops.ts).
 */
export function smoothCurveSteps(id: SpeedCurveId, trimStart: number, trimEnd: number): SpeedStep[] {
  const speeds = curveProfile(id, true);
  const piece = (trimEnd - trimStart) / speeds.length;
  return speeds.map((speed, j) => ({ from: trimStart + j * piece, speed }));
}
/** True when the clip's curve is a smooth ramp: it holds more steps than a stepped preset has (the app stores exactly 8 or exactly 32). */
export const isSmoothCurve = (c: Pick<Clip, "speedCurve">): boolean => !!c.speedCurve && c.speedCurve.steps.length > SPEED_CURVE_LIMITS.slices;

/**
 * The clip's source range cut into constant-speed spans in SOURCE order, covering exactly [trimStart, trimEnd]: one span for a
 * constant-speed clip. Zero-length spans are omitted — except that a clip with no length at all still gets its one (empty) span,
 * so there is always an edge speed to extend with.
 */
export function speedSpans(c: Clip): SpeedSpan[] {
  const steps = stepsOf(c);
  if (!steps) return [{ from: c.trimStart, to: c.trimEnd, speed: c.speed }];
  const spans: SpeedSpan[] = [];
  let atStart = steps[0].speed;   // the speed under trimStart, for the empty-clip case
  for (let i = 0; i < steps.length; i++) {
    const from = i === 0 ? c.trimStart : Math.max(steps[i].from, c.trimStart);
    const to = i === steps.length - 1 ? c.trimEnd : Math.min(steps[i + 1].from, c.trimEnd);
    if (steps[i].from <= c.trimStart) atStart = steps[i].speed;
    if (to > from) spans.push({ from, to, speed: steps[i].speed });
  }
  return spans.length > 0 ? spans : [{ from: c.trimStart, to: c.trimEnd, speed: atStart }];
}
/**
 * The slowest speed any stretch of the clip plays at inside its trim: its constant speed, or the lowest speed of its curve's spans.
 * Total: a speed that is not a number is not counted, and a clip without one that is plays at 1.
 */
export function slowestSpeed(c: Clip): number {
  let slowest = Infinity;
  for (const s of speedSpans(c)) if (Number.isFinite(s.speed) && s.speed < slowest) slowest = s.speed;
  return Number.isFinite(slowest) ? slowest : 1;
}
/** True when any stretch of a video plays below 1× (slow motion: where its frames are shown more than once). Never a photo. */
export const isSlowed = (c: Clip): boolean => c.kind !== "photo" && slowestSpeed(c) < 1 - 1e-9;

/** The most source seconds any clip's transition handle can be: half the longest transition at the highest speed. */
export const TRANSITION_HANDLE_MAX = (TRANSITION_LIMITS.max / 2) * SPEED_LIMITS[1];
/**
 * The most source seconds an export may read OUTSIDE the clip's trim for a transition: half the longest transition, before the trim
 * at the speed of the clip's first span (`head`) and after it at the speed of its last (`tail`) — ExportSession's `head` / `tail`
 * before they are clamped to the file. Total: a speed that is not a number counts as the highest, so the answer is never too small.
 */
export function transitionHandles(c: Clip): { head: number; tail: number } {
  const spans = speedSpans(c);
  const at = (speed: number): number => (TRANSITION_LIMITS.max / 2) * (Number.isFinite(speed) ? clampNum(speed, SPEED_LIMITS[0], SPEED_LIMITS[1]) : SPEED_LIMITS[1]);
  return { head: at(spans[0].speed), tail: at(spans[spans.length - 1].speed) };
}

/** A span as it is played: source runs from `a` to `b` (b < a when the clip is reversed). */
type Leg = { a: number; b: number; speed: number };
/** Spans in PLAYBACK order: source order, or back to front (each one mirrored) when `backwards`. */
function legs(c: Clip, backwards: boolean): Leg[] {
  const spans = speedSpans(c);
  return backwards ? spans.reverse().map((s) => ({ a: s.to, b: s.from, speed: s.speed })) : spans.map((s) => ({ a: s.from, b: s.to, speed: s.speed }));
}
const legSeconds = (l: Leg): number => Math.abs(l.b - l.a) / l.speed;
/** The leg playing at `offset` and the output offset where it starts. A boundary belongs to the later leg; offsets outside the clip get the first / last leg. */
function legAt(ls: Leg[], offset: number): { leg: Leg; start: number } {
  let start = 0;
  for (let i = 0; i < ls.length - 1; i++) {
    const end = start + legSeconds(ls[i]);
    if (offset < end) return { leg: ls[i], start };
    start = end;
  }
  return { leg: ls[ls.length - 1], start };
}
/** Source time at an output offset; outside the clip the first / last leg carries on at its own speed. */
function walkToSource(ls: Leg[], offset: number): number {
  const { leg, start } = legAt(ls, offset);
  return leg.a + (leg.b >= leg.a ? 1 : -1) * (offset - start) * leg.speed;
}
/** Inverse of `walkToSource`, with the same boundary rule and the same linear extensions. */
function walkToOutput(ls: Leg[], sourceTime: number): number {
  let start = 0;
  let leg = ls[ls.length - 1];
  for (let i = 0; i < ls.length - 1; i++) {
    const l = ls[i];
    if (l.b >= l.a ? sourceTime < l.b : sourceTime > l.b) { leg = l; break; }
    start += legSeconds(l);
  }
  return start + ((leg.b >= leg.a ? sourceTime - leg.a : leg.a - sourceTime)) / leg.speed;
}

/** Output seconds this clip occupies on the timeline: Σ (to − from) / speed over its spans. */
export const clipDuration = (c: Clip): number =>
  stepsOf(c) ? speedSpans(c).reduce((s, x) => s + (x.to - x.from) / x.speed, 0) : (c.trimEnd - c.trimStart) / c.speed;
/** Source-file seconds for an offset (output seconds) into the clip, playing forward. */
export const outputToSource = (c: Clip, offsetInClip: number): number =>
  stepsOf(c) ? walkToSource(legs(c, false), offsetInClip) : c.trimStart + offsetInClip * c.speed;
/** Source-file seconds shown at `offsetInClip`: mirrored inside the trim span when the clip is reversed. Also where a split cuts. */
export const freezeSourceTime = (c: Clip, offsetInClip: number): number => {
  if (stepsOf(c)) return walkToSource(legs(c, c.reversed), offsetInClip);
  return c.reversed ? c.trimEnd - offsetInClip * c.speed : outputToSource(c, offsetInClip);
};
/** Reversed-aware source time for an output offset — `freezeSourceTime` under the name motion code reads best with. */
export const sourceTimeAt = freezeSourceTime;
/** Inverse of `sourceTimeAt`: the output offset at which a source time shows (may fall outside [0, clipDuration]). */
export function outputOffsetOf(c: Clip, sourceTime: number): number {
  if (stepsOf(c)) return walkToOutput(legs(c, c.reversed), sourceTime);
  return (c.reversed ? c.trimEnd - sourceTime : sourceTime - c.trimStart) / c.speed;
}

/** Source spans of the two halves of a split at `offsetInClip`: `left` plays first in the output. Reversed clips play their span backwards. */
export function splitSourceRanges(c: Clip, offsetInClip: number): { left: [number, number]; right: [number, number] } {
  const cut = freezeSourceTime(c, offsetInClip);
  return c.reversed
    ? { left: [cut, c.trimEnd], right: [c.trimStart, cut] }
    : { left: [c.trimStart, cut], right: [cut, c.trimEnd] };
}
/** Output offset (seconds into the clip) for a source-file time, playing forward. */
export const sourceToOutput = (c: Clip, sourceTime: number): number =>
  stepsOf(c) ? walkToOutput(legs(c, false), sourceTime) : (sourceTime - c.trimStart) / c.speed;
/** Playback rate at an output offset (the speed of the span being shown): on a boundary the later span in playback order; outside the clip the first / last one. */
export function rateAt(c: Clip, offsetInClip: number): number {
  return stepsOf(c) ? legAt(legs(c, c.reversed), offsetInClip).leg.speed : c.speed;
}
/** Spans in PLAYBACK order as (source seconds, speed) — reversed clips list them back to front. For the export. */
export function playbackSpans(c: Clip): { duration: number; speed: number }[] {
  return legs(c, c.reversed).map((l) => ({ duration: Math.abs(l.b - l.a), speed: l.speed }));
}
/**
 * The source time `outputDelta` seconds of forward playback after `sourceTime` (before it when negative) — what a trim-handle drag
 * needs. It does not depend on the clip's trim: a curved clip is walked over its steps across the whole source, so a handle dragged
 * back out over a trimmed-off part meets the speeds that are really there.
 */
export function sourceAfter(c: Clip, sourceTime: number, outputDelta: number): number {
  if (!stepsOf(c)) return sourceTime + outputDelta * c.speed;
  const whole = legs({ ...c, trimStart: Math.min(0, c.trimStart), trimEnd: Math.max(c.sourceDuration, c.trimEnd) }, false);
  return walkToSource(whole, walkToOutput(whole, sourceTime) + outputDelta);
}
/** True when the source range [trimStart, trimEnd] of this clip would play for less than `minSeconds` (a trim to it is refused). */
export function spanTooShort(c: Clip, trimStart: number, trimEnd: number, minSeconds: number): boolean {
  if (!stepsOf(c)) return trimEnd - trimStart < minSeconds * c.speed - 1e-9;
  return clipDuration({ ...c, trimStart, trimEnd }) < minSeconds - 1e-9;
}
/** Source times at every `interval` output seconds from the clip's start, in source order (at most `max`): where thumbnails are taken. */
export function sourceSamples(c: Clip, interval: number, max: number): number[] {
  const out: number[] = [];
  if (!stepsOf(c)) {
    for (let t = c.trimStart; t < c.trimEnd - 1e-9 && out.length < max; t += interval * c.speed) out.push(t);
    return out;
  }
  const ls = legs(c, false);
  for (let k = 0; out.length < max; k++) {
    const t = walkToSource(ls, k * interval);
    if (!(t < c.trimEnd - 1e-9)) break;
    out.push(t);
  }
  return out;
}
export const totalDuration = (p: Project): number => p.clips.reduce((s, c) => s + clipDuration(c), 0);

export function clipStartTimes(p: Project): number[] {
  let t = 0;
  return p.clips.map((c) => { const s = t; t += clipDuration(c); return s; });
}

export type ClipHit = { clip: Clip; index: number; offsetInClip: number };

export function clipAt(p: Project, time: number): ClipHit | null {
  if (p.clips.length === 0) return null;
  const starts = clipStartTimes(p);
  const t = Math.max(0, time);
  const last = p.clips.length - 1;
  if (t >= totalDuration(p)) return { clip: p.clips[last], index: last, offsetInClip: clipDuration(p.clips[last]) };
  for (let i = last; i >= 0; i--) {
    if (t >= starts[i]) return { clip: p.clips[i], index: i, offsetInClip: t - starts[i] };
  }
  return { clip: p.clips[0], index: 0, offsetInClip: 0 };
}

/** The cover's project time as read: 0 without a cover, else the stored time clamped to the project as it is now. */
export function coverTimeOf(p: Project): number {
  if (!p.cover || !Number.isFinite(p.cover.time)) return 0;
  return Math.max(0, Math.min(p.cover.time, totalDuration(p)));
}
/** How far before the project's end the last frame is read (a thumbnail at exactly the end of a file can fail). */
export const LAST_FRAME_SLACK = 0.05;
/** The main clip and the SOURCE second shown at a project time (a photo: 0); null for an empty project. */
export function frameAt(p: Project, time: number): { clip: Clip; sourceTime: number } | null {
  const last = Math.max(0, totalDuration(p) - LAST_FRAME_SLACK);
  const hit = clipAt(p, Number.isFinite(time) ? Math.max(0, Math.min(time, last)) : 0);
  if (!hit) return null;
  return { clip: hit.clip, sourceTime: hit.clip.kind === "photo" ? 0 : sourceTimeAt(hit.clip, hit.offsetInClip) };
}

// ---- Layers: clips with their own place on the project timeline ----

/** Any clip or layer by id (main clips first; ids are unique across both). The one way to find "a clip by id". */
export function findItem(p: Project, id: string): { clip: Clip; layer: boolean } | null {
  const clip = p.clips.find((c) => c.id === id);
  if (clip) return { clip, layer: false };
  const layer = p.layers.find((l) => l.id === id);
  return layer ? { clip: layer, layer: true } : null;
}

/** Project time at which a layer ends: start + its output length (it may be past the project's end). */
export const layerEnd = (l: LayerClip): number => l.start + clipDuration(l);

/** How far (seconds) before the project's end its last frame is taken: at and past the end, layers are looked up at `total − this`. */
const LAST_FRAME_EPSILON = 1e-6;

/**
 * A layer is on screen from its start up to (not including) its end. At and past the project's end the project's LAST frame is
 * shown (as `clipAt` keeps showing the last main clip): a layer still running there stays on screen; its rest is never shown.
 */
const layerShowsAt = (l: LayerClip, time: number, total: number): boolean => {
  const t = time >= total ? total - LAST_FRAME_EPSILON : time;
  return l.start <= t && t < layerEnd(l);
};

/** The layers on screen at a project time, in draw order (list order: later = on top). */
export function layersAt(p: Project, time: number): LayerClip[] {
  const total = totalDuration(p);
  return p.layers.filter((l) => layerShowsAt(l, time, total));
}

/**
 * The item's local output offset at a project time, or null when it is not on screen then. A main clip: `clipAt`'s offset when the clip
 * under `time` is that clip (at and past the project's end that is the last clip, at its end). A layer: `time − start` while it shows
 * (at and past the project's end: the project's end − start, for a layer still running there).
 */
export function itemOffsetAt(p: Project, id: string, time: number): number | null {
  if (!Number.isFinite(time)) return null;
  const hit = clipAt(p, time);
  if (hit && hit.clip.id === id) return hit.offsetInClip;
  if (p.clips.some((c) => c.id === id)) return null;
  const layer = p.layers.find((l) => l.id === id);
  const total = totalDuration(p);
  return layer && layerShowsAt(layer, time, total) ? Math.min(time, total) - layer.start : null;
}

/** The transition window the playhead is inside (if any): which cut, and progress 0→1 across it, centred on the cut. */
export function transitionProgress(p: Project, playhead: number): { index: number; progress: number } | null {
  const starts = clipStartTimes(p);
  for (let i = 0; i < p.clips.length - 1; i++) {
    const t = p.clips[i].transitionOut;
    if (t.type === "none") continue;
    const cut = starts[i] + clipDuration(p.clips[i]);
    const a = cut - t.duration / 2;
    if (playhead >= a && playhead <= cut + t.duration / 2) return { index: i, progress: Math.round(((playhead - a) / t.duration) * 1000) / 1000 };
  }
  return null;
}

/** True when the playhead is inside the window of any transition (centred on its cut). */
export function isInTransitionWindow(p: Project, playhead: number): boolean {
  return transitionProgress(p, playhead) !== null;
}

export const timeToX = (t: number, pixelsPerSecond: number): number => t * pixelsPerSecond;
export const xToTime = (x: number, pixelsPerSecond: number): number => x / pixelsPerSecond;
