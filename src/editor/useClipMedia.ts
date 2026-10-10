import { create } from "zustand";
import { addCollage, collageRefusal, refitReplacedCell, type CollageRefusal } from "@/src/editor/model/collageOps";
import { addClips, addLayer, replaceClipMedia } from "@/src/editor/model/ops";
import { clipDuration, findItem, totalDuration } from "@/src/editor/model/timeline";
import { COLLAGE_CELLS, LAYER_LIMITS, newPhotoClip, newVideoClip, type Clip, type CollageLayoutId, type Project } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { rekeyStrip, useToolStrip } from "@/src/editor/toolStrip";
import { newId } from "@/src/lib/id";
import { storage } from "@/src/projects";
import { sourceMenuShown, takeOne, useMediaSource } from "@/src/projects/mediaSource";
import { pickMedia } from "@/src/projects/pickMedia";
import { useToast } from "@/src/ui/Toast";

/** One picker at a time, shared by the "+" tile, the Replace tool and the Overlay tool, so a double tap never opens a second pick. */
const useMediaBusy = create<{ busy: boolean }>(() => ({ busy: false }));

const LAYER_LIMIT = "You've reached the layer limit.";
const LAYER_OVERLAP = "Only two video layers can play at the same time.";
const TOO_SHORT = "That video is too short.";
/** A new layer shows for at least this long (seconds) before the video ends, where the video is long enough. */
const NEW_LAYER_ROOM = 2;

/**
 * Where a new layer starts: at the playhead, but never closer than NEW_LAYER_ROOM to the project's end (a layer starting at the end
 * would be invisible) — there it starts at `max(0, total − NEW_LAYER_ROOM)`.
 */
export function newLayerStart(p: Project, playhead: number): number {
  return Math.min(playhead, Math.max(0, totalDuration(p) - NEW_LAYER_ROOM));
}

async function withLock(run: () => Promise<void>, failMessage: string): Promise<void> {
  if (useMediaBusy.getState().busy) return;
  useMediaBusy.setState({ busy: true });
  try { await run(); }
  catch (e) { console.warn(e); useToast.getState().show(failMessage, { kind: "problem" }); }
  finally { useMediaBusy.setState({ busy: false }); }
}

type Media = Pick<Clip, "sourceUri" | "sourceDuration" | "width" | "height" | "kind">;

/**
 * Why `replaceClipMedia` refused. A main clip is only ever refused for a video too short to be a clip. A layer may also be refused by
 * the overlap rule (a photo layer becoming a video, or a longer one): that is the case when the same swap is accepted with the layer alone.
 */
function replaceRefusal(p: Project, id: string, media: Media): string {
  const layer = p.layers.find((l) => l.id === id);
  if (!layer) return TOO_SHORT;
  const alone = { ...p, layers: [layer] };
  return replaceClipMedia(alone, id, media) === alone ? TOO_SHORT : LAYER_OVERLAP;
}

/** Why `addLayer` refused this clip (called only when it did). */
function addLayerRefusal(p: Project, clip: Clip): string {
  if (p.layers.length >= LAYER_LIMITS.max) return LAYER_LIMIT;
  return clipDuration(clip) < LAYER_LIMITS.minDuration ? TOO_SHORT : LAYER_OVERLAP;
}

const ADD_FAILED = "Couldn't add those items.";
/** What the user is told when a collage is refused. `picked` = how many items were chosen, `free` = how many layers are left. */
function collageMessage(why: CollageRefusal, layout: CollageLayoutId, picked: number, free: number): string {
  const n = COLLAGE_CELLS[layout];
  switch (why) {
    case "count": return `This layout needs ${n} photos or videos — you picked ${picked}.`;
    case "limit": return `Not enough room: this layout adds ${n} layers and there is room for ${free}.`;
    case "videos": return `A collage can hold ${LAYER_LIMITS.maxVideoAtOnce} videos at most. Pick photos for the other cells.`;
    case "short": return TOO_SHORT;
    case "overlap": return LAYER_OVERLAP;
    default: return ADD_FAILED;
  }
}

