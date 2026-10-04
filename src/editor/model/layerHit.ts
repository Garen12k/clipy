import { placeClip } from "./clipLayout";
import type { ClipTransform, LayerClip } from "./types";

/** Below this drawn opacity a layer cannot be seen, so a tap goes through it. */
export const LAYER_HIT_MIN_OPACITY = 0.02;

/**
 * The layer a tap at `point` (pixels from the frame's top-left corner) lands on: the id of the TOPMOST layer — the last in
 * `layers`, which is in draw order — whose placed, rotated picture box contains the point, or null.
 * `resolve` gives each layer's transform and opacity as drawn (its motion at the playhead). The point is turned back about the
 * box's centre and compared with the half-sizes; flips mirror the picture inside the same box, and a mask is ignored (the whole
 * box takes the tap). A layer whose opacity is below `LAYER_HIT_MIN_OPACITY` is skipped.
 */
export function layerHit(
  layers: readonly LayerClip[],
  point: { x: number; y: number },
  frameW: number,
  frameH: number,
  resolve: (layer: LayerClip) => { transform: ClipTransform; opacity: number },
): string | null {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !(frameW > 0) || !(frameH > 0)) return null;
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i];
    const { transform, opacity } = resolve(layer);
    if (!(opacity >= LAYER_HIT_MIN_OPACITY)) continue;
    const placed = placeClip({ width: layer.width, height: layer.height }, layer.crop, transform, frameW, frameH);
    // The preview turns the box clockwise by `rotation` (y points down): its width runs along (cos, sin), its height along (−sin, cos).
    const a = (placed.rotation * Math.PI) / 180;
    const dx = point.x - placed.centerX, dy = point.y - placed.centerY;
    const u = dx * Math.cos(a) + dy * Math.sin(a);
    const v = dy * Math.cos(a) - dx * Math.sin(a);
    if (Math.abs(u) <= placed.width / 2 && Math.abs(v) <= placed.height / 2) return layer.id;
  }
  return null;
}
