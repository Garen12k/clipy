import { clipDuration, clipStartTimes, totalDuration, type ClipHit } from "@/src/editor/model/timeline";
import type { Project } from "@/src/editor/model/types";

/** Given the clip currently loaded in the player and the player's source-time, compute the output playhead. */
export function nextPlayheadFromPlayer(p: Project, hit: ClipHit, playerTime: number, missingClipIds: string[]): { playhead: number; ended: boolean } {
  const starts = clipStartTimes(p);
  if (playerTime < hit.clip.trimEnd) return { playhead: starts[hit.index] + (playerTime - hit.clip.trimStart), ended: false };
  let next = hit.index + 1;
  while (next < p.clips.length && missingClipIds.includes(p.clips[next].id)) next++;
  if (next >= p.clips.length) return { playhead: totalDuration(p), ended: true };
  return { playhead: starts[next], ended: false };
}

export const EPSILON = 0.02;
export { clipDuration };
