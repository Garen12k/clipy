import { createContext, useContext } from "react";
import { theme, type Surfaces, type Tone } from "@/src/theme/theme";

/**
 * Which family of surfaces the kit draws in: navy on a screen, hue-free neutrals in the editor (theme.ts, `surfaces`).
 * Said in ONE place per route — the `tone` of its `Screen` — and read by the kit parts that are drawn on both sides (Card,
 * SecondaryButton, QuietButton, Field, NumField, Chip, Tile, Toast, Sheet, ProgressRing, Body). The value is a constant string
 * for the life of a screen, so nothing re-renders because of it; the provider draws no view. Without a `Screen` above it a part
 * is on a screen (navy): only the editor and Crop say otherwise.
 */
export const ToneContext = createContext<Tone>("screen");
export const useTone = (): Tone => useContext(ToneContext);
/** The surfaces of the family this part is drawn in. One of two constant objects. */
export const useSurfaces = (): Surfaces => theme.surfaces[useContext(ToneContext)];
