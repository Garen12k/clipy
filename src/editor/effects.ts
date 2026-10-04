import type { AnimComboId, AnimInId, AnimLoopId, EffectId, FilterId, ShapeId, SpeedCurveId, TextOverlay, TransitionType } from "./model/types";
import type { IoniconName } from "./toolGroups";

export interface FilterPreview { tint: string; tintOpacity: number; saturation: number; brightness: number }
/** Preview approximations only. The real Core Image recipes live in modules/clipy-video/ios/Effects.swift, keyed by the same ids. */
export const FILTERS: Record<FilterId, { label: string; preview: FilterPreview }> = {
  none:    { label: "None",    preview: { tint: "#000000", tintOpacity: 0,    saturation: 1,   brightness: 0 } },
  warm:    { label: "Warm",    preview: { tint: "#FF9A3C", tintOpacity: 0.14, saturation: 1.1, brightness: 0.02 } },
  cool:    { label: "Cool",    preview: { tint: "#3C8CFF", tintOpacity: 0.14, saturation: 1.0, brightness: 0 } },
  vivid:   { label: "Vivid",   preview: { tint: "#FF2D7A", tintOpacity: 0.06, saturation: 1.4, brightness: 0.03 } },
  faded:   { label: "Faded",   preview: { tint: "#FFFFFF", tintOpacity: 0.12, saturation: 0.7, brightness: 0.08 } },
  mono:    { label: "Mono",    preview: { tint: "#000000", tintOpacity: 0,    saturation: 0,   brightness: 0 } },
  noir:    { label: "Noir",    preview: { tint: "#000000", tintOpacity: 0.18, saturation: 0,   brightness: -0.08 } },
  vintage: { label: "Vintage", preview: { tint: "#C8A05A", tintOpacity: 0.22, saturation: 0.6, brightness: -0.03 } },
  sunset:  { label: "Sunset",  preview: { tint: "#FF8A3C", tintOpacity: 0.2,  saturation: 1.2, brightness: 0 } },
  golden:  { label: "Golden",  preview: { tint: "#FFC857", tintOpacity: 0.18, saturation: 1.05, brightness: 0.04 } },
  teal:    { label: "Teal",    preview: { tint: "#2EC4B6", tintOpacity: 0.16, saturation: 1.1, brightness: 0 } },
  pastel:  { label: "Pastel",  preview: { tint: "#FFFFFF", tintOpacity: 0.1,  saturation: 0.8, brightness: 0.06 } },
  film:    { label: "Film",    preview: { tint: "#E8A86A", tintOpacity: 0.12, saturation: 1.1, brightness: 0 } },
  chrome:  { label: "Chrome",  preview: { tint: "#000000", tintOpacity: 0,    saturation: 1.3, brightness: 0 } },
  instant: { label: "Instant", preview: { tint: "#F2D9A0", tintOpacity: 0.14, saturation: 0.9, brightness: 0.04 } },
  process: { label: "Process", preview: { tint: "#3C8CFF", tintOpacity: 0.1,  saturation: 1.1, brightness: 0 } },
  tonal:   { label: "Tonal",   preview: { tint: "#000000", tintOpacity: 0,    saturation: 0,   brightness: 0 } },
  sepia:   { label: "Sepia",   preview: { tint: "#C8A05A", tintOpacity: 0.3,  saturation: 0,   brightness: 0 } },
  crisp:   { label: "Crisp",   preview: { tint: "#000000", tintOpacity: 0,    saturation: 1.05, brightness: 0 } },
  dream:   { label: "Dream",   preview: { tint: "#FFFFFF", tintOpacity: 0.08, saturation: 1.1, brightness: 0.03 } },
};

export const TRANSITIONS: Record<TransitionType, { label: string }> = {
  none: { label: "None" }, fade: { label: "Fade" }, dissolve: { label: "Dissolve" }, slide: { label: "Slide left" }, zoom: { label: "Zoom" },
  slideRight: { label: "Slide right" }, slideUp: { label: "Slide up" }, slideDown: { label: "Slide down" },
  wipe: { label: "Wipe" }, spin: { label: "Spin" }, blur: { label: "Blur" },
};

/** Timeline effects. The preview can only approximate them; the real look is Swift's. */
export const EFFECTS: Record<EffectId, { label: string; icon: IoniconName }> = {
  glitch:    { label: "Glitch",     icon: "git-compare-outline" },
  shake:     { label: "Shake",      icon: "phone-portrait-outline" },
  zoomPulse: { label: "Zoom pulse", icon: "expand-outline" },
  blur:      { label: "Blur",       icon: "water-outline" },
  vhs:       { label: "VHS",        icon: "videocam-outline" },
  lightLeak: { label: "Light leak", icon: "sunny-outline" },
  flash:     { label: "Flash",      icon: "flash-outline" },
  rgbSplit:  { label: "RGB split",  icon: "layers-outline" },
  oldFilm:   { label: "Old film",   icon: "film-outline" },
  glow:      { label: "Glow",       icon: "bulb-outline" },
};

