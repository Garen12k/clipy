import { useSyncExternalStore } from "react";
import { theme, type Tone } from "@/src/theme/theme";
import { onFontScale, readFontScale } from "./phoneTextSize";
import { useTone } from "./tone";

/**
 * How a text follows the phone's text size. `chrome` (the default): up to the cap of the family it is drawn in — the editor's, or a
 * screen's. `reading`: a paragraph under a title on a page that scrolls; further, on a screen only. `fixed`: never — content drawn in
 * the video frame, marks on the timeline, a glyph used as a picture (the exact list is pinned in textScale.guard.test.ts).
 */
export type TextRole = "chrome" | "reading" | "fixed";

/** The largest multiplier a text of this role reaches in this family. In the editor the family wins: a reading text is capped like the rest. */
export const textCap = (tone: Tone, role: TextRole): number =>
  role === "fixed" ? 1 : tone === "editor" ? theme.textScale.editor : role === "reading" ? theme.textScale.reading : theme.textScale.screen;

/** The scale a text is really shown at: what the phone asks for, held at the cap. Below the default it is the phone's own. */
export const shownScale = (phone: number, cap: number): number => Math.min(phone, cap);

/** The phone's text size now, kept up to date. Only a part that must know it calls this (a line-limited text): it is drawn again when the size changes. */
export const usePhoneScale = (): number => useSyncExternalStore(onFontScale, readFontScale, readFontScale);

/** The scale a text of this role is shown at here (1 for a fixed one): for a layout that must know. Nothing in the app needs it yet. */
export function useTextScale(role: TextRole = "chrome"): number {
  const tone = useTone();
  const phone = usePhoneScale();
  return role === "fixed" ? 1 : shownScale(phone, textCap(tone, role));
}

export type Fit = { numberOfLines?: number; adjustsFontSizeToFit?: boolean; minimumFontScale?: number };
/**
 * "Fit back": while a text is shown larger than the default (`scale` > 1) and is limited to lines — its own `numberOfLines`, or `fit`
 * (true = one line, a number = that many) — it may shrink to fit them, at most back to the size it has at the default: its own floor
 * (`minimumFontScale`, 1 when it has none) divided by the scale. So it never needs more room than it has today. Null = add nothing:
 * at the default size, below it, and for a text with no limit (which wraps and grows).
 */
export function fitProps(scale: number, given: Fit, fit?: boolean | number): Fit | null {
  const lines = given.numberOfLines || (fit === true ? 1 : typeof fit === "number" ? fit : 0);
  if (!(scale > 1) || !lines) return null;
  return { numberOfLines: lines, adjustsFontSizeToFit: true, minimumFontScale: (given.minimumFontScale ?? 1) / scale };
}

/**
 * iOS's large-content viewer for a control whose text is capped: at an accessibility text size, touch and hold shows `title` large in
 * the middle of the screen. Spread it on the control's pressable. React Native has a prop for the title and none for the picture.
 */
export const largeContent = (title: string) => ({ accessibilityShowsLargeContentViewer: true, accessibilityLargeContentTitle: title }) as const;
