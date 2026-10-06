import { nowIso } from "@/src/lib/clock";
import { trackEnd } from "./audioSync";
import { fitEffects, normaliseTransitions } from "./ops";
import { clipDuration, sourceAfter, totalDuration } from "./timeline";
import { BEAT_LIMITS, clampBeatMarkers, isPhoto, type AudioTrack, type Clip, type Project } from "./types";

// Auto beat cut. Two ops, both called only from a tap (or a drag of the Fewer / More slider): `placeBeats` writes beat markers
// from a music track's known beats, `cutToBeats` shortens main clips so their cuts land on markers. Markers are plain project
// seconds: nothing here follows a track that is moved, trimmed or split afterwards. No speed arithmetic (timeline.ts gives the
// lengths and the source times).

/** The Fewer / More slider's three stops, left to right: every 4th beat, every 2nd, every beat. */
export const BEAT_EVERY = [4, 2, 1] as const;
export type BeatDensity = 0 | 1 | 2;
export const DEFAULT_BEAT_DENSITY: BeatDensity = 1;
/** `minClip`: Cut to beats never leaves a clip shorter than this (seconds). `reach`: a cut this close to a marker is on it. */
export const BEAT_CUT = { minClip: 0.5, reach: 0.001 } as const;

const r3 = (v: number): number => Math.round(v * 1000) / 1000;

/**
 * Where a track's beats fall on the project timeline. `sourceBeats` are seconds into the track's FILE, ascending; every `every`-th
 * one counts, counted from the file's first beat (so trimming the track does not change which beats are kept). Only beats the
 * track really plays (`trimStart` <= beat < `trimEnd`) and that fall inside the project (0 ... `total`) are returned, to the
 * millisecond.
 */
export function beatTimesFor(track: AudioTrack, sourceBeats: readonly number[], every: number, total: number): number[] {
  const step = Number.isInteger(every) && every >= 1 ? every : 1;
  const out: number[] = [];
  sourceBeats.forEach((b, i) => {
    if (i % step !== 0 || !Number.isFinite(b) || b < track.trimStart - 1e-9 || b >= track.trimEnd - 1e-9) return;
    const t = r3(track.start + (b - track.trimStart));
    if (t >= 0 && t <= total + 1e-9) out.push(t);
  });
  return out;
}

/**
 * What a Find would write: `kept` = the markers outside the track's stretch of the timeline (ALL of them stay), `fresh` = the beats
 * that go in beside them, `leftOut` = the beats that do not fit under `BEAT_LIMITS.max`. The limit is taken from the NEW beats only,
 * from the end of the stretch: the beats are placed from its start, in order, while there is room. A beat closer than
 * `BEAT_LIMITS.minGap` to a kept marker or to the beat before it is one marker with it (dropped, and not counted as left out).
 * null for an unknown track or a project with no length.
 */
function beatPlan(p: Project, trackId: string, sourceBeats: readonly number[], every: number): { kept: number[]; fresh: number[]; leftOut: number } | null {
  const track = p.audioTracks.find((t) => t.id === trackId);
  const total = totalDuration(p);
  if (!track || !(total > 0)) return null;
  const from = track.start, to = Math.min(trackEnd(track), total);
  const kept = p.beatMarkers.filter((m) => m < from - 1e-9 || m > to + 1e-9);
  const gap = BEAT_LIMITS.minGap - 1e-9;
  const spaced: number[] = [];
  for (const t of beatTimesFor(track, sourceBeats, every, total).sort((a, b) => a - b)) {
    if (spaced.length > 0 && t - spaced[spaced.length - 1] < gap) continue;
    if (kept.some((m) => Math.abs(m - t) < gap)) continue;
    spaced.push(t);
  }
  const fresh = spaced.slice(0, Math.max(0, BEAT_LIMITS.max - kept.length));
  return { kept, fresh, leftOut: spaced.length - fresh.length };
}

/**
 * "Find beats": the markers inside the track's stretch of the timeline are replaced by the track's beats; markers before its start
 * or after its end (tapped by hand, or found for another track) ALL stay — when the project would hold more than `BEAT_LIMITS.max`
 * markers, it is the track's later beats that are not placed (`beatsLeftOut` says how many). The result goes through the loader's
 * own rule (`clampBeatMarkers`: sorted, spaced, at most 300). Same project for an unknown track, a project with no length, or no change.
 */
export function placeBeats(p: Project, trackId: string, sourceBeats: readonly number[], every: number): Project {
  const plan = beatPlan(p, trackId, sourceBeats, every);
  if (!plan) return p;
  const next = clampBeatMarkers([...plan.kept, ...plan.fresh]);
  if (next.length === p.beatMarkers.length && next.every((m, i) => m === p.beatMarkers[i])) return p;
  return { ...p, beatMarkers: next, updatedAt: nowIso() };
}

