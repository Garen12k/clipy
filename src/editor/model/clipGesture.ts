import { fitScale, snapTransform, type Size } from "./clipLayout";
import { clampTransform, type ClipTransform, type CropRect } from "./types";

/** What the preview gestures have done since the touch sequence began: drag in frame pixels, pinch factor, twist in radians. */
export interface GestureValues { dx: number; dy: number; scale: number; rotation: number }
export type Magnet = "x" | "y" | "rotation" | "scale";

/** A drag of `dxPx`/`dyPx` frame pixels moves the picture's centre by that fraction of the frame. */
export function applyDrag(start: ClipTransform, dxPx: number, dyPx: number, frameW: number, frameH: number): ClipTransform {
  if (!(frameW > 0) || !(frameH > 0)) return start;
  return clampTransform({ ...start, x: start.x + dxPx / frameW, y: start.y + dyPx / frameH });
}
/** A pinch multiplies the scale (clamped to the transform limits). */
export function applyPinch(start: ClipTransform, scaleFactor: number): ClipTransform {
  return clampTransform({ ...start, scale: start.scale * scaleFactor });
}
/** A twist of `radians` turns the picture by that angle (normalised degrees). */
export function applyTwist(start: ClipTransform, radians: number): ClipTransform {
  return clampTransform({ ...start, rotation: start.rotation + (radians * 180) / Math.PI });
}
/** Drag, pinch and twist from one snapshot; each owns different fields, so the order does not matter. */
export function composeGesture(start: ClipTransform, v: GestureValues, frameW: number, frameH: number): ClipTransform {
  return applyTwist(applyPinch(applyDrag(start, v.dx, v.dy, frameW, frameH), v.scale), v.rotation);
}

/** The magnets a transform sits exactly on: centre (x, y), a straight angle, Fill (1) or Fit. */
export function restingMagnets(t: ClipTransform, fit: number): Magnet[] {
  const out: Magnet[] = [];
  if (t.x === 0) out.push("x");
  if (t.y === 0) out.push("y");
  if (t.rotation % 90 === 0) out.push("rotation");
  if (t.scale === 1 || t.scale === fit) out.push("scale");
  return out;
}

/**
 * The transform to show for gesture values `v` applied to the snapshot `start`: composed from the snapshot
 * (never from the previous, snapped result, so magnets don't stick), then snapped. Fit is measured at the
 * snapped angle, so a picture twisted onto its side snaps to its sideways Fit. `engaged` = magnets the result sits on.
 */
export function gestureTransform(start: ClipTransform, v: GestureValues, source: Size, crop: CropRect, frameW: number, frameH: number):
  { transform: ClipTransform; snapped: Magnet[]; engaged: Magnet[] } {
  const raw = composeGesture(start, v, frameW, frameH);
  const fit = fitScale(source, crop, snapTransform(raw, 1).transform.rotation, frameW, frameH);
  const { transform, snapped } = snapTransform(raw, fit);
  return { transform, snapped, engaged: restingMagnets(transform, fit) };
}
