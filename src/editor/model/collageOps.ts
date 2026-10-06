import { nowIso } from "@/src/lib/clock";
import { isCellInPlace, placeInCell } from "./collage";
import { videoLayerOverlap } from "./ops";
import { clipDuration, sourceAfter, totalDuration } from "./timeline";
import {
  clampNum, COLLAGE_CELLS, COLLAGE_CORNERS, COLLAGE_LAYOUT_IDS, COLLAGE_LIMITS, CORNER_MASK, DEFAULT_TRANSFORM, frameAspect, FULL_CROP, isPhoto, LAYER_LIMITS, newLayer, PHOTO,
  type Clip, type CollageCell, type CollageLayoutId, type LayerClip, type Project,
} from "./types";

// A collage is ordinary layers that carry a tag (`Clip.collage`). These are the only functions that write the tag; the geometry is
// collage.ts. They only ever change `layers` — like every layer op, so no main-track rule runs — and they never run on their own:
// each is called from a tap or a drag.

/** Why clips cannot become a collage, in the order the checks run. */
export type CollageRefusal = "empty" | "count" | "limit" | "videos" | "short" | "overlap";

const r3 = (v: number): number => Math.round(v * 1000) / 1000;
const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
/** Where a layer asked to start at `start` does start (`newLayer`: never before 0, to the millisecond). */
const layerStart = (start: number): number => r3(Math.max(0, start));
/** How many cells the layout has; a layout that does not exist has more than anyone can pick. */
const cellCount = (layout: CollageLayoutId): number => COLLAGE_CELLS[layout] ?? Infinity;
/** Only the layers change (the main track's rules have nothing to re-check). */
const stamp = (p: Project, layers: LayerClip[]): Project => ({ ...p, layers, updatedAt: nowIso() });

/**
 * How long a collage of `clips` lasts from `start`: the shortest video among them (the default photo length without one), cut to
 * what is left of the project after `start` (nothing to cut to at or past its end), kept between a photo's shortest and longest
 * length, to the millisecond.
 */
export function collageLength(p: Project, clips: readonly Clip[], start: number): number {
  const videos = clips.filter((c) => !isPhoto(c)).map((c) => clipDuration(c));
  const natural = videos.length > 0 ? Math.min(...videos) : PHOTO.defaultSeconds;
  const room = totalDuration(p) - layerStart(start);
  return r3(clampNum(room > 0 ? Math.min(natural, room) : natural, PHOTO.minSeconds, PHOTO.maxSeconds));
}

/** `c` lasting `length` seconds: a photo takes it as its length; a video longer than it loses the pictures it would play last (by timeline.ts: no speed arithmetic here). */
function timed(c: Clip, length: number): Clip {
  if (isPhoto(c)) return { ...c, trimStart: 0, trimEnd: length };
  // A reversed video plays from its source end, so what it plays last is its source head.
  if (c.reversed) return { ...c, trimStart: Math.max(c.trimStart, sourceAfter(c, c.trimEnd, -length)) };
  return { ...c, trimEnd: Math.min(c.trimEnd, sourceAfter(c, c.trimStart, length)) };
}

/**
 * The first cells' worth of `clips` as layers from `start`: timed together, placed in their cells (border 0, square), tagged.
 * A cell starts still and upright — keyframes or a Motion a picked clip carried would move it out of its cell, so they are not taken.
 */
function collageLayers(p: Project, clips: readonly Clip[], layout: CollageLayoutId, start: number, group: string): LayerClip[] {
  const used = clips.slice(0, cellCount(layout));
  const aspect = frameAspect(p);
  const length = collageLength(p, used, start);
  return used.map((c, i) => {
    const { motion: _motion, ...still } = timed(c, length);
    const layer = newLayer({ ...still, keyframes: [], transform: { ...DEFAULT_TRANSFORM }, crop: { ...FULL_CROP }, mask: "none" }, start);
    return placeInCell(layer, { group, layout, cell: i, border: 0, corner: 0, aspect });
  });
}

/**
 * Why the first `COLLAGE_CELLS[layout]` of `clips` cannot become this collage at `start`, or null: a project without main clips (or
 * a start that is not a number), too few clips, not enough free layers, more videos than may play at once, a video too short to be a
 * layer, or a video too many on screen together with the layers that are already there — counted, like every layer op counts it
 * (`videoLayerOverlap`), over the whole list with the collage in it as it would be added: from its start, for its own length.
 */
