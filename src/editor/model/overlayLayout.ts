import { aspectRatioValue, type AspectRatio, type TextOverlay } from "./types";

export interface OverlayLayout { centerX: number; centerY: number; fontSize: number; maxWidth: number; padding: number; outlineWidth: number; rotation: number; lineHeight: number }

/** Outline width as a fraction of frame height (2 at a 450-tall preview frame), so preview and export match proportionally. */
export const OUTLINE_FACTOR = 2 / 450;
export const LINE_HEIGHT_FACTOR = 1.2;
export const BACKGROUND_PAD_FACTOR = 0.25;
export const MAX_WIDTH_FACTOR = 0.9;

const r = (v: number) => Math.round(v * 10000) / 10000;

/**
 * The single source of truth for where text sits in a frame. Mirrored in modules/clipy-video/ios/OverlayLayout.swift.
 * All inputs are resolution-independent; outputs are pixels for the given frame.
 */
export function layoutOverlay(o: TextOverlay, frameW: number, frameH: number): OverlayLayout {
  const fontSize = r(o.fontScale * o.scale * frameH);
  return {
    centerX: r(o.x * frameW), centerY: r(o.y * frameH), fontSize,
    maxWidth: r(MAX_WIDTH_FACTOR * frameW),
    padding: o.background ? r(BACKGROUND_PAD_FACTOR * fontSize) : 0,
    outlineWidth: r(OUTLINE_FACTOR * frameH), rotation: o.rotation, lineHeight: r(LINE_HEIGHT_FACTOR * fontSize),
  };
}

/** Largest w×h box with the ratio that fits inside the container. */
export function frameSize(ratio: AspectRatio, containerW: number, containerH: number): { w: number; h: number } {
  const ar = aspectRatioValue(ratio);
  if (containerW / containerH > ar) return { w: r(containerH * ar), h: containerH };
  return { w: containerW, h: r(containerW / ar) };
}
