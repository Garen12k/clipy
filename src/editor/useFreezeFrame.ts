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
    useFreezeBusy.setState({ busy: true });
    try {
      const time = Math.max(0, Math.round(freezeSourceTime(clip, offsetInClip) * 1000));
      const frame = await VideoThumbnails.getThumbnailAsync(clip.sourceUri, { time, quality: 1 });
      const { uri } = await storage.saveStill(projectId, frame.uri);
      const store = useEditorStore.getState();
      if (store.project?.id !== projectId) return;
      const id = newId();
      const still = { id, sourceUri: uri, width: clip.width, height: clip.height };
      const index = store.project.clips.findIndex((c) => c.id === clip.id);
      if (index < 0) return;
      const outputTime = clipStartTimes(store.project)[index] + offsetInClip;
      if (insertFreezeFrame(store.project, outputTime, still) === store.project) { useToast.getState().show("Couldn't capture that frame"); return; }
      store.apply((p) => insertFreezeFrame(p, outputTime, still));
      const after = useEditorStore.getState();
      const at = after.project!.clips.findIndex((c) => c.id === id);
      store.select(id);
      store.seek(clipStartTimes(after.project!)[at]);
    } catch (e) {
      console.warn(e);
      useToast.getState().show("Couldn't capture that frame");
    } finally { useFreezeBusy.setState({ busy: false }); }
  };

  return { freeze, busy };
}
