import { createContext, useContext } from "react";
import { shownAppearance, theme, type AppAppearance, type Surfaces, type Tone } from "@/src/theme/theme";

/**
 * Which family of surfaces a part draws in: the screen family (navy, or cream when the phone is light) or the editor's soft slate
 * (theme.ts, `surfaces`). Said in ONE place per route — the `tone` of its `Screen` — and read by everything that is drawn: the kit
 * and the screens. The value is a constant string for the life of a screen, so nothing re-renders because of it; the provider
 * draws no view. Without a `Screen` above it a part is on a screen: only the editor and Crop say otherwise.
 */
export const ToneContext = createContext<Tone>("screen");
export const useTone = (): Tone => useContext(ToneContext);

/**
 * The appearance the screens below are drawn in. The root layout provides the one the app wears (app/_layout.tsx, from
 * `useShownAppearance` in appearance.ts): when the phone's setting changes, exactly the parts that read `useSurfaces()` under it
 * are drawn again — no screen is remounted, no route is reset. The editor's `Screen` provides its own constant, so nothing under
 * it hears of a change. Null (no provider: a bare part in a test) means the appearance shown now.
 */
export const ShownContext = createContext<AppAppearance | null>(null);

/**
 * The surfaces of the family this part is drawn in: one of three constant objects (the editor's, the dark screens', the light
 * screens'). THE way a colour that differs between appearances reaches the screen — never `theme.screen` (palette.guard.test.ts).
 */
export function useSurfaces(): Surfaces {
  const tone = useContext(ToneContext);
  const shown = useContext(ShownContext);
  return tone === "editor" ? theme.surfaces.editor : theme.screens[shown ?? shownAppearance()];
}

/** The appearance this part is drawn in — for the few things that are not a colour (Apple's sign-in button has a style per background). */
export const useShown = (): AppAppearance => useContext(ShownContext) ?? shownAppearance();

const RINGS = new WeakMap<Surfaces, { borderWidth: number; borderColor: string }>();
/** `theme.ring` in a family's gold ink: the 2-pt ring of a picked chip or tile. One constant object per family (in the editor it IS `theme.ring`). */
export function ringOf(s: Surfaces): { borderWidth: number; borderColor: string } {
  if (s === theme.surfaces.editor) return theme.ring;
  let ring = RINGS.get(s);
  if (!ring) RINGS.set(s, ring = { borderWidth: theme.ring.borderWidth, borderColor: s.accentInk });
  return ring;
}
