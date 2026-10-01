import type { Clip, Project } from "./types";

/** Output seconds this clip occupies on the timeline. The ONLY place speed scales durations. */
export const clipDuration = (c: Clip): number => (c.trimEnd - c.trimStart) / c.speed;
/** Source-file seconds for an offset (output seconds) into the clip. */
export const outputToSource = (c: Clip, offsetInClip: number): number => c.trimStart + offsetInClip * c.speed;
/** Output offset (seconds into the clip) for a source-file time. */
export const sourceToOutput = (c: Clip, sourceTime: number): number => (sourceTime - c.trimStart) / c.speed;
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
