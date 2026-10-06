import { clipDuration, sourceSamples, timeToX } from "@/src/editor/model/timeline";
import { AUDIO_KINDS, type AudioKind, type Clip, type Overlay, type Project } from "@/src/editor/model/types";

export const CLIP_AREA_HEIGHT = 120;
export const LANE_HEIGHT = 28;
export const LANE_GAP = 4;
/** The audio kinds that have at least one track, in lane order (music, voice, sfx). Empty when the project has no audio. */
export const audioLaneKinds = (p: Pick<Project, "audioTracks">): AudioKind[] => AUDIO_KINDS.filter((k) => p.audioTracks.some((t) => t.kind === k));
/** Where the row at `index` starts (its gap, then its bars): index 0 is the first row shown, right under the clip area. */
export const laneTop = (index: number): number => CLIP_AREA_HEIGHT + index * (LANE_HEIGHT + LANE_GAP);
/** Where the row at `row` of a many-row lane starts, measured from the lane's own first row (row 0 = 0). */
export const rowOffset = (row: number): number => row * (LANE_HEIGHT + LANE_GAP);
/**
 * The most a bar may reach above and below itself for touches: half the gap between two rows, so in stacked rows every bar's touch
 * area stays inside its own row (a larger slop reaches into the bar above or below, and the later-drawn bar takes the touch).
 */
export const ROW_SLOP = LANE_GAP / 2;

/** Two bars that share less time than this only touch (the ops keep 3 decimals; snapping calls the same distance one place). */
const TOUCH = 1e-3;
/** `rows`: how many rows the bars need (0 without bars); `rowOf`: each bar's row by id, 0 = top. */
export type RowPacking = { rows: number; rowOf: Record<string, number> };
/**
 * THE rule for which row of the text / stickers lane a bar sits in — `laneModel` takes the row count from it and `OverlayLane` each
 * bar's row; nothing else decides it. First-fit packing: the bars are taken by start time (bars with the same start in the order
 * of the array) and each goes into the first row whose last bar has ended by then, or into a new bottom row when every row is still
 * busy — so no two bars in a row share any time, the rows are as few as possible, and bars that follow one another (captions) keep
 * sharing a row. A bar that starts exactly where another ends (within a millisecond — a snapped edge) only touches it and shares
 * its row. A pure function of the starts, ends and array order: the same project always gives the same rows. Total: a time that is
 * not a number counts as 0 (an end as the start), a reversed range as the same range the right way round.
 */
export function overlayRows(overlays: readonly Pick<Overlay, "id" | "start" | "end">[]): RowPacking {
  const spans = overlays.map((o, order) => {
    const a = Number.isFinite(o.start) ? o.start : 0, b = Number.isFinite(o.end) ? o.end : a;
    return { id: o.id, order, from: Math.min(a, b), to: Math.max(a, b) };
  }).sort((x, y) => x.from - y.from || x.order - y.order);
  const ends: number[] = [];
  const rowOf: Record<string, number> = {};
  for (const s of spans) {
    let row = ends.findIndex((end) => s.from >= end - TOUCH);
    if (row < 0) row = ends.length;
    ends[row] = Math.max(ends[row] ?? s.to, s.to);
    rowOf[s.id] = row;
  }
  return { rows: ends.length, rowOf };
}

/** A lane of the timeline: one per audio kind, picture-in-picture layers (a row per layer), text / captions / stickers, timeline effects. */
export type LaneId = AudioKind | "layers" | "overlays" | "effects";
/** `index` and `top` are those of the lane's first row; `rows` is how many rows it is high — 1, except "layers" (one per layer) and "overlays" (as many as `overlayRows` needs). */
export type Lane = { id: LaneId; index: number; top: number; rows: number };
/** The lanes shown under the clips, top to bottom; `lanesHeight` is what they add to the clip area and `height` is the whole timeline. */
export type LaneModel = { lanes: Lane[]; lanesHeight: number; height: number };

/**
 * THE rule for the timeline's lanes — nothing else decides which lanes exist, where they sit or how high the timeline is.
 * A lane is shown only while it holds something, and the order never changes, top to bottom under the clips: each audio kind that
 * has a track (music, voice, sfx — the songs sit right under the clips); the layers; text, captions and stickers (one lane for all
 * three); effects. An audio lane and the effects lane are one row high. The layers lane has ONE ROW PER LAYER in the order of
 * `project.layers` (first layer = top row, a new layer = a new bottom row) whether or not the layers share any time — so no layer
 * bar can cover another. Collage cells are layers: four cells are four rows. The text / stickers lane has AS MANY ROWS AS ITS BARS
 * NEED so that none covers another (`overlayRows`: bars that share no time share a row, so a run of captions is still one row, and
 * a text over a sticker makes two). Rows are all `LANE_GAP` + `LANE_HEIGHT` high and stack in the flow in this order, so a lane's
 * `top` is `laneTop` of the rows above it; `layerRowTops` gives each layer's, `rowOffset` a text / sticker row's inside its lane. A
 * project with clips only (or none) has no lanes: the timeline is the clip area. The height is not capped: every row is always visible.
 */
export function laneModel(p: Pick<Project, "layers" | "overlays" | "audioTracks" | "effects"> | null): LaneModel {
  const found: { id: LaneId; rows: number }[] = p
    ? [...audioLaneKinds(p).map((id) => ({ id, rows: 1 })), { id: "layers", rows: p.layers.length }, { id: "overlays", rows: overlayRows(p.overlays).rows }, { id: "effects", rows: Math.min(1, p.effects.length) }]
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
