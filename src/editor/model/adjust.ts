import { isNeutralAdjust, type ClipAdjust } from "./types";

/** Mirrored in Adjust.swift. Turns slider values (spec section 4.1) into Core Image parameters. */
export const ADJUST = {
  brightness: 0.25, contrast: 0.5, saturation: 1, exposureEV: 1.5, neutral: 6500, temperature: 2500, tint: 100,
  curve: 0.15, fadeLift: 0.25, sharpen: 1.2, vignetteIntensity: 1.5, vignetteRadius: 1.5, grainOpacity: 0.25,
} as const;

export type AdjustStep =
  | { kind: "exposure"; ev: number }
  | { kind: "temperatureTint"; neutral: [number, number]; target: [number, number] }
  | { kind: "colorControls"; brightness: number; contrast: number; saturation: number }
  | { kind: "toneCurve"; points: [number, number][] }
  | { kind: "sharpen"; sharpness: number }
  | { kind: "vignette"; intensity: number; radius: number }
  | { kind: "grain"; opacity: number };

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Export recipe in order; neutral steps are omitted; a neutral adjust gives []. */
export function adjustRecipe(a: ClipAdjust): AdjustStep[] {
  const steps: AdjustStep[] = [];
  if (a.exposure !== 0) steps.push({ kind: "exposure", ev: ADJUST.exposureEV * a.exposure });
  if (a.temperature !== 0 || a.tint !== 0) {
    steps.push({
      kind: "temperatureTint",
      neutral: [ADJUST.neutral, 0],
      target: [ADJUST.neutral - ADJUST.temperature * a.temperature, ADJUST.tint * a.tint],
    });
  }
  if (a.brightness !== 0 || a.contrast !== 0 || a.saturation !== 0) {
    steps.push({
      kind: "colorControls",
      brightness: ADJUST.brightness * a.brightness,
      contrast: 1 + ADJUST.contrast * a.contrast,
      saturation: ADJUST.saturation * a.saturation + 1,
    });
  }
  if (a.highlights !== 0 || a.shadows !== 0 || a.fade !== 0) {
    steps.push({
      kind: "toneCurve",
      points: [
        [0, clamp01(ADJUST.fadeLift * a.fade)],
        [0.25, clamp01(0.25 + ADJUST.curve * a.shadows)],
        [0.5, 0.5],
        [0.75, clamp01(0.75 + ADJUST.curve * a.highlights)],
        [1, 1],
      ],
    });
  }
  if (a.sharpen > 0) steps.push({ kind: "sharpen", sharpness: ADJUST.sharpen * a.sharpen });
  if (a.vignette > 0) steps.push({ kind: "vignette", intensity: ADJUST.vignetteIntensity * a.vignette, radius: ADJUST.vignetteRadius });
  if (a.grain > 0) steps.push({ kind: "grain", opacity: ADJUST.grainOpacity * a.grain });
  return steps;
}

export interface PreviewLayer { key: string; color: string; opacity: number }

/** Preview approximation (spec section 4.1): flat colour layers, omitted when opacity is 0. */
export function adjustPreview(a: ClipAdjust): { layers: PreviewLayer[]; vignette: number } {
  const layers: PreviewLayer[] = [];
  const add = (key: string, color: string, opacity: number) => { if (opacity > 0) layers.push({ key, color, opacity }); };

  const light = ADJUST.brightness * a.brightness + 0.3 * a.exposure;
  add("light", light > 0 ? "#FFFFFF" : "#000000", Math.min(0.5, Math.abs(light)));
  add("temperature", a.temperature > 0 ? "#FF9A3C" : "#3C8CFF", 0.25 * Math.abs(a.temperature));
  add("tint", a.tint > 0 ? "#FF4FD8" : "#4FFF7A", 0.18 * Math.abs(a.tint));
  if (a.saturation < 0) add("saturation", "#808080", 0.55 * Math.abs(a.saturation));
  add("fade", "#9A9A9A", 0.25 * a.fade);
  return { layers, vignette: 0.6 * a.vignette };
}

export const adjustNeedsTag = (a: ClipAdjust) => !isNeutralAdjust(a);
