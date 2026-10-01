import { clipDuration, clipStartTimes, totalDuration, type ClipHit } from "@/src/editor/model/timeline";
import type { Project } from "@/src/editor/model/types";

export const EPSILON = 0.02;

/** Given the clip currently loaded in the player and the player's source-time, compute the output playhead. */
export function nextPlayheadFromPlayer(p: Project, hit: ClipHit, playerTime: number, missingClipIds: string[]): { playhead: number; ended: boolean } {
  const starts = clipStartTimes(p);
  // The player hasn't been seeked to this clip's trim window yet (e.g. a fresh `replaceAsync` whose
  // `currentTime` assignment hasn't landed) — hold at the clip's start instead of mapping a bogus time.
  if (playerTime < hit.clip.trimStart - EPSILON) return { playhead: starts[hit.index], ended: false };
  if (playerTime < hit.clip.trimEnd) return { playhead: starts[hit.index] + (playerTime - hit.clip.trimStart), ended: false };
  let next = hit.index + 1;
  while (next < p.clips.length && missingClipIds.includes(p.clips[next].id)) next++;
  if (next >= p.clips.length) return { playhead: totalDuration(p), ended: true };
  return { playhead: starts[next], ended: false };
}

/** The index of the next clip after `afterIndex` that is not in `missingClipIds`, or null if there is none. */
export function nextPresentClipIndex(p: Project, afterIndex: number, missingClipIds: string[]): number | null {
  let i = afterIndex + 1;
  while (i < p.clips.length && missingClipIds.includes(p.clips[i].id)) i++;
  return i < p.clips.length ? i : null;
}

export { clipDuration };
