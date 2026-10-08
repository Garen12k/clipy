import { useEffect } from "react";
import { create } from "zustand";
import { useEditorStore } from "./store";
import { selectionKey } from "./toolbarContext";

export type StripId = "filter" | "adjust" | "speed" | "volume" | "opacity" | "mask" | "blend" | "chroma" | "cutout" | "stabilize" | "transform" | "background"
  | "clipAnimation" | "overlayAnimation" | "transition" | "ratio" | "audioFade" | "audioVolume" | "effectStrength" | "effect" | "trim" | "photoMotion";
export type PanelId = "beats" | "templates" | "captions" | "addAudio" | "sticker" | "text" | "stickerEdit" | "collage" | "cover" | "voice" | "soundQuality";
export type OpenToolId = StripId | PanelId;
/** `key` = the selection key when it opened. Nothing else is remembered: a tool reads its item from the selection on every render. */
export type OpenStrip = { id: OpenToolId; key: string };

/** Which tool — a strip or a tall panel — is open (null = none). One at a time. Transient UI state: not saved, not undoable. */
export const useToolStrip = create<{ open: OpenStrip | null }>(() => ({ open: null }));

/** A voice-over is being recorded or saved: the Add audio panel must not be taken away from under the recorder (it stops, saves and closes itself). */
const recording = () => useEditorStore.getState().recording;

/**
 * Opens a strip or a panel. It leaves multi-select first (its bar has no place for one). A tool that is about an item is opened
 * AFTER that item is selected, so its key is that item — Add text selects the new text, then opens the text panel.
 */
export function openStrip(id: OpenToolId): void {
  if (recording()) return;
  if (useEditorStore.getState().multiSelect !== null) useEditorStore.getState().exitMultiSelect();
  useToolStrip.setState({ open: { id, key: selectionKey(useEditorStore.getState()) } });
}
export function closeStrip(): void {
  if (useToolStrip.getState().open !== null) useToolStrip.setState({ open: null });
}
/** The open tool now belongs to the current selection: called right after a tool itself changed the selection and stays open (Duplicate in the text panel). */
export function rekeyStrip(): void {
  const open = useToolStrip.getState().open;
  const key = selectionKey(useEditorStore.getState());
  if (open && open.key !== key) useToolStrip.setState({ open: { ...open, key } });
}
/** Export: closes the open tool and says go. While a voice-over is recorded it pauses playback instead (the recorder then stops and saves) and says no. */
export function closeForExport(): boolean {
  if (recording()) { useEditorStore.getState().setPlaying(false); return false; }
  closeStrip();
  return true;
}

/**
 * Call once in the bottom area's component: closes the open tool when the selection key is no longer the one it opened with
 * (another item, none, the item deleted or undone away, multi-select), when the Transition strip's clip has no cut after it any
 * more, and on unmount (the editor is left). It waits while a voice-over is being recorded.
 * The open tool is read from the store inside the effect: a tool may have re-keyed itself in the same commit.
 */
export function useStripCloser(): void {
  const key = useEditorStore(selectionKey);
  const open = useToolStrip((s) => s.open);
  const busy = useEditorStore((s) => s.recording);
  const noCut = useEditorStore((s) => { const i = s.project?.clips.findIndex((c) => c.id === s.selectedClipId) ?? -1; return i < 0 || i >= (s.project?.clips.length ?? 0) - 1; });
  useEffect(() => {
    const now = useToolStrip.getState().open;
    if (now && !busy && (now.key !== key || (now.id === "transition" && noCut))) closeStrip();
  }, [key, open, noCut, busy]);
  useEffect(() => closeStrip, []);
}
