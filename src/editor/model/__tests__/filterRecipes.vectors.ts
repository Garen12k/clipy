import type { FilterStep, RecipeFilterId } from "../filterRecipes";

/**
 * What each recipe filter does, step by step — shared with the Swift mirror (the `filterVectors` table in
 * modules/clipy-video/ios/Tests/FilterRecipeTests.swift, compared line for line by filterRecipes.parity.test.ts).
 * Plain literals, computed by hand from the Adjust constants: temperature x = 6500 − 2500·v, tint y = 100·v, brightness 0.25·v,
 * contrast 1 + 0.5·v, saturation 1 + v, curve y0 = 0.25·fade, y1 = 0.25 + 0.15·shadows, y3 = 0.75 + 0.15·highlights,
 * sharpen 1.2·v, vignette 1.5·v (radius 1.5), grain 0.25·v.
 */
export interface FilterVector { id: RecipeFilterId; steps: FilterStep[] }

const TT = (x: number, y: number): FilterStep => ({ kind: "temperatureTint", neutral: [6500, 0], target: [x, y] });
const CC = (brightness: number, contrast: number, saturation: number): FilterStep => ({ kind: "colorControls", brightness, contrast, saturation });
const CURVE = (y0: number, y1: number, y3: number): FilterStep => ({ kind: "toneCurve", points: [[0, y0], [0.25, y1], [0.5, 0.5], [0.75, y3], [1, 1]] });
const TONE = (shadow: string, highlight: string, amount: number): FilterStep => ({ kind: "splitTone", shadow, highlight, amount });
const SHARP = (sharpness: number): FilterStep => ({ kind: "sharpen", sharpness });
const VIG = (intensity: number): FilterStep => ({ kind: "vignette", intensity, radius: 1.5 });
const GRAIN = (opacity: number): FilterStep => ({ kind: "grain", opacity });

export const FILTER_VECTORS: FilterVector[] = [
  // 6500 − 2500·0.2 = 6000 ; contrast 1 + 0.5·0.15 = 1.075, saturation 1.15 ; fade 0.25·0.08 = 0.02 ; grain 0.25·0.15 = 0.0375
  { id: "kodak", steps: [TT(6000, 0), CC(0, 1.075, 1.15), TONE("#27413A", "#FFC98A", 0.25), CURVE(0.02, 0.25, 0.75), GRAIN(0.0375)] },
  // 6500 + 2500·0.12 = 6800, tint 100·−0.15 = −15 ; 1.05, 1.1 ; fade 0.025
  { id: "fuji", steps: [TT(6800, -15), CC(0, 1.05, 1.1), TONE("#1F4A45", "#F2F5E6", 0.2), CURVE(0.025, 0.25, 0.75)] },
  // 6500 − 200 = 6300 ; 1 − 0.125 = 0.875, 0.8 ; fade 0.175 ; grain 0.075
  { id: "matte", steps: [TT(6300, 0), CC(0, 0.875, 0.8), CURVE(0.175, 0.25, 0.75), GRAIN(0.075)] },
  // brightness 0.25·−0.05 = −0.0125 ; 1.25, 0.45 ; sharpen 0.24 ; grain 0.05
  { id: "bleach", steps: [CC(-0.0125, 1.25, 0.45), SHARP(0.24), GRAIN(0.05)] },
  // 6500 − 375 = 6125, tint 30 ; −0.025, 1, 1.15 ; vignette 1.5·0.25 = 0.375
  { id: "dusk", steps: [TT(6125, 30), CC(-0.025, 1, 1.15), TONE("#3B2A6B", "#FF9E6B", 0.35), VIG(0.375)] },
  // 6500 + 875 = 7375 ; −0.03, 1.125, 0.7 ; fade 0.0375 ; vignette 0.525
  { id: "moody", steps: [TT(7375, 0), CC(-0.03, 1.125, 0.7), CURVE(0.0375, 0.25, 0.75), VIG(0.525)] },
  { id: "tealOrange", steps: [CC(0, 1.1, 1.1), TONE("#0E6E78", "#FF9A45", 0.5)] },
  // tint 25 ; 0.05, 0.9, 0.85 ; fade 0.075
  { id: "blush", steps: [TT(6500, 25), CC(0.05, 0.9, 0.85), TONE("#8A5A7A", "#FFE3EA", 0.25), CURVE(0.075, 0.25, 0.75)] },
  // 1.35, 0 ; shadows 0.25 − 0.06 = 0.19 ; sharpen 0.6 ; vignette 0.45 ; grain 0.15
  { id: "grit", steps: [CC(0, 1.35, 0), CURVE(0, 0.19, 0.75), SHARP(0.6), VIG(0.45), GRAIN(0.15)] },
  // 0.9, 0 ; fade 0.1125, highlights 0.75 − 0.03 = 0.72 ; grain 0.0375
  { id: "silver", steps: [CC(0, 0.9, 0), CURVE(0.1125, 0.25, 0.72), GRAIN(0.0375)] },
  { id: "indigo", steps: [CC(0, 1.075, 0), TONE("#10214F", "#DCE9FF", 0.8)] },
  // −0.0375, 1.25, 0.75 ; shadows 0.25 − 0.075 = 0.175 ; sharpen 0.24 ; vignette 0.9
  { id: "drama", steps: [CC(-0.0375, 1.25, 0.75), CURVE(0, 0.175, 0.75), SHARP(0.24), VIG(0.9)] },
];
