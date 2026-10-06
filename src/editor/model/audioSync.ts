import { HANDOFF_LEAD } from "@/src/editor/previewHandoff";
import type { AudioTrack } from "./types";

export const trackEnd = (t: AudioTrack): number => t.start + (t.trimEnd - t.trimStart);
/** Seconds into the source file that should be playing at `playhead`, or null when the track is silent there. */
export function songTimeAt(t: AudioTrack, playhead: number): number | null {
  if (playhead < t.start || playhead >= trackEnd(t)) return null;
  return t.trimStart + (playhead - t.start);
}

/**
 * How long before a track's start its preview player is started, silent, in seconds of playback: the video hand-over's lead (one
 * constant). A player's clock only starts moving a fraction of a second after `play()`; started cold at the track's start, the sound
 * began that much late and stayed late. Started this much early it is moving when the playhead gets there.
 */
export const AUDIO_LEAD = HANDOFF_LEAD;

/**
 * Where the playhead stands for a track's preview player: `inside` the track; in the `preroll` — playing, and at most AUDIO_LEAD
 * before the start of a track that has a length; `outside` otherwise (always, before the start, while paused).
 */
export type TrackPhase = "inside" | "preroll" | "outside";
export function trackPhaseAt(t: AudioTrack, playhead: number, playing: boolean): TrackPhase {
  if (songTimeAt(t, playhead) !== null) return "inside";
  if (playing && trackEnd(t) > t.start && playhead < t.start && t.start - playhead <= AUDIO_LEAD) return "preroll";
  return "outside";
}

/** The start a player was started early for: the track's start and the place in its file, as they were then. */
export type RolledFor = { start: number; trimStart: number };
/**
 * What a track's player is doing, as the component remembers it: `started` — play() was called for the playhead's stay inside the
 * track; `rolling` — play() was called early, before the start it names, and the player is (silently) on its way there.
 */
export type PlayerRun = { started: boolean; rolling: RolledFor | null };
/** What to do with the player for one playhead / edit, in this order: pause, then start or park or check the drift. */
export type SyncStep = {
  /** Pause it first: it was playing (or rolling) and that is over. */
  pause: boolean;
  /** Seek to this source time and call play() — once per start. */
  start: number | null;
  /** Paused inside the track: stand at this source time (the component seeks once per target). */
  park: number | null;
  /** Playing inside the track: the source time the player should be at (the component re-seeks beyond its tolerance). */
  drift: number | null;
  next: PlayerRun;
};

const IDLE: PlayerRun = { started: false, rolling: null };

/**
 * The one decision for a track's preview player. Inside the track while playing it is started with a seek (as ever) — unless it is
 * already rolling for exactly this start: then nothing is written, it simply is the track's player from here on. In the preroll it
 * is started once, from the track's first sample (`trimStart`): never from earlier in the file, so nothing from before the trim is
 * ever played, and by the start it has been running for at most AUDIO_LEAD less its own start-up time. Whenever the start it rolls
 * for is not coming (a pause, a seek away or into the middle of the track, the track moved or re-trimmed at its start) it is paused,
 * and whatever follows is an ordinary start with a seek of its own.
 */
export function audioSyncStep(t: AudioTrack, playhead: number, playing: boolean, run: PlayerRun): SyncStep {
  const phase = trackPhaseAt(t, playhead, playing);
  const at = songTimeAt(t, playhead);
  const rollsForThis = run.rolling !== null && run.rolling.start === t.start && run.rolling.trimStart === t.trimStart;
  if (phase === "inside" && playing && at !== null) {
    if (run.started) return { pause: false, start: null, park: null, drift: at, next: run };
    // Rolling for this start and the playhead has just crossed it: the hand-over. (A playhead further in is a seek: start over.)
    if (rollsForThis && playhead - t.start <= AUDIO_LEAD) return { pause: false, start: null, park: null, drift: at, next: { started: true, rolling: null } };
    return { pause: run.rolling !== null, start: at, park: null, drift: null, next: { started: true, rolling: null } };
  }
  if (phase === "preroll") {
    if (!run.started && rollsForThis) return { pause: false, start: null, park: null, drift: null, next: run };
    return { pause: run.started || run.rolling !== null, start: t.trimStart, park: null, drift: null, next: { started: false, rolling: { start: t.start, trimStart: t.trimStart } } };
  }
  // Outside the track, or paused: stop what was going; paused inside the track, stand at the playhead.
  return { pause: run.started || run.rolling !== null, start: null, park: at, drift: null, next: IDLE };
}
