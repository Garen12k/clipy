import { DEFAULT_ADJUST, type ClipAdjust } from "../types";
import type { AdjustStep } from "../adjust";

/** Shared with the Swift mirror: keep expected values as plain numeric literals. */
export interface AdjustVector { name: string; adjust: ClipAdjust; recipe: AdjustStep[] }

const A = (patch: Partial<ClipAdjust>): ClipAdjust => ({ ...DEFAULT_ADJUST, ...patch });
const CC = (brightness: number, contrast: number, saturation: number): AdjustStep => ({ kind: "colorControls", brightness, contrast, saturation });
const CURVE = (y0: number, y1: number, y3: number): AdjustStep => ({ kind: "toneCurve", points: [[0, y0], [0.25, y1], [0.5, 0.5], [0.75, y3], [1, 1]] });

export const ADJUST_VECTORS: AdjustVector[] = [
  { name: "neutral", adjust: A({}), recipe: [] },
  // 0.25*1
  { name: "brightness +1", adjust: A({ brightness: 1 }), recipe: [CC(0.25, 1, 1)] },
  { name: "brightness -1", adjust: A({ brightness: -1 }), recipe: [CC(-0.25, 1, 1)] },
  // 1 + 0.5*1 = 1.5 ; 1 - 0.5 = 0.5
  { name: "contrast +1", adjust: A({ contrast: 1 }), recipe: [CC(0, 1.5, 1)] },
  { name: "contrast -1", adjust: A({ contrast: -1 }), recipe: [CC(0, 0.5, 1)] },
  // 1 + 1 = 2 ; 1 - 1 = 0
  { name: "saturation +1", adjust: A({ saturation: 1 }), recipe: [CC(0, 1, 2)] },
  { name: "saturation -1", adjust: A({ saturation: -1 }), recipe: [CC(0, 1, 0)] },
  // 1.5*1
  { name: "exposure +1", adjust: A({ exposure: 1 }), recipe: [{ kind: "exposure", ev: 1.5 }] },
  { name: "exposure -1", adjust: A({ exposure: -1 }), recipe: [{ kind: "exposure", ev: -1.5 }] },
  // 6500 - 2500*1 = 4000 ; 6500 + 2500 = 9000
  { name: "temperature +1", adjust: A({ temperature: 1 }), recipe: [{ kind: "temperatureTint", neutral: [6500, 0], target: [4000, 0] }] },
  { name: "temperature -1", adjust: A({ temperature: -1 }), recipe: [{ kind: "temperatureTint", neutral: [6500, 0], target: [9000, 0] }] },
  // y = 100*1
  { name: "tint +1", adjust: A({ tint: 1 }), recipe: [{ kind: "temperatureTint", neutral: [6500, 0], target: [6500, 100] }] },
  { name: "tint -1", adjust: A({ tint: -1 }), recipe: [{ kind: "temperatureTint", neutral: [6500, 0], target: [6500, -100] }] },
  // 0.75 + 0.15*1 = 0.9 ; 0.75 - 0.15 = 0.6
  { name: "highlights +1", adjust: A({ highlights: 1 }), recipe: [CURVE(0, 0.25, 0.9)] },
  { name: "highlights -1", adjust: A({ highlights: -1 }), recipe: [CURVE(0, 0.25, 0.6)] },
  // 0.25 + 0.15*1 = 0.4 ; 0.25 - 0.15 = 0.1
  { name: "shadows +1", adjust: A({ shadows: 1 }), recipe: [CURVE(0, 0.4, 0.75)] },
  { name: "shadows -1", adjust: A({ shadows: -1 }), recipe: [CURVE(0, 0.1, 0.75)] },
  // y0 = 0.25*1
  { name: "fade +1", adjust: A({ fade: 1 }), recipe: [CURVE(0.25, 0.25, 0.75)] },
  // 1.2*1
  { name: "sharpen +1", adjust: A({ sharpen: 1 }), recipe: [{ kind: "sharpen", sharpness: 1.2 }] },
  // 1.5*1, radius 1.5
  { name: "vignette +1", adjust: A({ vignette: 1 }), recipe: [{ kind: "vignette", intensity: 1.5, radius: 1.5 }] },
  // 0.25*1
  { name: "grain +1", adjust: A({ grain: 1 }), recipe: [{ kind: "grain", opacity: 0.25 }] },
  {
    // exposure 1.5*0.5 = 0.75 ; temp 6500-1250 = 5250, tint 50 ; cc 0.125 / 1.25 / 1.5
    // curve y0 = 0.125, y1 = 0.25+0.075 = 0.325, y3 = 0.75+0.075 = 0.825 ; sharpen 0.6 ; vignette 0.75 ; grain 0.125
    name: "all keys at 0.5",
    adjust: A({ brightness: 0.5, contrast: 0.5, saturation: 0.5, exposure: 0.5, temperature: 0.5, tint: 0.5, highlights: 0.5, shadows: 0.5, sharpen: 0.5, vignette: 0.5, fade: 0.5, grain: 0.5 }),
    recipe: [
      { kind: "exposure", ev: 0.75 },
      { kind: "temperatureTint", neutral: [6500, 0], target: [5250, 50] },
      CC(0.125, 1.25, 1.5),
      CURVE(0.125, 0.325, 0.825),
      { kind: "sharpen", sharpness: 0.6 },
      { kind: "vignette", intensity: 0.75, radius: 1.5 },
      { kind: "grain", opacity: 0.125 },
    ],
  },
  {
    // x = 6500 - 2500*0.4 = 5500 ; y = 100*-0.5 = -50 (one combined step)
    name: "temperature 0.4 with tint -0.5",
    adjust: A({ temperature: 0.4, tint: -0.5 }),
    recipe: [{ kind: "temperatureTint", neutral: [6500, 0], target: [5500, -50] }],
  },
];
