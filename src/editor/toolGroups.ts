import type { Ionicons } from "@expo/vector-icons";
import type { BarId, ToolId } from "./toolbarContext";

export type IoniconName = keyof typeof Ionicons.glyphMap;

/**
 * What each tool button shows. Which bar a tool is on, and in which order, is decided by `contextFor` (toolbarContext.ts);
 * what it does, by the toolbar component.
 * Icons are Ionicons outline names, one style for every tool.
 */
export const TOOL_META: Record<ToolId, { label: string; icon: IoniconName }> = {
  // The main bar.
  edit: { label: "Edit", icon: "film-outline" },
  audioMenu: { label: "Audio", icon: "musical-notes-outline" },
  textMenu: { label: "Text", icon: "text-outline" },
  sticker: { label: "Stickers", icon: "happy-outline" },
  overlay: { label: "Overlay", icon: "layers-outline" },
  collage: { label: "Collage", icon: "grid-outline" },
  effect: { label: "Effects", icon: "flash-outline" },
  filter: { label: "Filter", icon: "color-filter-outline" },
  adjust: { label: "Adjust", icon: "options-outline" },
  ratio: { label: "Ratio", icon: "phone-portrait-outline" },
  background: { label: "Background", icon: "color-palette-outline" },
  cover: { label: "Cover", icon: "image-outline" },
  templates: { label: "Templates", icon: "color-wand-outline" },
  // A clip or a layer.
  split: { label: "Split", icon: "cut-outline" },
  trim: { label: "Trim", icon: "code-outline" },
  speed: { label: "Speed", icon: "speedometer-outline" },
  volume: { label: "Volume", icon: "volume-high-outline" },
  animate: { label: "Animate", icon: "sparkles-outline" },
  motion: { label: "Motion", icon: "move-outline" },
  crop: { label: "Crop", icon: "crop-outline" },
  transform: { label: "Transform", icon: "resize-outline" },
  opacity: { label: "Opacity", icon: "contrast-outline" },
  mask: { label: "Mask", icon: "ellipse-outline" },
  blend: { label: "Blend", icon: "color-fill-outline" },
  chroma: { label: "Green screen", icon: "leaf-outline" },
  cutout: { label: "Cut out", icon: "body-outline" },
  stabilize: { label: "Stabilize", icon: "hand-left-outline" },
  keyframe: { label: "Keyframe", icon: "diamond-outline" },
  transition: { label: "Transition", icon: "swap-horizontal-outline" },
  layerForward: { label: "Forward", icon: "arrow-up-outline" },
  layerBack: { label: "Back", icon: "arrow-down-outline" },
  replace: { label: "Replace", icon: "sync-outline" },
  reverse: { label: "Reverse", icon: "play-back-outline" },
  freeze: { label: "Freeze", icon: "snow-outline" },
  duplicate: { label: "Duplicate", icon: "copy-outline" },
  delete: { label: "Delete", icon: "trash-outline" },
  select: { label: "Select", icon: "checkmark-done-outline" },
  // A text, a caption or a sticker.
  overlayEdit: { label: "Edit", icon: "create-outline" },
  overlayDuplicate: { label: "Duplicate", icon: "copy-outline" },
  overlayDelete: { label: "Delete", icon: "trash-outline" },
  text: { label: "Add text", icon: "add-circle-outline" },
  captions: { label: "Captions", icon: "chatbox-ellipses-outline" },
  // Audio.
  addAudio: { label: "Add audio", icon: "add-circle-outline" },
  ducking: { label: "Ducking", icon: "volume-low-outline" },
  beats: { label: "Beats", icon: "pulse-outline" },
  audioSplit: { label: "Split", icon: "cut-outline" },   // the clip Split's glyph: the same action, and the two are never on one bar
  audioVolume: { label: "Volume", icon: "volume-medium-outline" },
  audioFade: { label: "Fade", icon: "trending-up-outline" },
  audioDuplicate: { label: "Duplicate", icon: "copy-outline" },
  audioDelete: { label: "Delete", icon: "trash-outline" },
  extractAudio: { label: "Extract audio", icon: "git-branch-outline" },
  voice: { label: "Voice", icon: "mic-outline" },
  soundQuality: { label: "Sound", icon: "stats-chart-outline" },
  // An effect.
  effectStrength: { label: "Strength", icon: "speedometer-outline" },
  effectDuplicate: { label: "Duplicate", icon: "copy-outline" },
  effectDelete: { label: "Delete", icon: "trash-outline" },
};

