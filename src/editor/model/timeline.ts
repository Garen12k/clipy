import type { Clip, Project } from "./types";

export const clipDuration = (c: Clip): number => c.trimEnd - c.trimStart;
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

export const timeToX = (t: number, pixelsPerSecond: number): number => t * pixelsPerSecond;
export const xToTime = (x: number, pixelsPerSecond: number): number => x / pixelsPerSecond;
