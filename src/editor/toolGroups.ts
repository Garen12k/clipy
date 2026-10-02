import type { Ionicons } from "@expo/vector-icons";

type IoniconName = keyof typeof Ionicons.glyphMap;
export type ToolGroupId = "edit" | "effects" | "text" | "stickers" | "audio";
export type ToolId = "split" | "trim" | "duplicate" | "delete" | "ratio" | "filter" | "speed" | "transition" | "templates" | "text" | "captions" | "sticker" | "music" | "volume";

/** The editor's bottom bar: five always-visible groups; the active group's tools show in the row above. */
export const TOOL_GROUPS: { id: ToolGroupId; label: string; icon: IoniconName; tools: ToolId[] }[] = [
  { id: "edit", label: "Edit", icon: "cut", tools: ["split", "trim", "duplicate", "delete", "ratio"] },
  { id: "effects", label: "Effects", icon: "sparkles", tools: ["filter", "speed", "transition", "templates"] },
  { id: "text", label: "Text", icon: "text", tools: ["text", "captions"] },
  { id: "stickers", label: "Stickers", icon: "happy", tools: ["sticker"] },
  { id: "audio", label: "Audio", icon: "musical-notes", tools: ["music", "volume"] },
];

/** Which group a new selection should jump to; null leaves the user's last choice alone. */
export function groupForSelection(sel: { clipId: string | null; overlayKind: "text" | "caption" | "sticker" | null }): ToolGroupId | null {
  if (sel.overlayKind === "sticker") return "stickers";
  if (sel.overlayKind) return "text";
  return sel.clipId ? "edit" : null;
}
