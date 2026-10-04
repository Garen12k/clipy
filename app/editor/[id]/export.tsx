import { requestPermissionsAsync, saveToLibraryAsync } from "expo-media-library/legacy";
import { router } from "expo-router";
import * as Sharing from "expo-sharing";
import { coverTimeOf } from "@/src/editor/model/timeline";
import { useEditorStore } from "@/src/editor/store";
import { ExportScreenBody } from "@/src/export/ExportScreenBody";
import { exportDuration } from "@/src/export/estimate";
import { useExport } from "@/src/export/useExport";
import { isBackendConfigured } from "@/src/publish/supabase";
import { ToastHost, useToast } from "@/src/ui/Toast";

export default function ExportScreen() {
  const project = useEditorStore((s) => s.project);
  const missingSourceUris = useEditorStore((s) => s.missingSourceUris);
  const { state, start, cancel, reset } = useExport(project, missingSourceUris);
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

  // Close this modal first, then open Post as a normal screen on top of the editor: inside the modal, swiping the
  // sheet down would tear down an upload without the "Stop posting?" prompt. The exported file is not removed when
  // this screen closes (nothing deletes cache/exports), so the Post screen can still read it.
  function onPost() {
    if (!state.fileUri || !project) return;
    const total = exportDuration(project, missingSourceUris);
    const params = {
      fileUri: state.fileUri, durationSec: String(total), mimeType: "video/mp4", projectId: project.id, title: project.name,
      // The cover frame as whole milliseconds, never past the exported length; no cover sends nothing.
      ...(project.cover ? { coverMs: String(Math.round(Math.min(coverTimeOf(project), total) * 1000)) } : {}),
    };
    router.dismiss();
    router.push({ pathname: "/post", params });
  }

  return (<><ExportScreenBody project={project} missingSourceUris={missingSourceUris} state={state} start={start} cancel={cancel} reset={reset}
    onSave={onSave} onShare={onShare} onDone={() => router.back()} onPost={isBackendConfigured() ? onPost : undefined} /><ToastHost /></>);
}
