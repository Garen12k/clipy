import { nowIso } from "@/src/lib/clock";
import { trackEnd } from "./audioSync";
import { fitEffects, normaliseTransitions } from "./ops";
import { clipDuration, sourceAfter, totalDuration } from "./timeline";
import { clampBeatMarkers, isPhoto, type AudioTrack, type Clip, type Project } from "./types";

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
 * "Find beats": the markers inside the track's stretch of the timeline are replaced by the track's beats; markers before its start
 * or after its end (tapped by hand, or found for another track) stay. The result goes through the loader's own rule
 * (`clampBeatMarkers`: sorted, spaced, at most 300). Same project for an unknown track, a project with no length, or no change.
 */
export function placeBeats(p: Project, trackId: string, sourceBeats: readonly number[], every: number): Project {
  const track = p.audioTracks.find((t) => t.id === trackId);
  const total = totalDuration(p);
  if (!track || !(total > 0)) return p;
  const from = track.start, to = Math.min(trackEnd(track), total);
  const kept = p.beatMarkers.filter((m) => m < from - 1e-9 || m > to + 1e-9);
  const next = clampBeatMarkers([...kept, ...beatTimesFor(track, sourceBeats, every, total)]);
  if (next.length === p.beatMarkers.length && next.every((m, i) => m === p.beatMarkers[i])) return p;
  return { ...p, beatMarkers: next, updatedAt: nowIso() };
}

/** The latest marker in [lo, hi] (each end widened by `BEAT_CUT.reach`), or null. `markers` ascending. */
function latestMarker(markers: readonly number[], lo: number, hi: number): number | null {
  for (let i = markers.length - 1; i >= 0; i--) {
    if (markers[i] > hi + BEAT_CUT.reach) continue;
    return markers[i] >= lo - BEAT_CUT.reach ? markers[i] : null;
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
 * such marker, or one already ending on a marker, is left exactly as it is. Clips are only ever shortened, from the end they play
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

/** Why Cut to beats cannot do anything, or "ready". Checked in this order. */
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
