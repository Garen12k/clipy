import { clipStartTimes, sourceToOutput, totalDuration, type ClipHit } from "@/src/editor/model/timeline";
import type { Project } from "@/src/editor/model/types";

export const EPSILON = 0.02;

/** Given the clip currently loaded in the player and the player's source-time, compute the output playhead. */
export function nextPlayheadFromPlayer(p: Project, hit: ClipHit, playerTime: number, missingSourceUris: string[]): { playhead: number; ended: boolean } {
  const starts = clipStartTimes(p);
  // The player hasn't been seeked to this clip's trim window yet (e.g. a fresh `replaceAsync` whose
  // `currentTime` assignment hasn't landed) — hold at the clip's start instead of mapping a bogus time.
  if (playerTime < hit.clip.trimStart - EPSILON) return { playhead: starts[hit.index], ended: false };
  // A seek to the trim start can land a hair before it (the player's time scale): never map that to before the clip's
  // own start, or the playhead falls back into the previous clip and the two clips reload each other forever.
  if (playerTime < hit.clip.trimEnd) return { playhead: starts[hit.index] + Math.max(0, sourceToOutput(hit.clip, playerTime)), ended: false };
  let next = hit.index + 1;
  while (next < p.clips.length && missingSourceUris.includes(p.clips[next].sourceUri)) next++;
  if (next >= p.clips.length) return { playhead: totalDuration(p), ended: true };
  return { playhead: starts[next], ended: false };
}

/** The index of the next clip after `afterIndex` whose source is not in `missingSourceUris`, or null if there is none. */
export function nextPresentClipIndex(p: Project, afterIndex: number, missingSourceUris: string[]): number | null {
  let i = afterIndex + 1;
  while (i < p.clips.length && missingSourceUris.includes(p.clips[i].sourceUri)) i++;
  return i < p.clips.length ? i : null;
}
