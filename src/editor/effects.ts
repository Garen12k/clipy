import type { AnimComboId, AnimInId, AnimLoopId, BlendId, EffectId, FilterId, ShapeId, SpeedCurveId, TextOverlay, TransitionType } from "./model/types";
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
  cover: { label: "Cover left" }, reveal: { label: "Reveal left" }, coverUp: { label: "Cover up" }, revealDown: { label: "Reveal down" },
  circleOpen: { label: "Circle open" }, circleClose: { label: "Circle close" }, wipeDiagonal: { label: "Diagonal wipe" }, wipeClock: { label: "Clock wipe" },
  pixelate: { label: "Pixelate" }, flashWhite: { label: "White flash" },
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
  blurBox:   { label: "Blur box",   icon: "scan-outline" },
  mosaicBox: { label: "Mosaic box", icon: "grid-outline" },
  filmBurn:  { label: "Film burn",  icon: "flame-outline" },
  lensFlare: { label: "Lens flare", icon: "aperture-outline" },
  dust:      { label: "Dust",       icon: "snow-outline" },
  heartbeat: { label: "Heartbeat",  icon: "fitness-outline" },
  hueShift:  { label: "Hue shift",  icon: "color-palette-outline" },
  mirror:    { label: "Mirror",     icon: "swap-horizontal-outline" },
  softEdges: { label: "Soft edges", icon: "ellipse-outline" },
  strobe:    { label: "Strobe",     icon: "flashlight-outline" },
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

