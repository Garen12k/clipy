import * as MediaLibrary from "expo-media-library";
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

  async function onSave() {
    if (!state.fileUri) return;
    const perm = await MediaLibrary.requestPermissionsAsync(true);
    if (!perm.granted) { useToast.getState().show("Allow Photos access in Settings to save."); return; }
    await MediaLibrary.saveToLibraryAsync(state.fileUri);
    useToast.getState().show("Saved to Photos");
  }
  async function onShare() { if (state.fileUri) await Sharing.shareAsync(state.fileUri, { mimeType: "video/mp4", UTI: "public.mpeg-4" }); }

  return (<><ExportScreenBody project={project} state={state} start={start} cancel={cancel} reset={reset} onSave={onSave} onShare={onShare} onDone={() => router.back()} /><ToastHost /></>);
}
