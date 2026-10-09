import { create } from "zustand";
import * as VideoThumbnails from "expo-video-thumbnails";
import { insertFreezeFrame } from "@/src/editor/model/ops";
import { clipAt, clipStartTimes, freezeSourceTime } from "@/src/editor/model/timeline";
import { isPhoto } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { newId } from "@/src/lib/id";
import { storage } from "@/src/projects";
import { useToast } from "@/src/ui/Toast";

const useFreezeBusy = create<{ busy: boolean }>(() => ({ busy: false }));

/** Captures the frame at the playhead and inserts it as a still between the two halves of the selected video clip. */
export function useFreezeFrame(): { freeze(): Promise<void>; busy: boolean } {
  const busy = useFreezeBusy((s) => s.busy);

  const freeze = async () => {
    if (useFreezeBusy.getState().busy) return;
    const { project, selectedClipId, playhead } = useEditorStore.getState();
    if (!project || !selectedClipId) return;
    const hit = clipAt(project, playhead);
    if (!hit || hit.clip.id !== selectedClipId) { useToast.getState().show("Move the playhead onto the clip first."); return; }
    if (isPhoto(hit.clip)) return;
    const { clip, offsetInClip } = hit;
    const projectId = project.id;
    const outputTime = clipStartTimes(project)[hit.index] + offsetInClip;
    // Dry run first: a refusal (edge of the clip) must not leave a captured file behind.
    if (insertFreezeFrame(project, outputTime, { id: "dry-run", sourceUri: "", width: clip.width, height: clip.height }) === project) {
      useToast.getState().show("Move the playhead away from the clip's edge.");
      return;
    }
    useFreezeBusy.setState({ busy: true });
    try {
      const time = Math.max(0, Math.round(freezeSourceTime(clip, offsetInClip) * 1000));
      const frame = await VideoThumbnails.getThumbnailAsync(clip.sourceUri, { time, quality: 1 });
      const { uri } = await storage.saveStill(projectId, frame.uri);
      const store = useEditorStore.getState();
      if (store.project?.id !== projectId) return;
      const index = store.project.clips.findIndex((c) => c.id === clip.id);
      if (index < 0 || store.project.clips[index].sourceUri !== clip.sourceUri) return; // removed or Replaced meanwhile
      const id = newId();
      const next = insertFreezeFrame(store.project, clipStartTimes(store.project)[index] + offsetInClip, { id, sourceUri: uri, width: clip.width, height: clip.height });
      if (next === store.project) { useToast.getState().show("Couldn't capture that frame", { kind: "problem" }); return; }
      store.apply(() => next);
      store.select(id);
      store.seek(clipStartTimes(next)[next.clips.findIndex((c) => c.id === id)]);
    } catch (e) {
      console.warn(e);
      useToast.getState().show("Couldn't capture that frame", { kind: "problem" });
    } finally { useFreezeBusy.setState({ busy: false }); }
  };

  return { freeze, busy };
}
