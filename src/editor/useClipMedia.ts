import { create } from "zustand";
import { addClips, replaceClipMedia } from "@/src/editor/model/ops";
import { useEditorStore } from "@/src/editor/store";
import { storage } from "@/src/projects";
import { pickMedia } from "@/src/projects/pickMedia";
import { useToast } from "@/src/ui/Toast";

/** One picker at a time, shared by the "+" tile and the Replace tool, so a double tap never opens a second pick. */
const useMediaBusy = create<{ busy: boolean }>(() => ({ busy: false }));

async function withLock(run: () => Promise<void>, failMessage: string): Promise<void> {
  if (useMediaBusy.getState().busy) return;
  useMediaBusy.setState({ busy: true });
  try { await run(); }
  catch (e) { console.warn(e); useToast.getState().show(failMessage); }
  finally { useMediaBusy.setState({ busy: false }); }
}

/** Adds picked photos and videos to the open project, or swaps one clip's media. Playhead and selection are left alone. */
export function useClipMedia(): { addMedia(): Promise<void>; replaceMedia(clipId: string): Promise<void>; busy: boolean } {
  const busy = useMediaBusy((s) => s.busy);

  const addMedia = () => withLock(async () => {
    const projectId = useEditorStore.getState().project?.id;
    if (!projectId) return;
    const assets = await pickMedia();
    if (!assets || assets.length === 0) return;
    const { clips } = await storage.importMedia(projectId, assets);
    if (clips.length === 0) { useToast.getState().show("Couldn't add those items."); return; }
    const { project, apply } = useEditorStore.getState();
    if (project?.id !== projectId) return;
    apply((p) => addClips(p, clips));
    if (clips.length < assets.length) useToast.getState().show(`${clips.length} of ${assets.length} added`);
  }, "Couldn't add those items.");

  const replaceMedia = (clipId: string) => withLock(async () => {
    const projectId = useEditorStore.getState().project?.id;
    if (!projectId) return;
    const assets = await pickMedia({ multiple: false });
    if (!assets || assets.length === 0) return;
    const { clips } = await storage.importMedia(projectId, assets.slice(0, 1));
    const media = clips[0];
    if (!media) { useToast.getState().show("Couldn't replace the clip."); return; }
    const { project, apply } = useEditorStore.getState();
    if (project?.id !== projectId || !project.clips.some((c) => c.id === clipId)) return;
    if (replaceClipMedia(project, clipId, media) === project) { useToast.getState().show("That video is too short."); return; }
    apply((p) => replaceClipMedia(p, clipId, media));
    useEditorStore.getState().select(clipId);
  }, "Couldn't replace the clip.");

  return { addMedia, replaceMedia, busy };
}
