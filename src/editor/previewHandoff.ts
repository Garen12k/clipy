import { clipDuration, outputToSource, type ClipHit } from "@/src/editor/model/timeline";
import { isPhoto, type Clip, type Project } from "@/src/editor/model/types";
import { EPSILON } from "@/src/editor/usePreviewSync";

/**
 * The preview keeps two video players: the ACTIVE one drives the picture, the sound and the playhead; the STANDBY one holds the
 * next clip's file, paused and silent at that clip's first frame, so a cut between two files needs no reload. Just before the cut
 * the standby player is started (still silent), so it is already moving when it takes over. These are the decisions of that scheme,
 * free of React and of the players themselves.
 */

/**
 * How long before a cut the standby player is started, in seconds of output (playback) time. Measured on an iPhone: a ready, seeked,
 * paused AVPlayer needs 210–270 ms after `play()` before its clock moves, so a player started at the cut freezes the picture for that
 * long. Started this much earlier, it gets going about when the cut arrives.
 */
export const HANDOFF_LEAD = 0.22;

/** The clip the standby player should hold, and the source time of its first frame. */
export type PreloadTarget = { clip: Clip; index: number; sourceTime: number };

/**
 * What to preload while the clip at `currentIndex` is under the playhead: the very next main clip, when both are present videos
 * from different files. Null otherwise — a photo or a missing source on either side, no next clip, or the same file next (that cut
 * is a plain seek in the player already on screen). Nothing is skipped over: a clip further on is never preloaded in its place.
 */
export function nextPreloadTarget(p: Project, currentIndex: number, missing: string[]): PreloadTarget | null {
  const current = p.clips[currentIndex];
  const index = currentIndex + 1;
  const clip = p.clips[index];
  if (!current || !clip) return null;
  if (isPhoto(current) || isPhoto(clip)) return null;
  if (missing.includes(current.sourceUri) || missing.includes(clip.sourceUri)) return null;
  if (clip.sourceUri === current.sourceUri) return null;
  // Forwards also for a reversed clip, as the preview plays it; a speed curve is walked by the same helper.
  return { clip, index, sourceTime: outputToSource(clip, 0) };
}

/** What the standby player holds: which clip it was prepared for, its file, where it stands, and whether it can start at once. */
export type StandbyState = {
  clipId: string | null;
  sourceUri: string | null;
  /** The source time it was last seeked to while standing still; null when it has not been seeked (or has moved since). */
  seekedTo: number | null;
  /** Its status is `readyToPlay`. */
  ready: boolean;
  /** A seek waiting for its file to become ready; null when none. */
  pendingSeek: number | null;
  /** It was started early (silent) from `seekedTo` and is playing towards the hand-over. */
  rolling: boolean;
};

/** The standby player holds `clip` and its file, and stands on (or, rolling, started from) the clip's first frame. */
const holdsStartOf = (standby: StandbyState, clip: Clip): boolean =>
  standby.clipId === clip.id && standby.sourceUri === clip.sourceUri && standby.seekedTo !== null && standby.seekedTo === outputToSource(clip, 0);
/** It can start at once: its file is ready and no seek is outstanding. */
const prepared = (standby: StandbyState): boolean => standby.ready && standby.pendingSeek === null;

/**
 * How far outside the lead window a rolling standby player may be found before it is stopped, in seconds of output time. The timer
 * that starts it works from the last playhead tick and the clock; the next tick may place the playhead a hair earlier than that
 * estimate, and stopping the player for it would cost a second `play()`.
 */
export const HANDOFF_SLACK = 0.05;

/**
 * How far (seconds) the expected time of the cut must move before the early-start timer is armed again. Every playhead tick gives a
 * new estimate; ticks that agree with the armed timer leave it alone.
 */
export const HANDOFF_REARM = 0.02;

/** A timer that fires this much early (seconds) still starts the standby player, instead of being armed again for the rest. */
const TIMER_EARLY = 0.001;

