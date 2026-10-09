import { createContext, use, useContext } from "react";
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
 * are drawn again — no screen is remounted, no route is reset. Null (no provider: a bare part in a test) means the appearance
 * shown now. The only other provider is the layout's own, around the navy loading screen.
 */
export const ShownContext = createContext<AppAppearance | null>(null);

/**
 * The surfaces of the family this part is drawn in: one of three constant objects (the editor's, the dark screens', the light
 * screens'). THE way a colour that differs between appearances reaches the screen — never `theme.screen` (palette.guard.test.ts).
 *
 * In the editor the appearance is NOT asked: `use` (which, unlike a hook, may sit behind a condition) is reached only on a screen.
 * That is what keeps the editor still when the phone's setting changes — React draws again every part that has READ a context
 * whose value changed anywhere above it, even under a nearer provider of the same context (measured: appearance.editor.test.tsx),
 * so the only part that is safe is one that never read it. The tone itself is a constant for the life of a screen.
 */
export function useSurfaces(): Surfaces {
  if (useContext(ToneContext) === "editor") return theme.surfaces.editor;
  return theme.screens[use(ShownContext) ?? shownAppearance()];
}

/**
 * The appearance this part is drawn in — for the few things that are not a colour (Apple's sign-in button has a style per
 * background). For screens only: it reads the appearance, so in the editor it would be drawn again when the phone's setting changes.
 */
export const useShown = (): AppAppearance => useContext(ShownContext) ?? shownAppearance();

const RINGS = new WeakMap<Surfaces, { borderWidth: number; borderColor: string }>();
/** `theme.ring` in a family's gold ink: the 2-pt ring of a picked chip or tile. One constant object per family (in the editor it IS `theme.ring`). */
export function ringOf(s: Surfaces): { borderWidth: number; borderColor: string } {
  if (s === theme.surfaces.editor) return theme.ring;
  let ring = RINGS.get(s);
  if (!ring) RINGS.set(s, ring = { borderWidth: theme.ring.borderWidth, borderColor: s.accentInk });
  return ring;
}
