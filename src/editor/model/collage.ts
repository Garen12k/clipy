import { coverFactor, croppedSize, type Size } from "./clipLayout";
import { clampCrop, clampNum, TRANSFORM_LIMITS, type Clip, type CollageCell, type CollageLayoutId, type CropRect } from "./types";

/**
 * Collage geometry (spec section 6). Pure maths, TypeScript only: a collage is ordinary layers, and all this file ever produces is a
 * layer's `transform`, `crop` and tag — what the preview and the export already draw. No Swift twin, and none is needed.
 * Cover comes from clipLayout (`coverFactor`): nothing here works out a cover or fit scale a second way.
 */
export interface CellRect { x: number; y: number; w: number; h: number }
export interface CellPlacement { crop: CropRect; scale: number; x: number; y: number }
/** Inset: where the small cell starts and how big it is (fractions of the frame, both directions). `inPlace`: how far a stored value may be from the layout's and still count as untouched. */
export const COLLAGE = { insetAt: 0.62, insetSize: 0.34, inPlace: 1e-5 } as const;

const HALF = 0.5;
const THIRD = 1 / 3;
const usable = (v: number): boolean => Number.isFinite(v) && v > 0;
/** 6 decimals, and never −0 (a test's `toEqual(0)` and a saved file both mean 0). */
const r6 = (v: number): number => Math.round(v * 1e6) / 1e6 + 0;
const cell = (x: number, y: number, w: number, h: number): CellRect => ({ x, y, w, h });

/** The layout's cells before the border. Big and two: the big cell on the left of a wide or square frame, on top of a tall one. */
function baseCells(layout: CollageLayoutId, aspect: number): CellRect[] {
  switch (layout) {
    case "sideBySide": return [cell(0, 0, HALF, 1), cell(HALF, 0, HALF, 1)];
    case "stacked": return [cell(0, 0, 1, HALF), cell(0, HALF, 1, HALF)];
    case "bigTwo": return aspect >= 1
      ? [cell(0, 0, HALF, 1), cell(HALF, 0, HALF, HALF), cell(HALF, HALF, HALF, HALF)]
      : [cell(0, 0, 1, HALF), cell(0, HALF, HALF, HALF), cell(HALF, HALF, HALF, HALF)];
    case "row3": return [cell(0, 0, THIRD, 1), cell(THIRD, 0, THIRD, 1), cell(2 * THIRD, 0, THIRD, 1)];
    case "grid4": return [cell(0, 0, HALF, HALF), cell(HALF, 0, HALF, HALF), cell(0, HALF, HALF, HALF), cell(HALF, HALF, HALF, HALF)];
    case "inset": return [cell(0, 0, 1, 1), cell(COLLAGE.insetAt, COLLAGE.insetAt, COLLAGE.insetSize, COLLAGE.insetSize)];
  }
}

/**
 * The layout's cells in a frame of `aspect` (width / height; unusable → square) with `border` — a fraction of the frame's SHORTER
 * side (not a number or below 0 → none) — at the frame's edges and between cells: the same pixels everywhere. Not rounded.
 */
export function collageCells(layout: CollageLayoutId, aspect: number, border: number): CellRect[] {
  const a = usable(aspect) ? aspect : 1;
  const b = Number.isFinite(border) ? Math.max(0, border) : 0;
  const gx = b * Math.min(1, 1 / a);
  const gy = b * Math.min(a, 1);
  return baseCells(layout, a).map((c) => cell(gx + c.x * (1 - gx), gy + c.y * (1 - gy), c.w * (1 - gx) - gx, c.h * (1 - gy) - gy));
}

/**
 * How a picture fills a cell: cropped (centred) to the cell's shape, then scaled so its box is the cell, centred on the cell.
 * `clampCrop` keeps at least a tenth of the picture; when that stops the crop, the picture is fitted INSIDE the cell. A picture
 * without a usable size counts as cell-shaped. Everything is rounded to 6 decimals — so the box may miss the cell's edge by a few
 * millionths of the frame, inwards. The scale stays inside TRANSFORM_LIMITS, so what is stored is what every later clamp keeps
 * (only a picture some seven times longer than its cell meets the lower limit; it then reaches over the cell's ends).
 */
export function cellPlacement(media: Size, target: CellRect, aspect: number): CellPlacement {
  const a = usable(aspect) ? aspect : 1;
  const shape = (target.w * a) / target.h;                 // the cell's width / height in pixels (the frame is `a` wide, 1 high)
  const source: Size = usable(media.width) && usable(media.height) ? media : { width: shape, height: 1 };
  const s = source.width / source.height;
  const cw = s > shape ? shape / s : 1;
  const ch = s > shape ? 1 : s / shape;
  const size = clampCrop({ x: 0, y: 0, w: cw, h: ch });    // only its w / h: the crop limit; centred below, after the limit
  const crop: CropRect = { x: r6((1 - size.w) / 2), y: r6((1 - size.h) / 2), w: r6(size.w), h: r6(size.h) };
  const box = croppedSize(source, crop);
  const k = Math.min((target.w * a) / box.width, target.h / box.height);   // frame per picture, so the box is inside the cell
  return {
    crop,
    scale: r6(clampNum(k / coverFactor(source, crop, 0, a, 1), TRANSFORM_LIMITS.scale[0], TRANSFORM_LIMITS.scale[1])),
    x: r6(target.x + target.w / 2 - 0.5),
    y: r6(target.y + target.h / 2 - 0.5),
  };
}

/** Null for a tag whose layout has no such cell (a loaded tag is already checked by `clampCollageCell`; this is for a hand-made one). */
function placementOf(clip: Clip, tag: CollageCell): CellPlacement | null {
  const target = collageCells(tag.layout, tag.aspect, tag.border)[tag.cell];
  return target ? cellPlacement({ width: clip.width, height: clip.height }, target, tag.aspect) : null;
}

/**
 * `clip` in the tag's cell: scale, offset and rotation 0 on its transform (flips kept), the crop, and its own copy of the tag. The mask
 * and all else are kept. A tag without a cell of its layout changes nothing: `clip` itself comes back.
 */
export function placeInCell<T extends Clip>(clip: T, tag: CollageCell): T {
  const at = placementOf(clip, tag);
  if (!at) return clip;
  return { ...clip, transform: { ...clip.transform, scale: at.scale, x: at.x, y: at.y, rotation: 0 }, crop: at.crop, collage: { ...tag } };
}

/**
 * Whether a tagged layer still sits where its tag's layout put it: no keyframes, upright, and its crop, scale and offset within
 * `COLLAGE.inPlace` of the layout's — judged against the tag's OWN frame shape, so a collage stays "in place" after the project's
 * ratio changed. A cell the user moved, resized, turned or re-cropped is not, and the sliders then leave it alone.
 */
export function isCellInPlace(clip: Clip): boolean {
  const tag = clip.collage;
  if (!tag || clip.keyframes.length > 0 || clip.transform.rotation !== 0) return false;
  const at = placementOf(clip, tag);
  if (!at) return false;
  const near = (v: number, want: number): boolean => Math.abs(v - want) <= COLLAGE.inPlace;
  return near(clip.transform.scale, at.scale) && near(clip.transform.x, at.x) && near(clip.transform.y, at.y)
    && near(clip.crop.x, at.crop.x) && near(clip.crop.y, at.crop.y) && near(clip.crop.w, at.crop.w) && near(clip.crop.h, at.crop.h);
}
