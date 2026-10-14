import { router, useNavigation } from "expo-router";
import * as Sharing from "expo-sharing";
import { useEffect, useRef } from "react";
import { coverTimeOf, LAST_FRAME_SLACK } from "@/src/editor/model/timeline";
import { useEditorStore } from "@/src/editor/store";
import { ExportScreenBody } from "@/src/export/ExportScreenBody";
import { exportDuration } from "@/src/export/estimate";
import { useExportNotice } from "@/src/export/exportNotice";
import { INSTAGRAM_FAILED, openInInstagram, useInstagramInstalled } from "@/src/export/openInstagram";
import { saveVideoToPhotos } from "@/src/export/saveVideo";
import { useExport } from "@/src/export/useExport";
import { exportGesture } from "@/src/navigation/screenOptions";
import { isBackendConfigured } from "@/src/publish/supabase";
import { ToastHost, useToast } from "@/src/ui/Toast";

export default function ExportScreen() {
  const project = useEditorStore((s) => s.project);
  const missingSourceUris = useEditorStore((s) => s.missingSourceUris);
  const { state, start, cancel, reset } = useExport(project, missingSourceUris);
  // While the video renders the sheet cannot be swiped away (see exportGesture); Cancel is the way out.
  const navigation = useNavigation();
  useEffect(() => { navigation.setOptions(exportGesture(state.status)); }, [navigation, state.status]);
  // An export that finishes while the app is not in front says so with one local notification (where they are allowed).
  useExportNotice(state.status, project?.name ?? "");
  // Open Instagram is offered only while Instagram is installed (read when the video is done and when the app comes back).
  const instagram = useInstagramInstalled(state.status === "done");
  /** The asset this screen last put in Photos, by the file it was made from: Open Instagram reuses it rather than saving again. */
  const saved = useRef<{ uri: string; localIdentifier: string | null } | null>(null);
  const opening = useRef(false);
  if (!project) return null;

  /** Save to Photos (src/export/saveVideo.ts) with its words; answers the asset when it was saved. */
  async function save(): Promise<{ localIdentifier: string | null } | null> {
    const uri = state.fileUri;
    if (!uri) return null;
    try {
      const result = await saveVideoToPhotos(uri);
      if (!result.saved) { useToast.getState().show("Allow Photos access in Settings to save."); return null; }
      saved.current = { uri, localIdentifier: result.localIdentifier };
      useToast.getState().show("Saved to Photos");
      return result;
    } catch (e) { useToast.getState().show(e instanceof Error ? e.message : "Could not save to Photos."); return null; }
  }
  async function onSave() { await save(); }
  /** The video in Photos (saved now unless this screen already saved it), then Instagram opened on it. One run at a time. */
  async function onInstagram() {
    if (opening.current || !state.fileUri) return;
    opening.current = true;
    try {
      const asset = saved.current?.uri === state.fileUri ? saved.current : await save();
      if (!asset) return;
      if (!(await openInInstagram(asset.localIdentifier))) useToast.getState().show(INSTAGRAM_FAILED);
    } finally { opening.current = false; }
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
      // The cover frame as whole milliseconds, always inside the exported length: at the end it is the frame the cover
      // itself shows there (`frameAt` reads LAST_FRAME_SLACK before the end). No cover sends nothing.
      ...(project.cover ? { coverMs: String(Math.round(Math.min(coverTimeOf(project), Math.max(0, total - LAST_FRAME_SLACK)) * 1000)) } : {}),
    };
    router.dismiss();
    router.push({ pathname: "/post", params });
  }

  return (<><ExportScreenBody project={project} missingSourceUris={missingSourceUris} state={state} start={start} cancel={cancel} reset={reset}
    onSave={onSave} onShare={onShare} onDone={() => router.back()} onPost={isBackendConfigured() ? onPost : undefined}
    onInstagram={instagram ? onInstagram : undefined} /><ToastHost /></>);
}
