import { useEffect } from "react";
import { create } from "zustand";
import { useEditorStore } from "./store";
import { selectionKey } from "./toolbarContext";

export type StripId = "filter" | "adjust" | "speed" | "volume" | "opacity" | "mask" | "blend" | "chroma" | "transform" | "background"
  | "clipAnimation" | "overlayAnimation" | "transition" | "ratio" | "audioFade" | "audioVolume" | "effectStrength";
/** `key` = the selection key when it opened. Nothing else is remembered: a strip reads its item from the selection on every render. */
export type OpenStrip = { id: StripId; key: string };

/** Which tool strip is open (null = none). Transient UI state: not saved, not undoable. */
export const useToolStrip = create<{ open: OpenStrip | null }>(() => ({ open: null }));

/** Opening a strip leaves multi-select first: its bar has no place for one (the transport row's ratio pill is still there in that mode). */
export function openStrip(id: StripId): void {
  if (useEditorStore.getState().multiSelect !== null) useEditorStore.getState().exitMultiSelect();
  useToolStrip.setState({ open: { id, key: selectionKey(useEditorStore.getState()) } });
}
export function closeStrip(): void {
  if (useToolStrip.getState().open !== null) useToolStrip.setState({ open: null });
}

/**
 * Call once in the bottom area's component: closes the open strip when the selection key is no longer the one it opened with
 * (another item, none, the item deleted or undone away, multi-select), when the Transition strip's clip has no cut after it any
 * more (a reorder or an undo made it the last clip), and on unmount (the editor is left).
 * A slider drag cut short this way needs no clean-up: `beginTransaction` only pushes the undo snapshot, there is nothing to end.
 */
export function useStripCloser(): void {
  const key = useEditorStore(selectionKey);
  const open = useToolStrip((s) => s.open);
  const noCut = useEditorStore((s) => { const i = s.project?.clips.findIndex((c) => c.id === s.selectedClipId) ?? -1; return i < 0 || i >= (s.project?.clips.length ?? 0) - 1; });
  useEffect(() => { if (open && (open.key !== key || (open.id === "transition" && noCut))) closeStrip(); }, [key, open, noCut]);
  useEffect(() => closeStrip, []);
}
