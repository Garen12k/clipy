import { requestPermissionsAsync, saveToLibraryAsync } from "expo-media-library/legacy";
import { router } from "expo-router";
import * as Sharing from "expo-sharing";
import { useEditorStore } from "@/src/editor/store";
import { ExportScreenBody } from "@/src/export/ExportScreenBody";
import { useExport } from "@/src/export/useExport";
import { ToastHost, useToast } from "@/src/ui/Toast";

export default function ExportScreen() {
  const project = useEditorStore((s) => s.project);
  const { state, start, cancel, reset } = useExport(project);
  if (!project) return null;

  // `expo-media-library`'s default (non-legacy) `saveToLibraryAsync` is a shim that throws at
  // runtime in SDK 57 (see `build/legacyWarnings.js`) — use the `/legacy` subpath's real impl.
  async function onSave() {
    if (!state.fileUri) return;
    try {
      const perm = await requestPermissionsAsync(true);
      if (!perm.granted) { useToast.getState().show("Allow Photos access in Settings to save."); return; }
      await saveToLibraryAsync(state.fileUri);
      useToast.getState().show("Saved to Photos");
    } catch (e) { useToast.getState().show(e instanceof Error ? e.message : "Could not save to Photos."); }
  }
  async function onShare() {
    if (!state.fileUri) return;
    try { await Sharing.shareAsync(state.fileUri, { mimeType: "video/mp4", UTI: "public.mpeg-4" }); }
    catch (e) { useToast.getState().show(e instanceof Error ? e.message : "Could not share the video."); }
  }

  return (<><ExportScreenBody project={project} state={state} start={start} cancel={cancel} reset={reset} onSave={onSave} onShare={onShare} onDone={() => router.back()} /><ToastHost /></>);
}
