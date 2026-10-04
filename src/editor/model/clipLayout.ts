import { MASK, type ClipTransform, type CropRect, type MaskId } from "./types";

export interface Size { width: number; height: number }
export interface PlacedClip { width: number; height: number; centerX: number; centerY: number; rotation: number; flipH: boolean; flipV: boolean }
export const SNAP = { offset: 0.02, rotationDeg: 3, scale: 0.03 };

/** True when the picture is turned on its side (within 1° of ±90°), so its width and height swap for cover / fit. */
export const isQuarterTurn = (rotation: number) => Math.abs((((rotation % 180) + 180) % 180) - 90) < 1;

/** Pixel size of the cropped picture before any scaling. */
export const croppedSize = (source: Size, crop: CropRect): Size => ({ width: source.width * crop.w, height: source.height * crop.h });

/** The cropped picture's bounding box as it sits in the frame (sides swapped on a quarter turn). */
function turned(source: Size, crop: CropRect, rotation: number): Size {
  const c = croppedSize(source, crop);
  return isQuarterTurn(rotation) ? { width: c.height, height: c.width } : c;
}
/** Pixels of frame per pixel of picture at scale 1 (the picture just covers the frame). */
export function coverFactor(source: Size, crop: CropRect, rotation: number, frameW: number, frameH: number): number {
  const b = turned(source, crop, rotation);
  return Math.max(frameW / b.width, frameH / b.height);
}
/** The transform scale at which the whole picture is visible (≤ 1). */
export function fitScale(source: Size, crop: CropRect, rotation: number, frameW: number, frameH: number): number {
  const b = turned(source, crop, rotation);
  return Math.min(frameW / b.width, frameH / b.height) / coverFactor(source, crop, rotation, frameW, frameH);
}
export function placeClip(source: Size, crop: CropRect, t: ClipTransform, frameW: number, frameH: number): PlacedClip {
  const c = croppedSize(source, crop), k = coverFactor(source, crop, t.rotation, frameW, frameH) * t.scale;
  return { width: c.width * k, height: c.height * k, centerX: frameW / 2 + t.x * frameW, centerY: frameH / 2 + t.y * frameH, rotation: t.rotation, flipH: t.flipH, flipV: t.flipV };
}
/**
 * Corner radius (pixels) of the placed picture box for a mask: none → 0, rounded → MASK.roundedRadius × the shorter side,
 * circle → half the shorter side (a square box becomes a circle, any other a pill). An unknown mask or a box without a size → 0.
 */
export function maskRadius(placed: { width: number; height: number }, mask: MaskId): number {
  const side = Math.min(placed.width, placed.height);
  if (!(side > 0) || !Number.isFinite(side)) return 0;
  if (mask === "rounded") return MASK.roundedRadius * side;
  if (mask === "circle") return side / 2;
  return 0;
}
/** Whether the picture hides the whole frame (only decidable cheaply for upright / quarter-turned pictures; anything else shows background). */
export function coversFrame(p: PlacedClip, frameW: number, frameH: number): boolean {
  const r = (((p.rotation % 90) + 90) % 90);
  if (Math.min(r, 90 - r) > 0.5) return false;
  const q = isQuarterTurn(p.rotation), w = q ? p.height : p.width, h = q ? p.width : p.height, e = 0.5;
  return p.centerX - w / 2 <= e && p.centerX + w / 2 >= frameW - e && p.centerY - h / 2 <= e && p.centerY + h / 2 >= frameH - e;
}
/** Gentle magnets while dragging: centre, straight angles, Fill (1) and Fit. `snapped` lists what engaged (for one haptic). */
export function snapTransform(t: ClipTransform, fit: number): { transform: ClipTransform; snapped: Array<"x" | "y" | "rotation" | "scale"> } {
  const snapped: Array<"x" | "y" | "rotation" | "scale"> = [];
  let { x, y, rotation, scale } = t;
  if (x !== 0 && Math.abs(x) <= SNAP.offset) { x = 0; snapped.push("x"); }
  if (y !== 0 && Math.abs(y) <= SNAP.offset) { y = 0; snapped.push("y"); }
  const nearest = Math.round(rotation / 90) * 90;
  if (rotation !== nearest && Math.abs(rotation - nearest) <= SNAP.rotationDeg) { rotation = nearest; snapped.push("rotation"); }
  for (const target of [1, fit]) if (scale !== target && Math.abs(scale - target) <= SNAP.scale * target) { scale = target; snapped.push("scale"); break; }
  return { transform: { ...t, x, y, rotation, scale }, snapped };
}
