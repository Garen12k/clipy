import type { Ionicons } from "@expo/vector-icons";

export type IoniconName = keyof typeof Ionicons.glyphMap;
export type ToolGroupId = "edit" | "effects" | "text" | "stickers" | "audio";
export type ToolId = "split" | "trim" | "transform" | "crop" | "replace" | "reverse" | "freeze" | "duplicate" | "delete" | "ratio" | "filter" | "adjust" | "effect" | "effectStrength" | "effectDuplicate" | "effectDelete" | "speed" | "transition" | "templates" | "background" | "text" | "captions" | "sticker" | "music" | "volume";

/** The editor's bottom bar: five always-visible groups; the active group's tools show in the row above. */
export const TOOL_GROUPS: { id: ToolGroupId; label: string; icon: IoniconName; tools: ToolId[] }[] = [
  { id: "edit", label: "Edit", icon: "cut", tools: ["split", "trim", "transform", "crop", "replace", "reverse", "freeze", "duplicate", "delete", "ratio"] },
  { id: "effects", label: "Effects", icon: "sparkles", tools: ["filter", "adjust", "effect", "speed", "transition", "templates", "background"] },
  { id: "text", label: "Text", icon: "text", tools: ["text", "captions"] },
  { id: "stickers", label: "Stickers", icon: "happy", tools: ["sticker"] },
  { id: "audio", label: "Audio", icon: "musical-notes", tools: ["music", "volume"] },
];

/**
 * Which group a new selection should jump to; null leaves the user's current group alone.
 * A clip selection only pulls the user to Edit from the overlay groups (Text/Stickers); Edit, Effects
 * and Audio all act on the selected clip, so they stay put.
 */
export function groupForSelection(sel: { clipId: string | null; overlayKind: "text" | "caption" | "sticker" | null; effectId?: string | null }, current: ToolGroupId): ToolGroupId | null {
  if (sel.effectId) return "effects";
  if (sel.overlayKind === "sticker") return "stickers";
  if (sel.overlayKind) return "text";
  if (sel.clipId && (current === "text" || current === "stickers")) return "edit";
  return null;
}
