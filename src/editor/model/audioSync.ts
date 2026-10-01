import type { AudioTrack } from "./types";

export const trackEnd = (t: AudioTrack): number => t.start + (t.trimEnd - t.trimStart);
/** Seconds into the source file that should be playing at `playhead`, or null when the track is silent there. */
export function songTimeAt(t: AudioTrack, playhead: number): number | null {
  if (playhead < t.start || playhead >= trackEnd(t)) return null;
  return t.trimStart + (playhead - t.start);
}
export const isAudible = (t: AudioTrack, playhead: number): boolean => songTimeAt(t, playhead) !== null;
