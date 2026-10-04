import { clipDuration, sourceSamples, timeToX } from "@/src/editor/model/timeline";
import { AUDIO_KINDS, type AudioKind, type Clip, type Project } from "@/src/editor/model/types";

export const CLIP_AREA_HEIGHT = 120;
export const LANE_HEIGHT = 28;
export const LANE_GAP = 4;
/** The audio kinds that have at least one track, in lane order (music, voice, sfx). Empty when the project has no audio. */
export const audioLaneKinds = (p: Pick<Project, "audioTracks">): AudioKind[] => AUDIO_KINDS.filter((k) => p.audioTracks.some((t) => t.kind === k));
/**
 * Height of the whole timeline: the clip area, the text / sticker lane, one lane per audio kind in use and the effects lane.
 * A project with no audio still shows one (empty) music lane, so the count never goes below one. Lanes only ever add height.
 */
export const timelineHeight = (audioLaneCount: number): number => CLIP_AREA_HEIGHT + (2 + Math.max(1, audioLaneCount)) * (LANE_HEIGHT + LANE_GAP);
/** The height with one audio lane. */
export const TIMELINE_HEIGHT = timelineHeight(1);
/** Lanes under the clips, top to bottom: 0 text / stickers, then the audio lanes (1 …), then effects. */
export const laneTop = (index: number): number => CLIP_AREA_HEIGHT + index * (LANE_HEIGHT + LANE_GAP);
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