/** The five groups a long bar is split into, in the order the chooser shows them. The first one is where a new selection starts. */
export const GROUPS = [
  { id: "basics", label: "Basics", icon: "apps-outline" },
  { id: "edit", label: "Edit", icon: "construct-outline" },
  { id: "audio", label: "Audio", icon: "musical-notes-outline" },
  { id: "look", label: "Look", icon: "brush-outline" },
  { id: "frame", label: "Frame", icon: "scan-outline" },
] as const satisfies readonly { id: string; label: string; icon: IoniconName }[];
export type GroupId = (typeof GROUPS)[number]["id"];
export type ToolGroup<T extends string = ToolId> = { id: GroupId; label: string; icon: IoniconName; tools: T[] };

/** Which group a tool is shown in. A tool that is not named here is in the FIRST group, so a new tool can never be hidden. */
const GROUP_OF: Partial<Record<ToolId, GroupId>> = {
  split: "basics", trim: "basics", speed: "basics", volume: "basics", filter: "basics", cutout: "basics", stabilize: "basics", select: "basics",
  transition: "edit", keyframe: "edit", duplicate: "edit", replace: "edit", reverse: "edit", freeze: "edit", layerForward: "edit", layerBack: "edit", collage: "edit",
  extractAudio: "audio", voice: "audio", soundQuality: "audio",
  adjust: "look", templates: "look", animate: "look", motion: "look",
  crop: "frame", transform: "frame", opacity: "frame", mask: "frame", blend: "frame", background: "frame", chroma: "frame",
};
/** The Delete of each bar: pinned at the bar's trailing edge, outside the groups and outside the scrolling row. */
const PINNED: readonly string[] = ["delete", "overlayDelete", "audioDelete", "effectDelete"] satisfies ToolId[];
/** A bar with more tools than this (its Delete not counted) is shown in groups. */
export const FLAT_LIMIT = 7;

export const groupOf = (id: string): GroupId => (GROUP_OF as Record<string, GroupId | undefined>)[id] ?? GROUPS[0].id;

/** The bar's Delete (null when it has none) and every other tool, in the order given. */
export function pinTools<T extends string>(tools: readonly T[]): { pinned: T | null; rest: T[] } {
  return { pinned: tools.find((t) => PINNED.includes(t)) ?? null, rest: tools.filter((t) => !PINNED.includes(t)) };
}

/** The tools split into the groups, each keeping the order given; a group without a tool is left out. */
export function groupTools<T extends string>(tools: readonly T[]): ToolGroup<T>[] {
  return GROUPS.map((g) => ({ ...g, tools: tools.filter((t) => groupOf(t) === g.id) })).filter((g) => g.tools.length > 0);
}

/**
 * How a bar is laid out — presentation only: WHICH tools there are, and in which order, is `contextFor`'s list, passed in.
 * `groups` is null for a flat row: the main bar (as it always was), a sound's bar (its own order, Volume and Fade first) and every
 * bar of `FLAT_LIMIT` tools or fewer beside its Delete.
 */
export function barLayout<T extends string>(bar: BarId, tools: readonly T[]): { pinned: T | null; rest: T[]; groups: ToolGroup<T>[] | null } {
  const { pinned, rest } = pinTools(tools);
  const flat = bar === "main" || bar === "audio" || rest.length <= FLAT_LIMIT;
  return { pinned, rest, groups: flat ? null : groupTools(rest) };
}
