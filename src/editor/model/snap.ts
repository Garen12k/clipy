import { trackEnd } from "./audioSync";
import { clipStartTimes, layerEnd, totalDuration } from "./timeline";
import type { Project } from "./types";

// Snapping maths: project seconds in, project seconds out. No pixels except `snapThreshold`, no speed arithmetic (timeline.ts gives the times).

/** How close (points on screen) an edge must come to a target to snap. */
export const SNAP_POINTS = 8;
export const snapThreshold = (pps: number): number => SNAP_POINTS / pps;

const sortedUnique = (times: number[]): number[] => {
  const out: number[] = [];
  for (const t of times.filter((x) => Number.isFinite(x) && x >= 0).sort((a, b) => a - b)) if (out.length === 0 || t - out[out.length - 1] > 1e-9) out.push(t);
  return out;
};

/** Every time a dragged bar may snap to; the bar being dragged (`excludeId`) does not offer its own edges. */
export function snapTargets(p: Project, playhead: number, excludeId: string | null = null): number[] {
  const keep = <T extends { id: string }>(items: T[]) => items.filter((x) => x.id !== excludeId);
  return sortedUnique([
    0, totalDuration(p), playhead, ...clipStartTimes(p),
    ...keep(p.overlays).flatMap((o) => [o.start, o.end]),
    ...keep(p.audioTracks).flatMap((t) => [t.start, trackEnd(t)]),
    ...keep(p.layers).flatMap((l) => [l.start, layerEnd(l)]),
    ...keep(p.effects).flatMap((e) => [e.start, e.end]),
    ...p.beatMarkers,
  ]);
}
/** What a main clip's trimmed edge snaps to: the playhead and the beat markers. */
export const clipSnapTargets = (p: Project, playhead: number): number[] => sortedUnique([playhead, ...p.beatMarkers]);

export function snapTime(t: number, targets: readonly number[], threshold: number): { time: number; target: number | null } {
  let best: number | null = null;
  // A threshold that is not a positive number of seconds (8 points at 0 pixels per second is Infinity) never snaps.
  if (Number.isFinite(t) && Number.isFinite(threshold) && threshold > 0) for (const x of targets) {
    const d = Math.abs(x - t);
    if (d <= threshold && (best === null || d < Math.abs(best - t))) best = x;   // strict `<`: on a tie the earlier target stays
  }
  return best === null ? { time: t, target: null } : { time: best, target: best };
}
export function snapMove(start: number, duration: number, targets: readonly number[], threshold: number): { start: number; target: number | null } {
  const a = snapTime(start, targets, threshold), b = snapTime(start + duration, targets, threshold);
  if (a.target !== null && (b.target === null || Math.abs(a.target - start) <= Math.abs(b.target - (start + duration)))) return { start: a.target, target: a.target };
  return b.target !== null ? { start: b.target - duration, target: b.target } : { start, target: null };
}
