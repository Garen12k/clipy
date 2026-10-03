import { clampNum, CROP_MIN, type CropRect } from "./types";

/**
 * Crop-box geometry for the Crop screen. Everything is in fractions (0–1) of the source picture, so the
 * pixel aspect of a crop is `(crop.w × sourceAspect) / crop.h`. A preset `ratio` is that pixel aspect
 * (width / height of the cropped picture); in fractions it means `w = h × ratio / sourceAspect`.
 */
export const CROP_PRESETS = [
  { id: "free", label: "Free", ratio: null },
  { id: "9:16", label: "9:16", ratio: 9 / 16 },
  { id: "1:1", label: "1:1", ratio: 1 },
  { id: "4:5", label: "4:5", ratio: 4 / 5 },
  { id: "16:9", label: "16:9", ratio: 16 / 9 },
] as const;
export type CropPresetId = (typeof CROP_PRESETS)[number]["id"];
export type CropCorner = "tl" | "tr" | "bl" | "br";

const EPS = 1e-9;
/** A usable aspect / ratio: finite and positive (a clip stored with width = height = 0 gives NaN). */
const positive = (v: number) => Number.isFinite(v) && v > 0;

/** Moves the box by (dx, dy) fractions, stopping at the picture's edges. Non-finite deltas leave the box. */
export function moveBox(crop: CropRect, dx: number, dy: number): CropRect {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return crop;
  return { ...crop, x: clampNum(crop.x + dx, 0, 1 - crop.w), y: clampNum(crop.y + dy, 0, 1 - crop.h) };
}

/**
 * Drags one corner by (dx, dy) fractions; the opposite corner stays fixed. Free (`ratio` null): each side
 * is clamped to the picture and to `CROP_MIN`. Locked: the size comes from whichever drag component is
 * larger (the height one measured in width units), then is clamped — keeping the ratio and the fixed
 * corner — between the minimum box at that ratio and the largest that fits. If even the minimum does not
 * fit — or the source aspect, ratio or deltas are unusable — the crop is returned unchanged.
 */
export function dragCorner(crop: CropRect, corner: CropCorner, dx: number, dy: number, ratio: number | null, sourceAspect: number): CropRect {
  if (!positive(sourceAspect) || !Number.isFinite(dx) || !Number.isFinite(dy) || (ratio !== null && !positive(ratio))) return crop;
  const sx = corner === "tr" || corner === "br" ? 1 : -1;   // +1: the moving corner is on the right
  const sy = corner === "bl" || corner === "br" ? 1 : -1;   // +1: the moving corner is at the bottom
  const fixedX = sx > 0 ? crop.x : crop.x + crop.w;
  const fixedY = sy > 0 ? crop.y : crop.y + crop.h;
  const maxW = sx > 0 ? 1 - fixedX : fixedX;
  const maxH = sy > 0 ? 1 - fixedY : fixedY;

  let w: number, h: number;
  if (ratio === null) {
    w = clampNum(crop.w + sx * dx, CROP_MIN, maxW);
    h = clampNum(crop.h + sy * dy, CROP_MIN, maxH);
  } else {
    const k = ratio / sourceAspect;   // w = k × h in fractions
    const minH = Math.max(CROP_MIN, CROP_MIN / k);
    const maxFitH = Math.min(maxH, maxW / k);
    if (!(minH <= maxFitH + EPS)) return crop;
    const byWidth = sx * dx, byHeight = k * sy * dy;
    const wantH = Math.abs(byWidth) >= Math.abs(byHeight) ? (crop.w + byWidth) / k : crop.h + sy * dy;
    h = clampNum(wantH, minH, maxFitH);
    w = k * h;
  }
  const x = sx > 0 ? fixedX : fixedX - w;
  const y = sy > 0 ? fixedY : fixedY - h;
  return { x: Math.max(0, x), y: Math.max(0, y), w, h };
}

/**
 * The largest box of shape `ratio` that fits the picture, centred on the current box's centre and then
 * shifted (not shrunk) to stay inside. `null` (Free) leaves the box. A shape that cannot meet `CROP_MIN`
 * on this source (or an unusable source aspect / ratio) returns the crop unchanged — the same object, so
 * callers can tell the shape did not apply.
 */
export function applyPreset(crop: CropRect, ratio: number | null, sourceAspect: number): CropRect {
  if (ratio === null || !positive(ratio) || !positive(sourceAspect)) return crop;
  const k = ratio / sourceAspect;
  const w = k <= 1 ? k : 1;
  const h = k <= 1 ? 1 : 1 / k;
  if (!(w >= CROP_MIN - EPS && h >= CROP_MIN - EPS)) return crop;
  const cx = crop.x + crop.w / 2, cy = crop.y + crop.h / 2;
  return { x: clampNum(cx - w / 2, 0, 1 - w), y: clampNum(cy - h / 2, 0, 1 - h), w, h };
}

/** A box-body pan: translation in points over the drawn picture size, always from the gesture's `start`. */
export function panToMove(start: CropRect, tx: number, ty: number, picW: number, picH: number): CropRect {
  if (!positive(picW) || !positive(picH)) return start;
  return moveBox(start, tx / picW, ty / picH);
}

/** A corner-handle pan: translation in points over the drawn picture size, always from the gesture's `start`. */
export function panToCorner(start: CropRect, corner: CropCorner, tx: number, ty: number, picW: number, picH: number, ratio: number | null, sourceAspect: number): CropRect {
  if (!positive(picW) || !positive(picH)) return start;
  return dragCorner(start, corner, tx / picW, ty / picH, ratio, sourceAspect);
}
