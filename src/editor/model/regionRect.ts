import { clampNum, REGION_LIMITS, type EffectRect } from "./types";

/**
 * Rectangle geometry for placing a blur / mosaic box on the preview. Everything is in fractions (0–1) of the frame, top-left
 * origin. Each function takes a valid rect (inside the frame, sides ≥ `REGION_LIMITS.min`) and returns one; a call that changes
 * nothing — or is given a non-finite value — returns the rect it was given (the same object).
 */
export type RegionCorner = "tl" | "br";

/** Moves the rect by (dx, dy), stopping at the frame's edges. */
export function moveRect(rect: EffectRect, dx: number, dy: number): EffectRect {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) return rect;
  return { ...rect, x: clampNum(rect.x + dx, 0, 1 - rect.w), y: clampNum(rect.y + dy, 0, 1 - rect.h) };
}

/**
 * Scales both sides by `factor` about the rect's centre, keeping its shape: the factor is held where the shorter side would drop
 * below `REGION_LIMITS.min` or the longer side would exceed the frame. The result is then shifted (not shrunk) to stay inside.
 */
export function scaleRect(rect: EffectRect, factor: number): EffectRect {
  if (!Number.isFinite(factor) || factor === 1) return rect;
  const f = clampNum(factor, REGION_LIMITS.min / Math.min(rect.w, rect.h), 1 / Math.max(rect.w, rect.h));
  const w = clampNum(rect.w * f, REGION_LIMITS.min, 1), h = clampNum(rect.h * f, REGION_LIMITS.min, 1);
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  return { x: clampNum(cx - w / 2, 0, 1 - w), y: clampNum(cy - h / 2, 0, 1 - h), w, h };
}

/**
 * Drags one corner by (dx, dy); the opposite corner stays fixed. Each side is free, between `REGION_LIMITS.min` and the frame's
 * edge on the moving side.
 */
export function resizeRectCorner(rect: EffectRect, corner: RegionCorner, dx: number, dy: number): EffectRect {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) return rect;
  if (corner === "br") {
    return { x: rect.x, y: rect.y, w: clampNum(rect.w + dx, REGION_LIMITS.min, 1 - rect.x), h: clampNum(rect.h + dy, REGION_LIMITS.min, 1 - rect.y) };
  }
  const right = rect.x + rect.w, bottom = rect.y + rect.h;
  const w = clampNum(rect.w - dx, REGION_LIMITS.min, right), h = clampNum(rect.h - dy, REGION_LIMITS.min, bottom);
  return { x: Math.max(0, right - w), y: Math.max(0, bottom - h), w, h };
}
