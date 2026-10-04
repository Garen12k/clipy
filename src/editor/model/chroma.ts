import { CHROMA, isHexColor } from "./types";

// Green-screen maths. Mirrored expression for expression by modules/clipy-video/ios/Chroma.swift — keep the two identical (constants
// in CHROMA, vectors in __tests__/chroma.vectors.ts). The export builds its colour cube from `chromaAlpha`; no other code keys a pixel.

/** A number clamped to 0–1; a non-finite one counts as 0. */
function unit(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

/**
 * The standard hexcone conversion. Inputs are clamped to 0–1 (non-finite → 0). `h` is in degrees [0, 360) and 0 for greys;
 * `s = max === 0 ? 0 : (max − min) / max`; `v = max`.
 */
export function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const red = unit(r);
  const green = unit(g);
  const blue = unit(b);
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const v = max;
  const s = max === 0 ? 0 : delta / max;
  let h = 0;
  if (delta > 0) {
    if (max === red) h = 60 * ((green - blue) / delta);
    else if (max === green) h = 60 * ((blue - red) / delta + 2);
    else h = 60 * ((red - green) / delta + 4);
  }
  if (h < 0) h = h + 360;
  if (h >= 360) h = h - 360;   // a hue a hair below 0 rounds to exactly 360 when 360 is added
  return { h, s, v };
}

/** `#RRGGBB` (either case) → components / 255; anything else → null. */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  if (!isHexColor(hex)) return null;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return { r, g, b };
}

/**
 * The shortest way round the hue circle between two hues in degrees: 0…180. Finite input is the caller's job — a non-finite hue
 * gives NaN here. `chromaAlpha` never passes one: both hues come from `rgbToHsv`, which clamps its input.
 */
export function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * How much of a pixel (r, g, b in 0–1) is left by a green screen with key colour `key` (#RRGGBB) at `strength` (0–1, clamped; non-finite
 * → 0): 0 = fully see-through, 1 = untouched. A pixel whose hue is within `tol = hueBase + hueRange × strength` degrees of the key's hue
 * is removed, with a ramp `soft` degrees wide outside that. Greys, whites and darks (saturation < minSat or value < minVal) are never
 * keyed; a key that is not #RRGGBB or is itself grey (saturation < minSat) keys nothing.
 */
export function chromaAlpha(r: number, g: number, b: number, key: string, strength: number): number {
  const keyRgb = hexToRgb(key);
  if (keyRgb === null) return 1;
  const keyHsv = rgbToHsv(keyRgb.r, keyRgb.g, keyRgb.b);
  if (keyHsv.s < CHROMA.minSat) return 1;
  const pixel = rgbToHsv(r, g, b);
  if (pixel.s < CHROMA.minSat || pixel.v < CHROMA.minVal) return 1;
  const tol = CHROMA.hueBase + CHROMA.hueRange * unit(strength);
  const d = hueDistance(pixel.h, keyHsv.h);
  const alpha = (d - tol) / CHROMA.soft;
  return Math.min(1, Math.max(0, alpha));
}
