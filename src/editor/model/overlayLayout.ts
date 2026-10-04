import { aspectRatioValue, type AspectRatio, type TextOverlay } from "./types";

export interface OverlayShadow { color: string; opacity: number; dx: number; dy: number; blur: number }
export interface OverlayGlow { color: string; radius: number }
export interface OverlayLayout {
  centerX: number; centerY: number; fontSize: number; maxWidth: number; padding: number; rotation: number;
  letterSpacing: number;          // px
  lineHeight: number;             // px
  outlineWidth: number;           // px
  outlineColor: string;           // the style's colour, or the automatic contrast colour
  shadow: OverlayShadow | null;   // dx, dy, blur in px (down-right)
  glow: OverlayGlow | null;       // radius in px
  opacity: number;                // 0–1
}

/** Outline width as a fraction of frame height (2 at a 450-tall preview frame), so preview and export match proportionally. */
export const OUTLINE_FACTOR = 2 / 450;
export const LINE_HEIGHT_FACTOR = 1.2;
export const BACKGROUND_PAD_FACTOR = 0.25;
export const MAX_WIDTH_FACTOR = 0.9;
/** cos 45° = sin 45°: a shadow's distance goes equally right and down. */
export const SHADOW_ANGLE = 0.7071;

const r = (v: number) => Math.round(v * 10000) / 10000;

/** Black outline for light text, white for dark. Mirrored by `contrastFor(hex:)` in OverlayLayout.swift. */
export function contrastFor(hex: string): string {
  const n = parseInt(hex.replace("#", "").slice(0, 6), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5 ? "#000000" : "#FFFFFF";
}

/**
 * The single source of truth for where text sits in a frame and for the pixel values of its style. Mirrored in
 * modules/clipy-video/ios/OverlayLayout.swift. All inputs are resolution-independent; outputs are pixels for the given frame.
 * The neutral style (× 1, × 0) gives exactly the numbers from before styles existed.
 */
export function layoutOverlay(o: TextOverlay, frameW: number, frameH: number): OverlayLayout {
  const fontSize = r(o.fontScale * o.scale * frameH);
  return {
    centerX: r(o.x * frameW), centerY: r(o.y * frameH), fontSize,
    maxWidth: r(MAX_WIDTH_FACTOR * frameW),
    padding: o.background ? r(BACKGROUND_PAD_FACTOR * fontSize) : 0,
    rotation: o.rotation,
    letterSpacing: r(o.style.letterSpacing * fontSize),
    lineHeight: r(LINE_HEIGHT_FACTOR * fontSize * o.style.lineSpacing),
    outlineWidth: r(OUTLINE_FACTOR * frameH * o.style.outlineWidth),
    outlineColor: o.style.outlineColor ?? contrastFor(o.color),
    shadow: shadowOf(o, fontSize),
    glow: glowOf(o, fontSize),
    opacity: o.style.opacity,
  };
}

function shadowOf(o: TextOverlay, fontSize: number): OverlayShadow | null {
  const shadow = o.style.shadow;
  if (!shadow) return null;
  const offset = r(shadow.distance * fontSize * SHADOW_ANGLE);
  return { color: shadow.color, opacity: shadow.opacity, dx: offset, dy: offset, blur: r(shadow.blur * fontSize) };
}

function glowOf(o: TextOverlay, fontSize: number): OverlayGlow | null {
  const glow = o.style.glow;
  return glow ? { color: glow.color, radius: r(glow.size * fontSize) } : null;
}

/** Largest w×h box with the ratio that fits inside the container. */
export function frameSize(ratio: AspectRatio, containerW: number, containerH: number): { w: number; h: number } {
  const ar = aspectRatioValue(ratio);
  if (containerW / containerH > ar) return { w: r(containerH * ar), h: containerH };
  return { w: containerW, h: r(containerW / ar) };
}
