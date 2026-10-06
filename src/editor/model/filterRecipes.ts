import type { FilterPreview } from "../effects";
import { adjustRecipe, type AdjustStep } from "./adjust";
import { ADJUST_KEYS, DEFAULT_ADJUST, type AdjustKey, type ClipAdjust } from "./types";

/**
 * The twelve filters of 2026-10-06. Mirrored by modules/clipy-video/ios/FilterRecipes.swift: keep the ids, the rows and the
 * stage rule identical (filterRecipes.parity.test.ts). A filter is one ROW: Adjust values (run through the untouched `adjustRecipe` /
 * `Adjust.apply`) and, for six of them, a split tone between the colour stage and the finishing stage. The 20 older filters are
 * not here — their Core Image chains stay in Effects.swift, their preview recipes in effects.ts.
 */
export const RECIPE_FILTER_IDS = ["kodak", "fuji", "matte", "bleach", "dusk", "moody", "tealOrange", "blush", "grit", "silver", "indigo", "drama"] as const;
export type RecipeFilterId = (typeof RECIPE_FILTER_IDS)[number];

/** Shadows take `shadow`, highlights `highlight` (#RRGGBB); `amount` 0…1 is how much of the toned picture is mixed in. */
export interface SplitTone { shadow: string; highlight: string; amount: number }
/** `adjust`: the non-zero Adjust values. `veil`: the one flat tint the Expo Go preview lays over the picture (preview only). */
export interface FilterRecipe { adjust: Partial<ClipAdjust>; tone: SplitTone | null; veil: { color: string; opacity: number } }

/** Content values (burned into the video), allow-listed in noHexLiterals.test.ts. */
export const FILTER_RECIPES: Record<RecipeFilterId, FilterRecipe> = {
  kodak:      { adjust: { temperature: 0.2, contrast: 0.15, saturation: 0.15, fade: 0.08, grain: 0.15 }, tone: { shadow: "#27413A", highlight: "#FFC98A", amount: 0.25 }, veil: { color: "#D6C436", opacity: 0.26 } },
  fuji:       { adjust: { temperature: -0.12, tint: -0.15, contrast: 0.1, saturation: 0.1, fade: 0.1 }, tone: { shadow: "#1F4A45", highlight: "#F2F5E6", amount: 0.2 }, veil: { color: "#4FD1B5", opacity: 0.12 } },
  matte:      { adjust: { temperature: 0.08, contrast: -0.25, saturation: -0.2, fade: 0.7, grain: 0.3 }, tone: null, veil: { color: "#7F8A98", opacity: 0.22 } },
  bleach:     { adjust: { brightness: -0.05, contrast: 0.5, saturation: -0.55, sharpen: 0.2, grain: 0.2 }, tone: null, veil: { color: "#000000", opacity: 0 } },
  dusk:       { adjust: { temperature: 0.15, tint: 0.3, brightness: -0.1, saturation: 0.15, vignette: 0.25 }, tone: { shadow: "#3B2A6B", highlight: "#FF9E6B", amount: 0.35 }, veil: { color: "#C96BD9", opacity: 0.18 } },
  moody:      { adjust: { temperature: -0.35, brightness: -0.12, contrast: 0.25, saturation: -0.3, fade: 0.15, vignette: 0.35 }, tone: null, veil: { color: "#2B4C7E", opacity: 0.2 } },
  tealOrange: { adjust: { contrast: 0.2, saturation: 0.1 }, tone: { shadow: "#0E6E78", highlight: "#FF9A45", amount: 0.5 }, veil: { color: "#1FA3A3", opacity: 0.12 } },
  blush:      { adjust: { tint: 0.25, brightness: 0.2, contrast: -0.2, saturation: -0.15, fade: 0.3 }, tone: { shadow: "#8A5A7A", highlight: "#FFE3EA", amount: 0.25 }, veil: { color: "#FFB3C7", opacity: 0.18 } },
  grit:       { adjust: { contrast: 0.7, saturation: -1, shadows: -0.4, sharpen: 0.5, vignette: 0.3, grain: 0.6 }, tone: null, veil: { color: "#000000", opacity: 0.12 } },
  silver:     { adjust: { contrast: -0.2, saturation: -1, highlights: -0.2, fade: 0.45, grain: 0.15 }, tone: null, veil: { color: "#C9CED6", opacity: 0.14 } },
  indigo:     { adjust: { contrast: 0.15, saturation: -1 }, tone: { shadow: "#10214F", highlight: "#DCE9FF", amount: 0.8 }, veil: { color: "#2A4B9B", opacity: 0.28 } },
  drama:      { adjust: { brightness: -0.15, contrast: 0.5, saturation: -0.25, shadows: -0.5, sharpen: 0.2, vignette: 0.6 }, tone: null, veil: { color: "#000000", opacity: 0.2 } },
};

/** The colour stage, run BEFORE the split tone; every other Adjust key (tone curve, sharpen, vignette, grain) is the finishing stage, run after it. */
export const BEFORE_TONE: readonly AdjustKey[] = ["exposure", "temperature", "tint", "brightness", "contrast", "saturation"];

export type FilterStep = AdjustStep | ({ kind: "splitTone" } & SplitTone);

export const isRecipeFilter = (id: string | null | undefined): id is RecipeFilterId => (RECIPE_FILTER_IDS as readonly unknown[]).includes(id);

/** The row as its two Adjust stages and the tone between them; null for any id that is not one of the twelve. */
export function filterStages(id: string | null | undefined): { before: ClipAdjust; tone: SplitTone | null; after: ClipAdjust } | null {
  if (!isRecipeFilter(id)) return null;
  const row = FILTER_RECIPES[id];
  const a: ClipAdjust = { ...DEFAULT_ADJUST, ...row.adjust };
  const before = { ...DEFAULT_ADJUST }, after = { ...DEFAULT_ADJUST };
  for (const k of ADJUST_KEYS) (BEFORE_TONE.includes(k) ? before : after)[k] = a[k];
  return { before, tone: row.tone, after };
}

/** The export recipe in order: colour stage, split tone, finishing stage. [] for an old filter, None, null or an unknown id. */
export function filterSteps(id: string | null | undefined): FilterStep[] {
  const s = filterStages(id);
  if (!s) return [];
  return [...adjustRecipe(s.before), ...(s.tone ? [{ kind: "splitTone" as const, ...s.tone }] : []), ...adjustRecipe(s.after)];
}

/** Preview only: how much a fade lifts the preview's brightness layer. */
export const FILTER_PREVIEW = { fadeLift: 0.1 } as const;
const r4 = (n: number) => Math.round(n * 1e4) / 1e4;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** What FilterLayer draws for a recipe filter, computed from its row: the veil, the row's saturation, and its brightness plus a little of its fade. */
export function filterPreviewOf(id: RecipeFilterId): FilterPreview {
  const row = FILTER_RECIPES[id];
  const a: ClipAdjust = { ...DEFAULT_ADJUST, ...row.adjust };
  return {
    tint: row.veil.color, tintOpacity: row.veil.opacity,
    saturation: clamp(r4(1 + a.saturation), 0, 2),
    brightness: clamp(r4(0.25 * a.brightness + FILTER_PREVIEW.fadeLift * a.fade), -0.3, 0.3),
  };
}
