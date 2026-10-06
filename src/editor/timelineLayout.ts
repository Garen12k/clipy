import { clipDuration, sourceSamples, timeToX } from "@/src/editor/model/timeline";
import { AUDIO_KINDS, type AudioKind, type Clip, type Project } from "@/src/editor/model/types";

export const CLIP_AREA_HEIGHT = 120;
export const LANE_HEIGHT = 28;
export const LANE_GAP = 4;
/** The audio kinds that have at least one track, in lane order (music, voice, sfx). Empty when the project has no audio. */
export const audioLaneKinds = (p: Pick<Project, "audioTracks">): AudioKind[] => AUDIO_KINDS.filter((k) => p.audioTracks.some((t) => t.kind === k));
/** Where the row at `index` starts (its gap, then its bars): index 0 is the first row shown, right under the clip area. */
export const laneTop = (index: number): number => CLIP_AREA_HEIGHT + index * (LANE_HEIGHT + LANE_GAP);

/** A lane of the timeline: one per audio kind, picture-in-picture layers (a row per layer), text / captions / stickers, timeline effects. */
export type LaneId = AudioKind | "layers" | "overlays" | "effects";
/** `index` and `top` are those of the lane's first row; `rows` is how many rows it is high — 1, except "layers": one per layer. */
export type Lane = { id: LaneId; index: number; top: number; rows: number };
/** The lanes shown under the clips, top to bottom; `lanesHeight` is what they add to the clip area and `height` is the whole timeline. */
export type LaneModel = { lanes: Lane[]; lanesHeight: number; height: number };

/**
 * THE rule for the timeline's lanes — nothing else decides which lanes exist, where they sit or how high the timeline is.
 * A lane is shown only while it holds something, and the order never changes, top to bottom under the clips: each audio kind that
 * has a track (music, voice, sfx — the songs sit right under the clips); the layers; text, captions and stickers (one lane for all
 * three); effects. Every lane is one row high except the layers lane, which has ONE ROW PER LAYER in the order of `project.layers`
 * (first layer = top row, a new layer = a new bottom row) whether or not the layers share any time — so no layer bar can cover
 * another. Collage cells are layers: four cells are four rows. Rows are all `LANE_GAP` + `LANE_HEIGHT` high and stack in the flow in
 * this order, so a lane's `top` is `laneTop` of the rows above it; `layerRowTops` gives each layer's. A project with clips only (or
 * none) has no lanes: the timeline is the clip area. The height is not capped: every row is always visible.
 */
export function laneModel(p: Pick<Project, "layers" | "overlays" | "audioTracks" | "effects"> | null): LaneModel {
  const found: { id: LaneId; rows: number }[] = p
    ? [...audioLaneKinds(p).map((id) => ({ id, rows: 1 })), { id: "layers", rows: p.layers.length }, { id: "overlays", rows: Math.min(1, p.overlays.length) }, { id: "effects", rows: Math.min(1, p.effects.length) }]
    : [];
  let row = 0;
  const lanes = found.filter((l) => l.rows > 0).map(({ id, rows }) => { const lane = { id, index: row, top: laneTop(row), rows }; row += rows; return lane; });
  const height = laneTop(row);
  return { lanes, lanesHeight: height - CLIP_AREA_HEIGHT, height };
}
/** Where each layer's row starts, in the order of `project.layers` (empty without layers). */
export function layerRowTops(model: Pick<LaneModel, "lanes">): number[] {
  const lane = model.lanes.find((l) => l.id === "layers");
  return lane ? Array.from({ length: lane.rows }, (_, i) => laneTop(lane.index + i)) : [];
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