/** 100×100 box, absolute M/L/C/Q/Z only (no arcs: the Swift parser has none) — copied verbatim into Effects.swift. Every subpath is clockwise; a hole is an inner subpath drawn counter-clockwise (neither side sets a fill rule). */
export const SHAPES: Record<ShapeId, { label: string; path: string }> = {
  circle:       { label: "Circle",  path: "M50 0 C77.6 0 100 22.4 100 50 C100 77.6 77.6 100 50 100 C22.4 100 0 77.6 0 50 C0 22.4 22.4 0 50 0 Z" },
  square:       { label: "Square",  path: "M0 0 L100 0 L100 100 L0 100 Z" },
  roundedBox:   { label: "Box",     path: "M20 0 L80 0 C91 0 100 9 100 20 L100 80 C100 91 91 100 80 100 L20 100 C9 100 0 91 0 80 L0 20 C0 9 9 0 20 0 Z" },
  arrow:        { label: "Arrow",   path: "M0 35 L60 35 L60 10 L100 50 L60 90 L60 65 L0 65 Z" },
  star:         { label: "Star",    path: "M50 0 L61 35 L98 35 L68 57 L79 91 L50 70 L21 91 L32 57 L2 35 L39 35 Z" },
  speechBubble: { label: "Bubble",  path: "M10 0 L90 0 C95.5 0 100 4.5 100 10 L100 60 C100 65.5 95.5 70 90 70 L40 70 L20 90 L25 70 L10 70 C4.5 70 0 65.5 0 60 L0 10 C0 4.5 4.5 0 10 0 Z" },
  heart:        { label: "Heart",   path: "M50 90 C20 65 0 50 0 30 C0 13 13 0 28 0 C38 0 46 6 50 14 C54 6 62 0 72 0 C87 0 100 13 100 30 C100 50 80 65 50 90 Z" },
  arrowCurved:   { label: "Curved arrow",  path: "M8 92 C8 52 30 30 62 30 L62 12 L96 42 L62 72 L62 54 C44 54 32 68 32 92 Z" },
  arrowDouble:   { label: "Two-way arrow", path: "M0 50 L28 18 L28 38 L72 38 L72 18 L100 50 L72 82 L72 62 L28 62 L28 82 Z" },
  bubbleRound:   { label: "Round bubble",   path: "M50 2 C77.6 2 100 19.9 100 42 C100 64.1 77.6 82 50 82 C46 82 42 81.6 38 80.9 L16 98 L22 75 C8.5 67.5 0 55.5 0 42 C0 19.9 22.4 2 50 2 Z" },
  bubbleSquare:  { label: "Sharp bubble",   path: "M0 0 L100 0 L100 70 L45 70 L22 96 L26 70 L0 70 Z" },
  bubbleThought: { label: "Thought bubble", path: "M26 66 C11 66 2 56 2 45 C2 35 9 27 19 25 C21 12 33 4 46 6 C54 0 68 0 76 8 C89 8 98 18 98 30 C98 37 95 43 90 47 C91 58 82 66 71 66 Z M24 72 C28.4 72 32 75.6 32 80 C32 84.4 28.4 88 24 88 C19.6 88 16 84.4 16 80 C16 75.6 19.6 72 24 72 Z M9 88 C11.8 88 14 90.2 14 93 C14 95.8 11.8 98 9 98 C6.2 98 4 95.8 4 93 C4 90.2 6.2 88 9 88 Z" },
  badgeSeal:     { label: "Seal badge",    path: "M50 0 L56.9 6.5 L65.5 2.4 L70 10.8 L79.4 9.5 L81.1 18.9 L90.5 20.6 L89.2 30 L97.6 34.5 L93.5 43.1 L100 50 L93.5 56.9 L97.6 65.5 L89.2 70 L90.5 79.4 L81.1 81.1 L79.4 90.5 L70 89.2 L65.5 97.6 L56.9 93.5 L50 100 L43.1 93.5 L34.5 97.6 L30 89.2 L20.6 90.5 L18.9 81.1 L9.5 79.4 L10.8 70 L2.4 65.5 L6.5 56.9 L0 50 L6.5 43.1 L2.4 34.5 L10.8 30 L9.5 20.6 L18.9 18.9 L20.6 9.5 L30 10.8 L34.5 2.4 L43.1 6.5 Z" },
  badgeRibbon:   { label: "Award ribbon",   path: "M50 0 C69.9 0 86 16.1 86 36 C86 55.9 69.9 72 50 72 C30.1 72 14 55.9 14 36 C14 16.1 30.1 0 50 0 Z M24 60 L44 70 L32 100 L26 86 L10 90 Z M76 60 L90 90 L74 86 L68 100 L56 70 Z" },
  banner:        { label: "Banner",  path: "M0 28 L100 28 L88 50 L100 72 L0 72 L12 50 Z" },
  sparkle:       { label: "Sparkle", path: "M50 0 Q56 44 100 50 Q56 56 50 100 Q44 56 0 50 Q44 44 50 0 Z" },
  burst:         { label: "Burst",   path: "M50 0 L57.8 21 L75 6.7 L71.2 28.8 L93.3 25 L79 42.2 L100 50 L79 57.8 L93.3 75 L71.2 71.2 L75 93.3 L57.8 79 L50 100 L42.2 79 L25 93.3 L28.8 71.2 L6.7 75 L21 57.8 L0 50 L21 42.2 L6.7 25 L28.8 28.8 L25 6.7 L42.2 21 Z" },
  frameRounded:  { label: "Frame",   path: "M16 0 L84 0 C92.8 0 100 7.2 100 16 L100 84 C100 92.8 92.8 100 84 100 L16 100 C7.2 100 0 92.8 0 84 L0 16 C0 7.2 7.2 0 16 0 Z M18 12 C14.7 12 12 14.7 12 18 L12 82 C12 85.3 14.7 88 18 88 L82 88 C85.3 88 88 85.3 88 82 L88 18 C88 14.7 85.3 12 82 12 Z" },
  ring:          { label: "Ring",    path: "M50 0 C77.6 0 100 22.4 100 50 C100 77.6 77.6 100 50 100 C22.4 100 0 77.6 0 50 C0 22.4 22.4 0 50 0 Z M50 14 C30.1 14 14 30.1 14 50 C14 69.9 30.1 86 50 86 C69.9 86 86 69.9 86 50 C86 30.1 69.9 14 50 14 Z" },
  brackets:      { label: "Corner marks", path: "M0 0 L30 0 L30 10 L10 10 L10 30 L0 30 Z M70 0 L100 0 L100 30 L90 30 L90 10 L70 10 Z M100 70 L100 100 L70 100 L70 90 L90 90 L90 70 Z M0 70 L10 70 L10 90 L30 90 L30 100 L0 100 Z" },
};

export const CAPTION_STYLE: Pick<TextOverlay, "fontId" | "fontScale" | "color" | "background" | "outline" | "align" | "x" | "y"> = {
  fontId: "montserrat", fontScale: 0.045, color: "#FFFFFF", background: { color: "#000000", opacity: 0.6 }, outline: false, align: "center", x: 0.5, y: 0.86,
};

export const STICKER_EMOJI_SCALE = 0.12;   // emoji font size = STICKER_EMOJI_SCALE × frameH × scale
export const STICKER_SHAPE_SCALE = 0.2;    // shape box      = STICKER_SHAPE_SCALE × frameH × scale

/** Layer blend modes (export only; the preview shows the picture untouched). */
export const BLENDS: Record<BlendId, { label: string }> = {
  normal: { label: "Normal" }, screen: { label: "Screen" }, multiply: { label: "Multiply" },
  overlay: { label: "Overlay" }, lighten: { label: "Lighten" }, darken: { label: "Darken" },
};