/**
 * Adds picked photos and videos to the open project, swaps one clip's or layer's media, or puts one picked item on top as a layer.
 * Add and Replace leave the playhead and the selection alone; a new layer is selected.
 * A collage is n picked items placed in a layout's cells, the first one selected.
 */
export function useClipMedia(): { addMedia(): Promise<void>; replaceMedia(clipId: string): Promise<void>; addOverlay(): Promise<void>; makeCollage(layout: CollageLayoutId): Promise<void>; busy: boolean } {
  const busy = useMediaBusy((s) => s.busy);
  const { ask: askSource } = useMediaSource();

  // The "+" tile. Where the installed app can open the camera it asks first — the menu: Choose from Library / Take Photo or Video —
  // inside the lock, so nothing else starts meanwhile; one taken item is then added exactly as picked ones are. Without a camera
  // there is no menu: straight to the library, as ever.
  const addMedia = () => withLock(async () => {
    const projectId = useEditorStore.getState().project?.id;
    if (!projectId) return;
    const source = sourceMenuShown() ? await askSource() : "library";
    if (!source) return;
    const assets = source === "camera" ? await takeOne() : await pickMedia();
    if (!assets || assets.length === 0) return;
    const { clips } = await storage.importMedia(projectId, assets);
    const { project, apply } = useEditorStore.getState();
    if (project?.id !== projectId) return;   // the project was closed meanwhile: say nothing
    if (clips.length === 0) { useToast.getState().show("Couldn't add those items.", { kind: "problem" }); return; }
    apply((p) => addClips(p, clips));
    if (clips.length < assets.length) useToast.getState().show(`${clips.length} of ${assets.length} added`, { kind: "problem" });   // it reports the ones that failed: no Undo
  }, "Couldn't add those items.");

  /** `clipId`: a main clip's or a layer's id. */
  const replaceMedia = (clipId: string) => withLock(async () => {
    const projectId = useEditorStore.getState().project?.id;
    if (!projectId) return;
    const assets = await pickMedia({ multiple: false });
    if (!assets || assets.length === 0) return;
    const picked = assets[0];
    // Refuse before importing, so a video that cannot be used never gets copied into the project (placeholder uri for the check).
    const before = useEditorStore.getState().project;
    if (before?.id !== projectId || !findItem(before, clipId)) return;
    // A video with no duration is left to importMedia, which rejects it ("Couldn't replace the clip.").
    if (picked.kind === "video" && picked.durationSec > 0) {
      const probe = { sourceUri: picked.uri, kind: picked.kind, width: picked.width, height: picked.height, sourceDuration: picked.durationSec };
      if (replaceClipMedia(before, clipId, probe) === before) { useToast.getState().show(replaceRefusal(before, clipId, probe)); return; }
    }
    const { clips } = await storage.importMedia(projectId, [picked]);
    const media = clips[0];
    if (!media) { useToast.getState().show("Couldn't replace the clip.", { kind: "problem" }); return; }
    const { project, apply } = useEditorStore.getState();
    if (project?.id !== projectId || !findItem(project, clipId)) return;
    // Still checked after import: the imported duration is the authoritative one.
    if (replaceClipMedia(project, clipId, media) === project) { useToast.getState().show(replaceRefusal(project, clipId, media)); return; }
    // A collage cell that is in its place gets the new picture fitted to the cell, in the same undo step.
    apply((p) => refitReplacedCell(p, replaceClipMedia(p, clipId, media), clipId));
    useEditorStore.getState().select(clipId);
  }, "Couldn't replace the clip.");

  /** The Overlay tool: one picked photo or video becomes a layer starting at the playhead (as it was when the tool was pressed; see `newLayerStart`), selected. */
  const addOverlay = () => withLock(async () => {
    const pressed = useEditorStore.getState();
    const projectId = pressed.project?.id;
    if (!pressed.project || !projectId || pressed.project.clips.length === 0) return;
    const start = newLayerStart(pressed.project, pressed.playhead);
    if (pressed.project.layers.length >= LAYER_LIMITS.max) { useToast.getState().show(LAYER_LIMIT); return; }
    const assets = await pickMedia({ multiple: false });
    if (!assets || assets.length === 0) return;
    const picked = assets[0];
    // Refuse before importing, so a video that cannot be a layer there never gets copied into the project (placeholder clip for the check).
    const before = useEditorStore.getState().project;
    if (before?.id !== projectId) return;
    if (picked.kind === "video" && picked.durationSec > 0) {
      const probe = newVideoClip({ id: newId(), sourceUri: picked.uri, width: picked.width, height: picked.height, sourceDuration: picked.durationSec });
      if (addLayer(before, probe, start) === before) { useToast.getState().show(addLayerRefusal(before, probe)); return; }
    }
    const { clips } = await storage.importMedia(projectId, [picked]);
    const clip = clips[0];
    const { project, apply, select } = useEditorStore.getState();
    if (project?.id !== projectId || project.clips.length === 0) return;   // the project was closed (or emptied) meanwhile: say nothing
    if (!clip) { useToast.getState().show("Couldn't add that item.", { kind: "problem" }); return; }
    // Still checked after import: the imported duration is the authoritative one, and layers may have changed meanwhile.
    const next = addLayer(project, clip, start);
    if (next === project) { useToast.getState().show(addLayerRefusal(project, clip)); return; }
    apply(() => next);
    select(clip.id);
  }, "Couldn't add that item.");

  /**
   * The Collage tool: n picked photos / videos become the layout's cells, as layers starting at the playhead (as it was when the
   * layout was tapped; see `newLayerStart`). Refused with a toast before the picker (no layer room) or before anything is copied
   * (too few, too many videos, a third video on screen); a failed import adds nothing. One undo step; the first cell is selected and
   * the Collage panel, if still the open tool, is re-keyed onto it so it stays open on the new collage.
   */
  const makeCollage = (layout: CollageLayoutId) => withLock(async () => {
    const pressed = useEditorStore.getState();
    const projectId = pressed.project?.id;
    if (!pressed.project || !projectId || pressed.project.clips.length === 0) return;
    const n = COLLAGE_CELLS[layout];
    if (!n) return;   // a layout that does not exist: nothing to pick for
    const free = LAYER_LIMITS.max - pressed.project.layers.length;
    const tell = (why: CollageRefusal, picked: number) => { const message = collageMessage(why, layout, picked, free); useToast.getState().show(message, message === ADD_FAILED ? { kind: "problem" } : undefined); };
    if (free < n) { tell("limit", 0); return; }
    const start = newLayerStart(pressed.project, pressed.playhead);
    const assets = await pickMedia({ limit: n });
    if (!assets || assets.length === 0) return;
    const picked = assets.slice(0, n);
    const before = useEditorStore.getState().project;
    if (before?.id !== projectId) return;
    // Refuse before importing, so nothing that cannot be used is copied into the project (placeholder clips for the check). A video
    // with no duration is left to importMedia, which rejects it.
    if (picked.every((a) => a.kind === "photo" || a.durationSec > 0)) {
      const probes = picked.map((a) => (a.kind === "photo"
        ? newPhotoClip({ id: newId(), sourceUri: a.uri, width: a.width, height: a.height })
        : newVideoClip({ id: newId(), sourceUri: a.uri, width: a.width, height: a.height, sourceDuration: a.durationSec })));
      const why = collageRefusal(before, probes, layout, start);
      if (why) { tell(why, picked.length); return; }
    } else if (picked.length < n) { tell("count", picked.length); return; }
    const { clips } = await storage.importMedia(projectId, picked);
    const { project, apply, select } = useEditorStore.getState();
    if (project?.id !== projectId || project.clips.length === 0) return;   // the project was closed (or emptied) meanwhile: say nothing
    if (clips.length < n) { useToast.getState().show(ADD_FAILED, { kind: "problem" }); return; }
    // Still checked after import: the imported durations are the authoritative ones, and layers may have changed meanwhile.
    const next = addCollage(project, clips, layout, start, newId());
    if (next === project) { tell(collageRefusal(project, clips, layout, start) ?? "empty", clips.length); return; }
    apply(() => next);
    select(clips[0].id);
    // Only the Collage panel follows the selection: a tool opened meanwhile belongs to the item it was opened on.
    if (useToolStrip.getState().open?.id === "collage") rekeyStrip();
  }, ADD_FAILED);

  return { addMedia, replaceMedia, addOverlay, makeCollage, busy };
}