/** Entry / exit animations (clips, text, stickers). The motion maths lives in model/motion.ts. */
export const ANIM_IN: Record<AnimInId, { label: string; icon: IoniconName }> = {
  fade:       { label: "Fade",        icon: "contrast-outline" },
  slideLeft:  { label: "Slide left",  icon: "arrow-back-outline" },
  slideRight: { label: "Slide right", icon: "arrow-forward-outline" },
  slideUp:    { label: "Slide up",    icon: "arrow-up-outline" },
  slideDown:  { label: "Slide down",  icon: "arrow-down-outline" },
  zoomIn:     { label: "Zoom in",     icon: "add-circle-outline" },
  zoomOut:    { label: "Zoom out",    icon: "remove-circle-outline" },
  spin:       { label: "Spin",        icon: "sync-outline" },
  pop:        { label: "Pop",         icon: "sparkles-outline" },
  rise:       { label: "Rise",        icon: "trending-up-outline" },
};
/** Whole-clip animations (clips only). */
export const ANIM_COMBO: Record<AnimComboId, { label: string; icon: IoniconName }> = {
  zoomInSlow:  { label: "Slow zoom in",  icon: "expand-outline" },
  zoomOutSlow: { label: "Slow zoom out", icon: "contract-outline" },
  panLeft:     { label: "Pan left",      icon: "arrow-back-circle-outline" },
  panRight:    { label: "Pan right",     icon: "arrow-forward-circle-outline" },
  sway:        { label: "Sway",          icon: "swap-horizontal-outline" },
  pulse:       { label: "Pulse",         icon: "pulse-outline" },
};
/** Looping animations (text and stickers only). */
export const ANIM_LOOP: Record<AnimLoopId, { label: string; icon: IoniconName }> = {
  wiggle: { label: "Wiggle", icon: "musical-notes-outline" },
  pulse:  { label: "Pulse",  icon: "heart-outline" },
  spin:   { label: "Spin",   icon: "refresh-outline" },
  float:  { label: "Float",  icon: "cloud-outline" },
  blink:  { label: "Blink",  icon: "eye-outline" },
  shake:  { label: "Shake",  icon: "phone-portrait-outline" },
};

/** Speed-curve presets: eight speeds for eight equal slices of the clip's trimmed source range (model/timeline.ts `curveSteps` writes the steps). */
export const SPEED_CURVES: Record<SpeedCurveId, { label: string; shape: readonly number[] }> = {
  montage:  { label: "Montage",   shape: [2.5, 2.5, 0.5, 2.5, 2.5, 0.5, 2.5, 2.5] },
  hero:     { label: "Hero",      shape: [1, 2, 3, 0.5, 0.5, 3, 2, 1] },
  bullet:   { label: "Bullet",    shape: [3.5, 3.5, 3.5, 0.3, 0.3, 3.5, 3.5, 3.5] },
  jumpCut:  { label: "Jump cut",  shape: [1, 4, 1, 4, 1, 4, 1, 4] },
  flashIn:  { label: "Flash in",  shape: [4, 3, 2, 1.5, 1, 1, 1, 1] },
  flashOut: { label: "Flash out", shape: [1, 1, 1, 1, 1.5, 2, 3, 4] },
};

/** 100×100 box, absolute M/L/C/Q/Z only — copied verbatim into Effects.swift. */
export const SHAPES: Record<ShapeId, { label: string; path: string }> = {
  circle:       { label: "Circle",  path: "M50 0 C77.6 0 100 22.4 100 50 C100 77.6 77.6 100 50 100 C22.4 100 0 77.6 0 50 C0 22.4 22.4 0 50 0 Z" },
  square:       { label: "Square",  path: "M0 0 L100 0 L100 100 L0 100 Z" },
  roundedBox:   { label: "Box",     path: "M20 0 L80 0 C91 0 100 9 100 20 L100 80 C100 91 91 100 80 100 L20 100 C9 100 0 91 0 80 L0 20 C0 9 9 0 20 0 Z" },
  arrow:        { label: "Arrow",   path: "M0 35 L60 35 L60 10 L100 50 L60 90 L60 65 L0 65 Z" },
  star:         { label: "Star",    path: "M50 0 L61 35 L98 35 L68 57 L79 91 L50 70 L21 91 L32 57 L2 35 L39 35 Z" },
  speechBubble: { label: "Bubble",  path: "M10 0 L90 0 C95.5 0 100 4.5 100 10 L100 60 C100 65.5 95.5 70 90 70 L40 70 L20 90 L25 70 L10 70 C4.5 70 0 65.5 0 60 L0 10 C0 4.5 4.5 0 10 0 Z" },
  heart:        { label: "Heart",   path: "M50 90 C20 65 0 50 0 30 C0 13 13 0 28 0 C38 0 46 6 50 14 C54 6 62 0 72 0 C87 0 100 13 100 30 C100 50 80 65 50 90 Z" },
};

export const CAPTION_STYLE: Pick<TextOverlay, "fontId" | "fontScale" | "color" | "background" | "outline" | "align" | "x" | "y"> = {
  fontId: "montserrat", fontScale: 0.045, color: "#FFFFFF", background: { color: "#000000", opacity: 0.6 }, outline: false, align: "center", x: 0.5, y: 0.86,
};

export const STICKER_EMOJI_SCALE = 0.12;   // emoji font size = STICKER_EMOJI_SCALE × frameH × scale
export const STICKER_SHAPE_SCALE = 0.2;    // shape box      = STICKER_SHAPE_SCALE × frameH × scale