/** How playback stands, as far as the hand-over is concerned. */
export type Playback = {
  /** The project is playing. */
  playing: boolean;
  /**
   * The player on screen has reported a time past the one playback started from, so its clock is running. False from Play until
   * then: a player needs 0.2–0.3 s to get going, and a standby player started with it would be that far into the next clip at the cut.
   */
  moving: boolean;
  /**
   * Seconds since the playhead was last moved by the player on screen; 0 when it is fresh, or was put there by anything else. While
   * playing, output time passes like the clock, so this much of the clip has been played beyond the playhead.
   */
  sinceTick: number;
};

/**
 * Whether a playhead reported by the player on screen shows its clock running (`Playback.moving`): it is past the playhead playback
 * started from by more than a seek can land off it. A player that has only just been told to play reports the time it stands at.
 */
export function hasMoved(startedFrom: number, playhead: number): boolean {
  return playhead - startedFrom > EPSILON;
}

/** Output time left in the clip under the playhead, counting what has played since the playhead's last tick. */
const outputLeft = (hit: ClipHit, playback: Playback): number => clipDuration(hit.clip) - hit.offsetInClip - playback.sinceTick;

/** The standby player could be started for `target`: playing, the player on screen moving, and it stands prepared, not rolling. */
const readyToRoll = (target: PreloadTarget | null, standby: StandbyState, playback: Playback): target is PreloadTarget =>
  playback.playing && playback.moving && !!target && !standby.rolling && holdsStartOf(standby, target.clip) && prepared(standby);

/**
 * Whether to start the standby player now, ahead of the cut: the project is playing and the player on screen is moving (never in
 * the pass that started playback — that cut is handed over to a standing player), the standby player is prepared for the clip to
 * preload (`target`), is not rolling yet, and the clip under the playhead (`hit`) has at most HANDOFF_LEAD of output time left. A clip
 * shorter than the lead is inside the window from its first frame.
 */
export function shouldStartEarly(hit: ClipHit, target: PreloadTarget | null, standby: StandbyState, playback: Playback): boolean {
  return readyToRoll(target, standby, playback) && outputLeft(hit, playback) <= HANDOFF_LEAD + TIMER_EARLY;
}

/**
 * How long from now (seconds) a timer should start the standby player: the output time left before the lead window, when
 * everything `shouldStartEarly` asks for holds except that the window has not been reached. Null when there is nothing to wait for
 * — it should start now, or not at all. The playhead only ticks every 0.05 s of MEDIA time (0.2 s of playback at 0.25×), so a tick
 * alone can come far too late in the window; while playing, output time passes like the clock, so the timer needs no tick.
 */
export function earlyStartDelay(hit: ClipHit, target: PreloadTarget | null, standby: StandbyState, playback: Playback): number | null {
  if (!readyToRoll(target, standby, playback)) return null;
  const left = outputLeft(hit, playback);
  return left > HANDOFF_LEAD + TIMER_EARLY ? left - HANDOFF_LEAD : null;
}

/**
 * Whether a rolling standby player may keep rolling: still playing, still inside the lead window of the clip under the playhead
 * (give or take HANDOFF_SLACK), and the clip to preload is still the one it was started for, from the start it was started at.
 * Anything else (a pause, a seek away, an edit, the next clip changing) and it must be stopped and seeked back.
 */
export function keepRolling(hit: ClipHit | null, target: PreloadTarget | null, standby: StandbyState, playback: Playback): boolean {
  return playback.playing && !!hit && !!target && holdsStartOf(standby, target.clip) && outputLeft(hit, playback) <= HANDOFF_LEAD + HANDOFF_SLACK;
}

/**
 * Whether the standby player can take over the clip the playhead has just entered (`hit`): it holds exactly that clip and file, and
 * either stands ready on the clip's first frame with no seek outstanding, or is already rolling from that frame (its status is not
 * asked then: it was prepared when it was started) — and the playhead is at the clip's start (a seek by the user into the middle of
 * a clip is not a cut). The caller adds the one condition this cannot see: the project is playing.
 */
export function canHandOver(standby: StandbyState, hit: ClipHit): boolean {
  if (isPhoto(hit.clip)) return false;
  if (hit.offsetInClip > EPSILON) return false;
  if (!holdsStartOf(standby, hit.clip)) return false;
  return standby.rolling || prepared(standby);
}
