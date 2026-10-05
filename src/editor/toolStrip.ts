import { useEffect } from "react";
import { create } from "zustand";
import { useEditorStore } from "./store";
import { selectionKey } from "./toolbarContext";

export type StripId = "filter" | "adjust" | "speed" | "volume" | "opacity" | "mask" | "blend" | "chroma" | "transform" | "background"
  | "clipAnimation" | "overlayAnimation" | "transition" | "ratio" | "audioFade" | "audioVolume" | "effectStrength";
/** `key` = the selection key when it opened; `clipIndex`: Transition only. */
export type OpenStrip = { id: StripId; key: string; clipIndex: number | null };

/** Which tool strip is open (null = none). Transient UI state: not saved, not undoable. */
export const useToolStrip = create<{ open: OpenStrip | null }>(() => ({ open: null }));

export function openStrip(id: StripId, clipIndex: number | null = null): void {
  useToolStrip.setState({ open: { id, key: selectionKey(useEditorStore.getState()), clipIndex } });
}
export function closeStrip(): void {
  if (useToolStrip.getState().open !== null) useToolStrip.setState({ open: null });
}

/**
 * Call once in the bottom area's component: closes the open strip when the selection key is no longer the one it opened with
 * (another item, none, the item deleted or undone away, multi-select), and on unmount (the editor is left).
 * A slider drag cut short this way needs no clean-up: `beginTransaction` only pushes the undo snapshot, there is nothing to end.
 */
export function useStripCloser(): void {
  const key = useEditorStore(selectionKey);
  const open = useToolStrip((s) => s.open);
  useEffect(() => { if (open && open.key !== key) closeStrip(); }, [key, open]);
  useEffect(() => closeStrip, []);
}
