import { create } from "zustand";
import { textLookOf, type TextLook } from "./model/ops";

/**
 * The look Copy style took (a text's font, size, colour, background, outline and style — `TextLook`), for Paste style. In memory for
 * the app's session only: never in a project, never in the undo history, never on disk — so it works across projects and is gone when
 * Clipy is closed. Written only by `copyStyle` (the text bar's Copy style); `contextFor` is told whether there is one (`styleCopied`).
 */
export const useCopiedStyle = create<{ look: TextLook | null }>(() => ({ look: null }));

/** Remembers `look` as its own copy (a later change of the caller's object changes nothing kept); replaces what was copied before. */
export function copyStyle(look: TextLook): void {
  useCopiedStyle.setState({ look: textLookOf(look) });
}

/** Forgets the copied look (tests). */
export function forgetCopiedStyle(): void {
  useCopiedStyle.setState({ look: null });
}
