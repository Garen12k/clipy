import type { Ionicons } from "@expo/vector-icons";
import type { ToolId } from "./toolbarContext";

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
  crop: { label: "Crop", icon: "crop-outline" },
  transform: { label: "Transform", icon: "resize-outline" },
  opacity: { label: "Opacity", icon: "contrast-outline" },
  mask: { label: "Mask", icon: "ellipse-outline" },
  blend: { label: "Blend", icon: "color-fill-outline" },
  chroma: { label: "Green screen", icon: "leaf-outline" },
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
  audioVolume: { label: "Volume", icon: "volume-medium-outline" },
  audioFade: { label: "Fade", icon: "trending-up-outline" },
  audioDuplicate: { label: "Duplicate", icon: "copy-outline" },
  audioDelete: { label: "Delete", icon: "trash-outline" },
  // An effect.
  effectStrength: { label: "Strength", icon: "speedometer-outline" },
  effectDuplicate: { label: "Duplicate", icon: "copy-outline" },
  effectDelete: { label: "Delete", icon: "trash-outline" },
};