export function collageRefusal(p: Project, clips: readonly Clip[], layout: CollageLayoutId, start: number): CollageRefusal | null {
  const n = cellCount(layout);
  if (p.clips.length === 0 || !Number.isFinite(start)) return "empty";
  if (clips.length < n) return "count";
  if (p.layers.length + n > LAYER_LIMITS.max) return "limit";
  const videos = clips.slice(0, n).filter((c) => !isPhoto(c));
  if (videos.length > LAYER_LIMITS.maxVideoAtOnce) return "videos";
  if (videos.some((c) => clipDuration(c) < LAYER_LIMITS.minDuration - 1e-9)) return "short";
  if (videoLayerOverlap([...p.layers, ...collageLayers(p, clips, layout, start, "probe")]) > LAYER_LIMITS.maxVideoAtOnce) return "overlap";
  return null;
}

/**
 * Puts the first `COLLAGE_CELLS[layout]` of `clips` on top as layers from `start`, each filling its cell of the layout, all tagged
 * with `group`. Same project (no undo step) when `collageRefusal` refuses, `group` is empty, or an id is already used.
 */
export function addCollage(p: Project, clips: readonly Clip[], layout: CollageLayoutId, start: number, group: string): Project {
  if (group.length === 0 || collageRefusal(p, clips, layout, start) !== null) return p;
  const used = clips.slice(0, cellCount(layout));
  const taken = new Set([...p.clips, ...p.layers].map((c) => c.id));
  if (used.some((c) => taken.has(c.id)) || new Set(used.map((c) => c.id)).size !== used.length) return p;
  return stamp(p, [...p.layers, ...collageLayers(p, used, layout, start, group)]);
}

/**
 * The Border / Corner sliders, the layout tiles and "Fit to frame": every cell of `group` that is still in its place
 * (`isCellInPlace`) is laid out again with the patch, for the project's frame AS IT IS NOW. A cell the user moved is left exactly
 * as it is, and so are every other layer and a tag whose layout has no such cell (never in place). A layout with another number of
 * cells is not a re-lay and changes nothing. The mask is written only when the patch names a corner. Same project when nothing
 * changes or a value cannot be used.
 */
export function relayCollage(p: Project, group: string, patch: Partial<Pick<CollageCell, "layout" | "border" | "corner">>): Project {
  if (patch.layout !== undefined && !(COLLAGE_LAYOUT_IDS as readonly string[]).includes(patch.layout)) return p;
  if (patch.border !== undefined && !Number.isFinite(patch.border)) return p;
  if (patch.corner !== undefined && !(COLLAGE_CORNERS as readonly number[]).includes(patch.corner)) return p;
  const aspect = frameAspect(p);
  let changed = false;
  const layers = p.layers.map((l) => {
    const tag = l.collage;
    if (!tag || tag.group !== group || !isCellInPlace(l)) return l;
    const layout = patch.layout ?? tag.layout;
    if (COLLAGE_CELLS[layout] !== COLLAGE_CELLS[tag.layout]) return l;
    const border = patch.border === undefined ? tag.border : r3(clampNum(patch.border, COLLAGE_LIMITS.border[0], COLLAGE_LIMITS.border[1]));
    const corner = patch.corner ?? tag.corner;
    const placed = placeInCell(l, { ...tag, layout, border, corner, aspect });
    const next: LayerClip = patch.corner === undefined ? placed : { ...placed, mask: CORNER_MASK[corner] };
    if (sameJson(next, l)) return l;
    changed = true;
    return next;
  });
  return changed ? stamp(p, layers) : p;
}

/**
 * After Replace (`after` = `replaceClipMedia(before, id, …)`): when the layer was a collage cell in its place, the new picture is
 * fitted to that cell (its crop was the old picture's) for the frame shape the cell was laid out with — Replace is not a re-lay.
 * Otherwise — a refused swap, a plain layer, a cell the user moved, a main clip, a picture the old crop already fits — `after` is
 * returned as it is.
 */
export function refitReplacedCell(before: Project, after: Project, id: string): Project {
  if (after === before) return after;
  const was = before.layers.find((l) => l.id === id);
  const j = after.layers.findIndex((l) => l.id === id);
  if (!was || j < 0 || !was.collage || !isCellInPlace(was)) return after;
  const placed = placeInCell(after.layers[j], was.collage);
  if (sameJson(placed, after.layers[j])) return after;
  const layers = after.layers.slice();
  layers[j] = placed;
  return { ...after, layers };
}

/** The collage tag of the layer with this id; null for a main clip, a plain layer or no item. */
export const collageOf = (p: Project, id: string): CollageCell | null => p.layers.find((l) => l.id === id)?.collage ?? null;
