import { outputToSource, type ClipHit } from "@/src/editor/model/timeline";
import { isPhoto, type Clip, type Project } from "@/src/editor/model/types";
import { EPSILON } from "@/src/editor/usePreviewSync";

/**
 * The preview keeps two video players: the ACTIVE one drives the picture, the sound and the playhead; the STANDBY one holds the
 * next clip's file, paused and silent at that clip's first frame, so a cut between two files needs no reload. These are the two
 * decisions of that scheme, free of React and of the players themselves.
 */

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
};

/**
 * Whether the standby player can take over the clip the playhead has just entered (`hit`): it holds exactly that clip and file, is
 * ready, has no seek outstanding and stands on the clip's first frame — and the playhead is at the clip's start (a seek by the user
 * into the middle of a clip is not a cut). The caller adds the one condition this cannot see: the project is playing.
 */
export function canHandOver(standby: StandbyState, hit: ClipHit): boolean {
  if (isPhoto(hit.clip)) return false;
  if (standby.clipId !== hit.clip.id || standby.sourceUri !== hit.clip.sourceUri) return false;
  if (!standby.ready || standby.pendingSeek !== null) return false;
  if (hit.offsetInClip > EPSILON) return false;
  return standby.seekedTo !== null && standby.seekedTo === outputToSource(hit.clip, 0);
}
