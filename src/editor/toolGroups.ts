import type { Ionicons } from "@expo/vector-icons";

export type IoniconName = keyof typeof Ionicons.glyphMap;
export type ToolGroupId = "edit" | "effects" | "text" | "stickers" | "audio";
export type ToolId = "split" | "trim" | "transform" | "animate" | "keyframe" | "crop" | "overlay" | "opacity" | "mask" | "blend" | "chroma" | "layerForward" | "layerBack" | "replace" | "reverse" | "freeze" | "duplicate" | "delete" | "select" | "ratio" | "cover" | "filter" | "adjust" | "effect" | "effectStrength" | "effectDuplicate" | "effectDelete" | "speed" | "transition" | "templates" | "background" | "text" | "captions" | "sticker" | "addAudio" | "volume" | "ducking" | "beats" | "audioVolume" | "audioFade" | "audioDuplicate" | "audioDelete";

/** The editor's bottom bar: five always-visible groups; the active group's tools show in the row above.
 *  `animate` and `keyframe` sit in Edit (the selected clip), Text (the selected text) and Stickers (the selected sticker).
 *  `selectedClipId` holds a main clip's or a layer's id: the clip tools act on either.
 *  `select` enters multi-select: the whole bar is then replaced by `MultiSelectBar` until the mode ends.
 *  The `effect*`, `audio*` and `layer*` ids are sub-row tools (shown for a selected effect / audio track / layer): they are in no group. */
export const TOOL_GROUPS: { id: ToolGroupId; label: string; icon: IoniconName; tools: ToolId[] }[] = [
  { id: "edit", label: "Edit", icon: "cut", tools: ["split", "trim", "transform", "animate", "keyframe", "crop", "overlay", "opacity", "mask", "blend", "chroma", "replace", "reverse", "freeze", "duplicate", "delete", "select", "ratio", "cover"] },
  { id: "effects", label: "Effects", icon: "sparkles", tools: ["filter", "adjust", "effect", "speed", "transition", "templates", "background"] },
  { id: "text", label: "Text", icon: "text", tools: ["text", "captions", "animate", "keyframe"] },
  { id: "stickers", label: "Stickers", icon: "happy", tools: ["sticker", "animate", "keyframe"] },
  { id: "audio", label: "Audio", icon: "musical-notes", tools: ["addAudio", "volume", "ducking", "beats"] },
];

/**
 * Which group a new selection should jump to; null leaves the user's current group alone.
 * A clip selection only pulls the user to Edit from the overlay groups (Text/Stickers); Edit, Effects
 * and Audio all act on the selected clip, so they stay put.
 */
export function groupForSelection(sel: { clipId: string | null; overlayKind: "text" | "caption" | "sticker" | null; effectId?: string | null; audioId?: string | null }, current: ToolGroupId): ToolGroupId | null {
  if (sel.effectId) return "effects";
  if (sel.audioId) return "audio";
  if (sel.overlayKind === "sticker") return "stickers";
  if (sel.overlayKind) return "text";
  if (sel.clipId && (current === "text" || current === "stickers")) return "edit";
  return null;
}
