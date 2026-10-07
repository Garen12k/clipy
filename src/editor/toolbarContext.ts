import { findItem } from "./model/timeline";
import { activePhotoMotion, isPhoto, type Project } from "./model/types";

export const TOOL_IDS = [
  "edit", "audioMenu", "textMenu", "sticker", "overlay", "effect", "filter", "adjust", "ratio", "background", "cover", "templates", "collage",
  "split", "trim", "speed", "volume", "animate", "motion", "crop", "transform", "opacity", "mask", "blend", "chroma", "keyframe", "transition",
  "layerForward", "layerBack", "replace", "reverse", "freeze", "duplicate", "delete", "select",
  "overlayEdit", "overlayDuplicate", "overlayDelete", "text", "captions",
  "addAudio", "ducking", "beats", "audioSplit", "audioVolume", "audioFade", "audioDuplicate", "audioDelete", "extractAudio", "voice", "soundQuality",
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
 * Motion (a photo without keyframes that is not a collage cell) and Keyframe (not while a photo's Motion plays) leave each other out for good, not for the moment.
 * Extract audio, Voice and Sound are on a video's bar exactly where Volume is (a clip that has sound); Voice and Sound are also on a sound's bar.
 * On a clip the last two first put the clip's sound on the audio row (EditorToolbar).
 * `sel.clipId` is a main clip's or a layer's id. An id that no longer exists counts as no selection.
 */
export function contextFor(sel: ToolbarSelection, p: Project): ToolbarContext {
  const hasClips = p.clips.length > 0;
  if (sel.effectId && p.effects.some((e) => e.id === sel.effectId)) return { bar: "effect", tools: ["effectStrength", "effectDuplicate", "effectDelete"] };
  if (sel.audioId && p.audioTracks.some((t) => t.id === sel.audioId)) return { bar: "audio", tools: keep([["audioSplit"], ["audioVolume"], ["audioFade"], ["voice"], ["soundQuality"], ["audioDuplicate"], ["audioDelete"], ["addAudio"], ["ducking"], ["beats", hasClips]]) };
  const overlay = sel.overlayId ? p.overlays.find((o) => o.id === sel.overlayId) : undefined;
  if (overlay) {
    if (overlay.kind === "caption") return { bar: "text", tools: ["overlayEdit", "captions", "overlayDuplicate", "overlayDelete", "text"] };
    const sticker = overlay.kind === "sticker";
    return { bar: sticker ? "sticker" : "text", tools: keep([["overlayEdit"], ["animate"], ["keyframe"], ["overlayDuplicate"], ["overlayDelete"], ["text", !sticker]]) };
  }
  const item = sel.clipId ? findItem(p, sel.clipId) : null;
  if (item) {
    const photo = isPhoto(item.clip);
    const video = !photo;
    const sounds = video && !item.clip.reversed;
    // Motion is a photo's own tool. Not with keyframes (they move it already), and not on a collage cell (it would grow over its neighbours).
    const motion = photo && item.clip.keyframes.length === 0 && !item.clip.collage;
    // One way of moving a photo at a time: no Keyframe while a Motion plays on it.
    const pins = activePhotoMotion(item.clip) === null;
    if (item.layer) {
      return { bar: "layer", tools: keep([["collage", !!item.clip.collage], ["trim"], ["speed", video], ["volume", sounds], ["extractAudio", sounds], ["voice", sounds], ["soundQuality", sounds], ["animate"], ["motion", motion], ["filter"], ["adjust"], ["crop"], ["transform"], ["opacity"], ["mask"],
        ["blend"], ["chroma"], ["keyframe", pins], ["layerForward"], ["layerBack"], ["replace"], ["reverse", video], ["duplicate"], ["delete"]]) };
    }
    const hasNext = p.clips.findIndex((c) => c.id === item.clip.id) < p.clips.length - 1;
    return { bar: "clip", tools: keep([["split"], ["trim"], ["select", p.clips.length >= 2], ["speed", video], ["volume", sounds], ["extractAudio", sounds], ["voice", sounds], ["soundQuality", sounds], ["animate"], ["motion", motion], ["filter"], ["adjust"], ["background"], ["templates"],
      ["crop"], ["transform"], ["opacity"], ["mask"], ["chroma"], ["keyframe", pins], ["transition", hasNext], ["replace"], ["reverse", video], ["freeze", video], ["duplicate"], ["delete"]]) };
  }
  if (sel.section === "audio") return { bar: "audio", tools: keep([["addAudio"], ["ducking"], ["beats", hasClips]]) };
  if (sel.section === "text" && hasClips) return { bar: "text", tools: ["text", "captions"] };
  return { bar: "main", tools: keep([["edit", hasClips], ["audioMenu"], ["textMenu", hasClips], ["sticker", hasClips], ["overlay", hasClips], ["collage", hasClips], ["effect"],
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
