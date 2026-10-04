import { clipDuration, sourceSamples, timeToX } from "@/src/editor/model/timeline";
import type { Clip } from "@/src/editor/model/types";

export const CLIP_AREA_HEIGHT = 120;
export const LANE_HEIGHT = 28;
export const LANE_GAP = 4;
export const TIMELINE_HEIGHT = CLIP_AREA_HEIGHT + 3 * (LANE_HEIGHT + LANE_GAP);
/** Lanes under the clips, top to bottom: 0 text / stickers, 1 music, 2 effects. */
export const laneTop = (index: 0 | 1 | 2): number => CLIP_AREA_HEIGHT + index * (LANE_HEIGHT + LANE_GAP);
export const STRIP_HEIGHT = 64;
export const THUMB_WIDTH = 64;
export const MIN_THUMB_INTERVAL = 0.5;

export const stripWidth = (c: Clip, pps: number): number => timeToX(clipDuration(c), pps);

/** Seconds between thumbnails at this zoom: one thumb per `thumbWidth` px, never closer than `MIN_THUMB_INTERVAL`. */
export const thumbInterval = (pps: number, thumbWidth = THUMB_WIDTH): number => Math.max(MIN_THUMB_INTERVAL, thumbWidth / pps);

export function thumbTimes(c: Clip, pps: number, thumbWidth = THUMB_WIDTH): number[] {
  // One thumb per `interval` of OUTPUT time; timeline.ts turns that into source times (speed and speed curves live there).
  const out = sourceSamples(c, thumbInterval(pps, thumbWidth), 500).map((t) => Number(t.toFixed(3)));
  return out.length ? out : [c.trimStart];
}

export function indexFromDrop(startsPx: number[], widthsPx: number[], dragCenterX: number): number {
  let best = 0, bestDist = Infinity;
  startsPx.forEach((s, i) => {
    const d = Math.abs(s + widthsPx[i] / 2 - dragCenterX);
    if (d < bestDist) { best = i; bestDist = d; }
  });
  return best;
}
