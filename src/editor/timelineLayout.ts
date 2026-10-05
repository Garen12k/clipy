import { clipDuration, sourceSamples, timeToX } from "@/src/editor/model/timeline";
import { AUDIO_KINDS, type AudioKind, type Clip, type Project } from "@/src/editor/model/types";

export const CLIP_AREA_HEIGHT = 120;
export const LANE_HEIGHT = 28;
export const LANE_GAP = 4;
/** The audio kinds that have at least one track, in lane order (music, voice, sfx). Empty when the project has no audio. */
export const audioLaneKinds = (p: Pick<Project, "audioTracks">): AudioKind[] => AUDIO_KINDS.filter((k) => p.audioTracks.some((t) => t.kind === k));
/** Where the lane at `index` starts (its gap, then its bars): index 0 is the first lane shown, right under the clip area. */
export const laneTop = (index: number): number => CLIP_AREA_HEIGHT + index * (LANE_HEIGHT + LANE_GAP);

/** A lane of the timeline: picture-in-picture layers, text / captions / stickers, one per audio kind, timeline effects. */
export type LaneId = "layers" | "overlays" | AudioKind | "effects";
export type Lane = { id: LaneId; index: number; top: number };
/** The lanes shown under the clips, top to bottom; `lanesHeight` is what they add to the clip area and `height` is the whole timeline. */
export type LaneModel = { lanes: Lane[]; lanesHeight: number; height: number };

/**
 * THE rule for the timeline's lanes — nothing else decides which lanes exist, where they sit or how high the timeline is.
 * A lane is shown only while it holds something: layers; text, captions and stickers (one lane for all three); each audio kind that
 * has a track; effects. The order never changes. A project with clips only (or none) has no lanes: the timeline is the clip area.
 */
export function laneModel(p: Pick<Project, "layers" | "overlays" | "audioTracks" | "effects"> | null): LaneModel {
  const ids: LaneId[] = p
    ? [...(p.layers.length > 0 ? (["layers"] as const) : []), ...(p.overlays.length > 0 ? (["overlays"] as const) : []), ...audioLaneKinds(p), ...(p.effects.length > 0 ? (["effects"] as const) : [])]
    : [];
  const lanes = ids.map((id, index) => ({ id, index, top: laneTop(index) }));
  const height = laneTop(lanes.length);
  return { lanes, lanesHeight: height - CLIP_AREA_HEIGHT, height };
}
/**
 * How far a bottom area that grows by `rise` (a tool strip) may rise over the timeline: over the lanes shown, never over the clip
 * area. What is left of the rise comes out of the preview while the strip is open.
 */
export const laneLift = (model: Pick<LaneModel, "lanesHeight">, rise: number): number => Math.min(rise, model.lanesHeight);
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
