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

/** The scale a text of this role is shown at here (1 for a fixed one): for a layout that must know — Home's two bottom actions share their row only above 1. */
export function useTextScale(role: TextRole = "chrome"): number {
  const tone = useTone();
  const phone = usePhoneScale();
  return role === "fixed" ? 1 : shownScale(phone, textCap(tone, role));
}

export type Fit = { numberOfLines: number; adjustsFontSizeToFit: true };
/**
 * "Fit": while a label that asked for it (`fit`: true = one line, a number = that many; its own `numberOfLines` wins) is shown larger
 * than the default (`scale` > 1), it keeps to those lines and may shrink until its words fit the room it is given. Null = add
 * nothing: at the default size, below it, and for every text that did not ask — a line limit alone ends in dots, as it always did.
 *
 * THERE IS NO FLOOR. iOS (the new architecture's text layout) shrinks down to 4 pt and does not read a minimum scale, and React
 * Native has no prop for the 4. So `fit` is safe only where the words are known to fit at the default size — a short fixed label
 * the app itself writes; then the shrink ends at or above that size. Never `fit` what a user or a platform wrote, a message or an
 * error sentence: a long one would be drawn tiny instead of ending in dots (the list is exact: textScale.guard.test.ts).
 */
export function fitProps(scale: number, lines: number | undefined, fit?: boolean | number): Fit | null {
  if (!fit || !(scale > 1)) return null;
  return { numberOfLines: lines || (fit === true ? 1 : fit), adjustsFontSizeToFit: true };
}

/**
 * iOS's large-content viewer for a control whose text is capped: at an accessibility text size, touch and hold shows `title` large in
 * the middle of the screen. Spread it on the control's pressable. React Native has a prop for the title and none for the picture.
 */
export const largeContent = (title: string) => ({ accessibilityShowsLargeContentViewer: true, accessibilityLargeContentTitle: title }) as const;
