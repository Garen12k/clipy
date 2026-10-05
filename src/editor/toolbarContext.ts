import { findItem } from "./model/timeline";
import { isPhoto, type Project } from "./model/types";

export const TOOL_IDS = [
  "edit", "audioMenu", "textMenu", "sticker", "overlay", "effect", "filter", "adjust", "ratio", "background", "cover", "templates",
  "split", "trim", "speed", "volume", "animate", "crop", "transform", "opacity", "mask", "blend", "chroma", "keyframe", "transition",
  "layerForward", "layerBack", "replace", "reverse", "freeze", "duplicate", "delete", "select",
  "overlayEdit", "overlayDuplicate", "overlayDelete", "text", "captions",
  "addAudio", "ducking", "beats", "audioSplit", "audioVolume", "audioFade", "audioDuplicate", "audioDelete",
  "effectStrength", "effectDuplicate", "effectDelete",
] as const;
export type ToolId = (typeof TOOL_IDS)[number];
export type BarId = "main" | "clip" | "layer" | "text" | "sticker" | "audio" | "effect";
export type Section = "audio" | "text" | null;
export type ToolbarSelection = { clipId: string | null; overlayId: string | null; effectId: string | null; audioId: string | null; section: Section };
export type ToolbarContext = { bar: BarId; tools: ToolId[] };
export type SelectionState = { selectedClipId: string | null; selectedOverlayId: string | null; selectedEffectId: string | null; selectedAudioId: string | null; multiSelect: string[] | null };

/** Keeps the tools whose condition holds (a missing condition = always). */
const keep = (list: [ToolId, boolean?][]): ToolId[] => list.filter(([, ok]) => ok !== false).map(([id]) => id);

/**
 * Which bar the editor shows and which tools are on it, in order. Pure: the toolbar component only renders this.
 * A tool that cannot be used for the selection for a lasting reason is left out (never returned and greyed). Where the playhead is
 * is not a lasting reason: Keyframe and a sound's Split are always listed, and the toolbar turns them off for the moment.
 * `sel.clipId` is a main clip's or a layer's id. An id that no longer exists counts as no selection.
 */
export function contextFor(sel: ToolbarSelection, p: Project): ToolbarContext {
  const hasClips = p.clips.length > 0;
  if (sel.effectId && p.effects.some((e) => e.id === sel.effectId)) return { bar: "effect", tools: ["effectStrength", "effectDuplicate", "effectDelete"] };
  if (sel.audioId && p.audioTracks.some((t) => t.id === sel.audioId)) return { bar: "audio", tools: keep([["audioSplit"], ["audioVolume"], ["audioFade"], ["audioDuplicate"], ["audioDelete"], ["addAudio"], ["ducking"], ["beats", hasClips]]) };
  const overlay = sel.overlayId ? p.overlays.find((o) => o.id === sel.overlayId) : undefined;
  if (overlay) {
    if (overlay.kind === "caption") return { bar: "text", tools: ["overlayEdit", "captions", "overlayDuplicate", "overlayDelete", "text"] };
    const sticker = overlay.kind === "sticker";
    return { bar: sticker ? "sticker" : "text", tools: keep([["overlayEdit"], ["animate"], ["keyframe"], ["overlayDuplicate"], ["overlayDelete"], ["text", !sticker]]) };
  }
  const item = sel.clipId ? findItem(p, sel.clipId) : null;
  if (item) {
    const video = !isPhoto(item.clip);
    const sounds = video && !item.clip.reversed;
    if (item.layer) {
      return { bar: "layer", tools: keep([["trim"], ["speed", video], ["volume", sounds], ["animate"], ["filter"], ["adjust"], ["crop"], ["transform"], ["opacity"], ["mask"],
        ["blend"], ["chroma"], ["keyframe"], ["layerForward"], ["layerBack"], ["replace"], ["reverse", video], ["duplicate"], ["delete"]]) };
    }
    const hasNext = p.clips.findIndex((c) => c.id === item.clip.id) < p.clips.length - 1;
    return { bar: "clip", tools: keep([["split"], ["trim"], ["select", p.clips.length >= 2], ["speed", video], ["volume", sounds], ["animate"], ["filter"], ["adjust"], ["background"], ["templates"],
      ["crop"], ["transform"], ["opacity"], ["mask"], ["chroma"], ["keyframe"], ["transition", hasNext], ["replace"], ["reverse", video], ["freeze", video], ["duplicate"], ["delete"]]) };
  }
  if (sel.section === "audio") return { bar: "audio", tools: keep([["addAudio"], ["ducking"], ["beats", hasClips]]) };
  if (sel.section === "text" && hasClips) return { bar: "text", tools: ["text", "captions"] };
  return { bar: "main", tools: keep([["edit", hasClips], ["audioMenu"], ["textMenu", hasClips], ["sticker", hasClips], ["overlay", hasClips], ["effect"],
    ["filter", hasClips], ["adjust", hasClips], ["ratio"], ["background", hasClips], ["cover", hasClips], ["templates", hasClips]]) };
}

/** The identity of what is selected. A strip remembers it when it opens and closes when it changes. */
export function selectionKey(s: SelectionState): string {
  if (s.multiSelect !== null) return "multi";
  if (s.selectedEffectId) return `effect:${s.selectedEffectId}`;
  if (s.selectedAudioId) return `audio:${s.selectedAudioId}`;
  if (s.selectedOverlayId) return `overlay:${s.selectedOverlayId}`;
  if (s.selectedClipId) return `clip:${s.selectedClipId}`;
  return "none";
}