/**
 * How many of the track's beats `placeBeats(p, trackId, sourceBeats, every)` does NOT place because the project is at its
 * `BEAT_LIMITS.max` markers: 0 when they all fit (and for an unknown track or a project with no length). The same number before and
 * after that Find, so the panel may ask either way.
 */
export function beatsLeftOut(p: Project, trackId: string, sourceBeats: readonly number[], every: number): number {
  return beatPlan(p, trackId, sourceBeats, every)?.leftOut ?? 0;
}

/**
 * The latest marker in [lo, hi], or null. `markers` ascending. Only the HIGH end is widened by `BEAT_CUT.reach` (a cut that close to
 * a marker is on it); the low end is exact — a marker must leave the clip at least the minimum, or a photo cut to 0.499 s would be
 * stretched back to 0.5 s by the loader. (The 1e-9 only forgives the binary dust of adding the clips before it up.)
 */
function latestMarker(markers: readonly number[], lo: number, hi: number): number | null {
  for (let i = markers.length - 1; i >= 0; i--) {
    if (markers[i] > hi + BEAT_CUT.reach) continue;
    return markers[i] >= lo - 1e-9 ? markers[i] : null;
  }
  return null;
}

/** `c` playing for `length` seconds, shortened at the end it plays last: a photo's length; a video's source tail (its head when reversed). */
function shortened(c: Clip, length: number): Clip {
  if (isPhoto(c)) return { ...c, trimStart: 0, trimEnd: r3(length) };
  if (c.reversed) return { ...c, trimStart: sourceAfter(c, c.trimEnd, -length) };
  return { ...c, trimEnd: sourceAfter(c, c.trimStart, length) };
}

/**
 * "Cut to beats": walks the main clips in order. Each clip that has a cut after it (every clip but the last; the last too with
 * `lastToo`) ends on the LATEST marker that keeps it at least `BEAT_CUT.minClip` long and no longer than it is now. A clip with no
 * such marker (a marker that would leave it even a millisecond under the minimum is not one), or one already ending on a marker, is
 * left exactly as it is. Clips are only ever shortened, from the end they play
 * last; none is removed, reordered or lengthened. The next clip then starts where this one really ends.
 * Like a trim by hand: transitions are re-capped (`normaliseTransitions`), effects stranded past the new end are dropped
 * (`fitEffects`), and nothing else moves — text, stickers, layers, sounds and the markers stay at their project times.
 * Same project (no undo step) when no clip changes.
 */
export function cutToBeats(p: Project, lastToo = false): Project {
  if (p.beatMarkers.length === 0 || p.clips.length === 0) return p;
  let t = 0;
  let changed = false;
  const clips = p.clips.map((c, i) => {
    const d = clipDuration(c);
    let next = c;
    if (i < p.clips.length - 1 || lastToo) {
      const m = latestMarker(p.beatMarkers, t + BEAT_CUT.minClip, t + d);
      if (m !== null && t + d - m > BEAT_CUT.reach) next = shortened(c, m - t);
    }
    if (next !== c) changed = true;
    t += clipDuration(next);
    return next;
  });
  if (!changed) return p;
  const fixed = normaliseTransitions(clips);
  const total = fixed.reduce((s, c) => s + clipDuration(c), 0);
  return { ...p, clips: fixed, effects: fitEffects(p.effects, total), updatedAt: nowIso() };
}

/**
 * Whether Cut to beats is available (spec 5.5), checked in this order: it needs beat markers ("noMarkers"), and it needs at least two
 * clips ("oneClip" — the last clip is never cut, so one clip has no cut to move). "ready" says the button is on, not that a tap will
 * change anything (`cutToBeats` returns the same project when every cut is on a beat already).
 */
export type BeatCutState = "noMarkers" | "oneClip" | "ready";
export function beatCutState(p: Project): BeatCutState {
  if (p.beatMarkers.length === 0) return "noMarkers";
  return p.clips.length < 2 ? "oneClip" : "ready";
}

/** The music track Find beats listens to: the selected track when it is music, else the music track that starts first (list order on a tie); null without one. */
export function beatTrack(p: Project, selectedAudioId: string | null): AudioTrack | null {
  const selected = selectedAudioId ? p.audioTracks.find((t) => t.id === selectedAudioId) : undefined;
  if (selected && selected.kind === "music") return selected;
  let best: AudioTrack | null = null;
  for (const t of p.audioTracks) if (t.kind === "music" && (best === null || t.start < best.start)) best = t;
  return best;
}
