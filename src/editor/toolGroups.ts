import type { Ionicons } from "@expo/vector-icons";
import type { ToolId } from "./toolbarContext";

export type IoniconName = keyof typeof Ionicons.glyphMap;

/**
 * What each tool button shows. Which bar a tool is on, and in which order, is decided by `contextFor` (toolbarContext.ts);
 * what it does, by the toolbar component.
 */
export const TOOL_META: Record<ToolId, { label: string; icon: IoniconName }> = {
  // The main bar.
  edit: { label: "Edit", icon: "film-outline" },
  audioMenu: { label: "Audio", icon: "musical-notes" },
  textMenu: { label: "Text", icon: "text" },
  sticker: { label: "Stickers", icon: "happy" },
  overlay: { label: "Overlay", icon: "layers" },
  effect: { label: "Effects", icon: "flash" },
  filter: { label: "Filter", icon: "color-filter" },
  adjust: { label: "Adjust", icon: "options" },
  ratio: { label: "Ratio", icon: "phone-portrait" },
  background: { label: "Background", icon: "color-palette" },
  cover: { label: "Cover", icon: "image-outline" },
  templates: { label: "Templates", icon: "color-wand" },
  // A clip or a layer.
  split: { label: "Split", icon: "cut" },
  trim: { label: "Trim", icon: "crop" },
  speed: { label: "Speed", icon: "speedometer" },
  volume: { label: "Volume", icon: "volume-high" },
  animate: { label: "Animate", icon: "play-forward-outline" },
  crop: { label: "Crop", icon: "crop" },
  transform: { label: "Transform", icon: "resize" },
  opacity: { label: "Opacity", icon: "contrast" },
  mask: { label: "Mask", icon: "ellipse-outline" },
  blend: { label: "Blend", icon: "layers-outline" },
  chroma: { label: "Green screen", icon: "leaf-outline" },
  keyframe: { label: "Keyframe", icon: "diamond-outline" },
  transition: { label: "Transition", icon: "swap-horizontal" },
  layerForward: { label: "Forward", icon: "arrow-up" },
  layerBack: { label: "Back", icon: "arrow-down" },
  replace: { label: "Replace", icon: "sync" },
  reverse: { label: "Reverse", icon: "play-back" },
  freeze: { label: "Freeze", icon: "snow" },
  duplicate: { label: "Duplicate", icon: "copy" },
  delete: { label: "Delete", icon: "trash" },
  select: { label: "Select", icon: "checkmark-done" },
  // A text, a caption or a sticker.
  overlayEdit: { label: "Edit", icon: "create-outline" },
  overlayDuplicate: { label: "Duplicate", icon: "copy" },
  overlayDelete: { label: "Delete", icon: "trash" },
  text: { label: "Add text", icon: "add-circle-outline" },
  captions: { label: "Captions", icon: "chatbox-ellipses" },
  // Audio.
  addAudio: { label: "Add audio", icon: "add-circle-outline" },
  ducking: { label: "Ducking", icon: "volume-low" },
  beats: { label: "Beats", icon: "pulse" },
  audioVolume: { label: "Volume", icon: "volume-medium" },
  audioFade: { label: "Fade", icon: "trending-up" },
  audioDuplicate: { label: "Duplicate", icon: "copy" },
  audioDelete: { label: "Delete", icon: "trash" },
  // An effect.
  effectStrength: { label: "Strength", icon: "speedometer" },
  effectDuplicate: { label: "Duplicate", icon: "copy" },
  effectDelete: { label: "Delete", icon: "trash" },
};
