import { theme } from "@/src/theme/theme";
import { TOOLBAR } from "@/src/ui/ToolButton";
import { TOOL_CARD, STRIP } from "@/src/ui/ToolStrip";

/**
 * The editor's message bar in numbers. `undoMs`: how long a message that offers Undo stays (one without stays `TOAST_MS`).
 * `gap`: between the bar and what it stands on. `minHeight`: one line — the Undo button's 44-pt target fits inside it.
 * `twoLines`: the most it is high (two lines of the body role at Apple's leading, and its padding).
 */
export const MESSAGE = {
  undoMs: 5000,
  gap: theme.space.xs,
  pad: theme.space.xs,
  minHeight: theme.size.touch,
  twoLines: 2 * theme.text.subhead.leading + 2 * theme.space.xs,
} as const;

/** What the bottom area is showing, as the presence stores, the keyboard store and the safe area say it. */
export type MessageAnchorInput = { panel: boolean; strip: boolean; keyboard: number; multi: boolean; insetBottom: number };
/** `bottom`: the bar's lower edge above the screen's lower edge; `side`: its margin from each side; `inside`: it is drawn inside the open tool's card. */
export type MessageAnchor = { bottom: number; side: number; inside: boolean };

/**
 * Where the message bar stands — a pure function of what the bottom area shows; it reads the bottom area's numbers and changes none.
 * - The toolbar (or multi-select's bar): just above the 64-pt capsule, in the band of page colour over it, with the capsule's side
 *   margin. What it needs beyond that band it takes upwards, over the timeline's lowest rows.
 * - An open strip with the timeline in view: just above the strip's card, with the card's side margin.
 * - A tool that has the timeline's place (a panel; a strip that has the keyboard): the tool's card reaches the play row, so there is
 *   NO free room above it — the bar then lies inside the card, at its lower edge, above the safe area or the keyboard.
 * The bottom padding is the toolbar's own rule: the safe area's (never under 8), or the keyboard's height while a tool has it.
 */
export function messageAnchor({ panel, strip, keyboard, multi, insetBottom }: MessageAnchorInput): MessageAnchor {
  const safePad = Math.max(insetBottom, theme.space.sm);
  // Multi-select's bar never sits on the keyboard (its strips have no field).
  const typing = (panel || strip) && keyboard > 0 && !multi;
  const pad = typing ? Math.max(keyboard, safePad) : safePad;
  if (panel || (strip && typing)) return { bottom: pad + theme.space.sm, side: TOOL_CARD.margin + theme.space.sm, inside: true };
  if (strip) return { bottom: pad + STRIP.height + MESSAGE.gap, side: TOOL_CARD.margin, inside: false };
  return { bottom: pad + TOOLBAR.height + MESSAGE.gap, side: theme.space.xs, inside: false };
}
