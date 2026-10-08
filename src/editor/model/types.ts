/** In the menu's order. `auto` = the shape of the project's first main clip (see `frameAspect`). */
export const ASPECT_RATIOS = ["auto", "1:1", "3:2", "2:3", "16:9", "9:16", "4:3", "3:4", "21:9"] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];
export type FixedAspectRatio = Exclude<AspectRatio, "auto">;
/** What a new project starts with (the creation picker's preselection). */
export const DEFAULT_ASPECT_RATIO: AspectRatio = "auto";
/** An unknown stored ratio, and `auto` without a usable first clip. */
export const FALLBACK_ASPECT_RATIO: FixedAspectRatio = "9:16";
/** The narrowest and the widest frame `auto` may give (width / height): 9:21 … 21:9. */
export const ASPECT_LIMITS = [9 / 21, 21 / 9] as const;
export const isAspectRatio = (v: unknown): v is AspectRatio => (ASPECT_RATIOS as readonly unknown[]).includes(v);
export const aspectLabel = (r: AspectRatio): string => (r === "auto" ? "Auto" : r);
export const MIN_CLIP_SECONDS = 0.1;

export const SCHEMA_VERSION = 18 as const;
export const EXPORT_FPS = [24, 30, 60] as const;
export type ExportFps = (typeof EXPORT_FPS)[number];
export const EXPORT_QUALITIES = ["high", "small"] as const;
export type ExportQuality = (typeof EXPORT_QUALITIES)[number];
export interface ExportSettings { fps: ExportFps; quality: ExportQuality }
export const DEFAULT_EXPORT_SETTINGS: ExportSettings = { fps: 30, quality: "high" };
export interface Cover { time: number; title: string }   // project seconds; title may be ""
export const COVER_LIMITS = { titleMax: 40 };
export const POST_PLATFORMS = ["youtube", "tiktok", "instagram", "facebook", "x"] as const;
export type PostPlatform = (typeof POST_PLATFORMS)[number];
export const PLATFORM_LABELS: Record<PostPlatform, string> = { youtube: "YouTube", tiktok: "TikTok", instagram: "Instagram", facebook: "Facebook", x: "X" };
export interface PostRecord { platform: PostPlatform; url: string | null; postedAt: string }
export const FONT_IDS = ["bangers", "anton", "oswald", "montserrat", "pacifico", "permanentMarker", "lobster", "roboto",
  "bebasNeue", "poppins", "playfair", "fredoka", "caveat", "pressStart", "righteous", "dancingScript"] as const;
export type FontId = (typeof FONT_IDS)[number];
export type Align = "left" | "center" | "right";
export const OVERLAY_LIMITS = { fontScale: [0.02, 0.25] as const, scale: [0.2, 5] as const, minDuration: 0.2 };
export const AUDIO_KINDS = ["music", "voice", "sfx"] as const;
export type AudioKind = (typeof AUDIO_KINDS)[number];
export const AUDIO_LIMITS = { minDuration: 0.5, volume: [0, 2] as const, maxTracks: 12, fade: [0, 5] as const, sfxMinDuration: 0.1 };
/** Music gain while a voice track is audible; seconds to ramp down / up. */
export const DUCKING = { level: 0.3, ramp: 0.3 };
export const BEAT_LIMITS = { max: 300, minGap: 0.05 };
export const minAudioDuration = (kind: AudioKind): number => (kind === "sfx" ? AUDIO_LIMITS.sfxMinDuration : AUDIO_LIMITS.minDuration);
export const CLIP_VOLUME = [0, 2] as const;

/** The voices of the Voice tool, in the panel's order. The numbers behind each are `VOICE_TABLE` in sound.ts. */
export const VOICE_IDS = ["deep", "high", "chipmunk", "robot", "echo", "hall", "telephone"] as const;
export type VoiceId = (typeof VOICE_IDS)[number];
/** The equaliser presets of the Sound tool, in the strip's order (`EQ_TABLE` in sound.ts). */
export const EQ_IDS = ["bassBoost", "clearVoice", "warm", "bright"] as const;
export type EqId = (typeof EQ_IDS)[number];
/**
 * How an audio track is changed before it is mixed. `voice` null = none; `strength` 0–1, gentle … strong; `pitch` whole semitones
 * (added to the voice's own); `eq` null = none; `level` = Even out loudness. The file is never changed: a copy is rendered from these.
 */
export interface SoundSettings { voice: VoiceId | null; strength: number; pitch: number; eq: EqId | null; level: boolean }
export const SOUND_LIMITS = { strength: [0, 1] as const, defaultStrength: 0.5, pitch: [-12, 12] as const };
/** The sound as recorded. Never stored: a track without changes has NO `sound` key. */
export const NO_SOUND: SoundSettings = { voice: null, strength: SOUND_LIMITS.defaultStrength, pitch: 0, eq: null, level: false };
export const isNeutralSound = (s: SoundSettings): boolean => s.voice === null && s.pitch === 0 && s.eq === null && !s.level;

export const FILTER_IDS = ["none", "warm", "cool", "vivid", "faded", "mono", "noir", "vintage",
  "sunset", "golden", "teal", "pastel", "film", "chrome", "instant", "process", "tonal", "sepia", "crisp", "dream",
  "kodak", "fuji", "matte", "bleach", "dusk", "moody", "tealOrange", "blush", "grit", "silver", "indigo", "drama"] as const;
export type FilterId = (typeof FILTER_IDS)[number];
export const TRANSITION_TYPES = ["none", "fade", "dissolve", "slide", "zoom",
  "slideRight", "slideUp", "slideDown", "wipe", "spin", "blur",   // "slide" keeps its id and is labelled "Slide left"
  "cover", "reveal", "coverUp", "revealDown", "circleOpen", "circleClose", "wipeDiagonal", "wipeClock", "pixelate", "flashWhite"] as const;
export type TransitionType = (typeof TRANSITION_TYPES)[number];
export const SHAPE_IDS = ["circle", "square", "roundedBox", "arrow", "star", "speechBubble", "heart",
  "arrowCurved", "arrowDouble", "bubbleRound", "bubbleSquare", "bubbleThought", "badgeSeal", "badgeRibbon", "banner",
  "sparkle", "burst", "frameRounded", "ring", "brackets"] as const;
export type ShapeId = (typeof SHAPE_IDS)[number];
export const SPEED_LIMITS = [0.25, 4] as const;
export const TRANSITION_LIMITS = { min: 0.3, max: 1.0 };

export const SPEED_CURVE_IDS = ["montage", "hero", "bullet", "jumpCut", "flashIn", "flashOut"] as const;
export type SpeedCurveId = (typeof SPEED_CURVE_IDS)[number];
/** `from` = source seconds where this step starts; it runs to the next step's `from`. Sorted by `from`. */
export interface SpeedStep { from: number; speed: number }
export interface SpeedCurve { id: SpeedCurveId; steps: SpeedStep[] }
/** A preset is `slices` equal steps; a stored curve holds at most `maxSteps`; a step shorter than `minStep` source seconds is dropped. */
export const SPEED_CURVE_LIMITS = { slices: 8, maxSteps: 64, minStep: 0.01 };

export const MASK_IDS = ["none", "rounded", "circle"] as const;
export type MaskId = (typeof MASK_IDS)[number];
export const LAYER_LIMITS = { max: 8, maxVideoAtOnce: 2, defaultScale: 0.4, minDuration: 0.3 };
export const MASK = { roundedRadius: 0.12 };   // corner radius as a fraction of the picture box's shorter side

export const BLEND_IDS = ["normal", "screen", "multiply", "overlay", "lighten", "darken"] as const;
export type BlendId = (typeof BLEND_IDS)[number];
export interface ChromaKey { color: string; strength: number }   // #RRGGBB, 0–1
export const CHROMA = { hueBase: 12, hueRange: 48, soft: 10, minSat: 0.25, minVal: 0.2, defaultStrength: 0.5, cube: 32 } as const;
export const CHROMA_PRESETS = ["#00FF00", "#0000FF"] as const;   // green, blue

export const CLIP_KINDS = ["video", "photo"] as const;
export type ClipKind = (typeof CLIP_KINDS)[number];
export interface ClipTransform { scale: number; x: number; y: number; rotation: number; flipH: boolean; flipV: boolean }
export interface CropRect { x: number; y: number; w: number; h: number }
export type ClipBackground = { type: "black" } | { type: "color"; color: string } | { type: "blur" };
export const DEFAULT_TRANSFORM: ClipTransform = { scale: 1, x: 0, y: 0, rotation: 0, flipH: false, flipV: false };
export const FULL_CROP: CropRect = { x: 0, y: 0, w: 1, h: 1 };
export const BLACK_BACKGROUND: ClipBackground = { type: "black" };
export const TRANSFORM_LIMITS = { scale: [0.2, 5] as const, offset: [-1, 1] as const };
export const CROP_MIN = 0.1;
export const PHOTO = { defaultSeconds: 3, minSeconds: 0.5, maxSeconds: 60, freezeSeconds: 2 };

export const ADJUST_KEYS = ["brightness", "contrast", "saturation", "exposure", "temperature", "tint",
  "highlights", "shadows", "sharpen", "vignette", "fade", "grain"] as const;
export type AdjustKey = (typeof ADJUST_KEYS)[number];
export type ClipAdjust = Record<AdjustKey, number>;
/** Two-sided keys run −1…1, one-sided keys 0…1; 0 always means "no change". */
export const ADJUST_RANGE: Record<AdjustKey, readonly [number, number]> = {
  brightness: [-1, 1], contrast: [-1, 1], saturation: [-1, 1], exposure: [-1, 1], temperature: [-1, 1], tint: [-1, 1],
  highlights: [-1, 1], shadows: [-1, 1], sharpen: [0, 1], vignette: [0, 1], fade: [0, 1], grain: [0, 1],
};
export const DEFAULT_ADJUST: ClipAdjust = {
  brightness: 0, contrast: 0, saturation: 0, exposure: 0, temperature: 0, tint: 0,
  highlights: 0, shadows: 0, sharpen: 0, vignette: 0, fade: 0, grain: 0,
};

export const EFFECT_IDS = ["glitch", "shake", "zoomPulse", "blur", "vhs", "lightLeak", "flash", "rgbSplit", "oldFilm", "glow", "blurBox", "mosaicBox",
  "filmBurn", "lensFlare", "dust", "heartbeat", "hueShift", "mirror", "softEdges", "strobe"] as const;
export type EffectId = (typeof EFFECT_IDS)[number];
/** Fractions of the frame, top-left origin. */
export interface EffectRect { x: number; y: number; w: number; h: number }
export const REGION_LIMITS = { min: 0.05, default: { x: 0.3, y: 0.4, w: 0.4, h: 0.2 } };
export const isRegionEffect = (t: EffectId): boolean => t === "blurBox" || t === "mosaicBox";
export interface EffectItem {
  id: string; type: EffectId; start: number; end: number; intensity: number;   // project time, seconds; intensity 0…1
  rect: EffectRect | null;   // non-null exactly for blurBox / mosaicBox
}
export const EFFECT_LIMITS = { minDuration: 0.2, defaultDuration: 2, defaultIntensity: 0.7 };
/** Seconds of slack at the project's end: an effect starting this close to it (or after it) cannot be reached, and one this short is not exported. */
export const EFFECT_END_SLACK = 0.05;

export const ANIM_IN_IDS = ["fade", "slideLeft", "slideRight", "slideUp", "slideDown", "zoomIn", "zoomOut", "spin", "pop", "rise"] as const;
export type AnimInId = (typeof ANIM_IN_IDS)[number];          // Out animations use the same ids
export const ANIM_COMBO_IDS = ["zoomInSlow", "zoomOutSlow", "panLeft", "panRight", "sway", "pulse"] as const;   // clips only
export type AnimComboId = (typeof ANIM_COMBO_IDS)[number];
export const ANIM_LOOP_IDS = ["wiggle", "pulse", "spin", "float", "blink", "shake"] as const;                    // text / stickers only
export type AnimLoopId = (typeof ANIM_LOOP_IDS)[number];
export const ANIM_LIMITS = { minDuration: 0.1, maxDuration: 2, defaultDuration: 0.5 };

export interface AnimEdge { id: AnimInId; duration: number }
export interface ClipAnimation { in: AnimEdge | null; out: AnimEdge | null; combo: AnimComboId | null }      // combo set ⇒ in and out are null
export interface OverlayAnimation { in: AnimEdge | null; out: AnimEdge | null; loop: AnimLoopId | null }
export const NO_CLIP_ANIMATION: ClipAnimation = { in: null, out: null, combo: null };
export const NO_OVERLAY_ANIMATION: OverlayAnimation = { in: null, out: null, loop: null };

/** A slow zoom or pan over a photo's whole length (the Motion tool). The maths is `photoMotionDelta` in motion.ts. */
export const PHOTO_MOTION_IDS = ["zoomIn", "zoomOut", "panLeft", "panRight", "panUp", "panDown", "zoomCorner"] as const;
export type PhotoMotionId = (typeof PHOTO_MOTION_IDS)[number];
/** `strength` 0–1, gentle … strong; 0.5 moves as far as the older zoom / pan Combos do. */
export interface PhotoMotion { id: PhotoMotionId; strength: number }
export const PHOTO_MOTION_LIMITS = { strength: [0, 1] as const, defaultStrength: 0.5 };
/** The Combos the Motion tool took over for photos, and the motion each one is shown as there. */
export const COMBO_AS_MOTION: Partial<Record<AnimComboId, PhotoMotionId>> = { zoomInSlow: "zoomIn", zoomOutSlow: "zoomOut", panLeft: "panLeft", panRight: "panRight" };

/** Collage layouts, in the panel's order; how many cells each has. The rectangles are `collageCells` in collage.ts. */
export const COLLAGE_LAYOUT_IDS = ["sideBySide", "stacked", "bigTwo", "row3", "grid4", "inset"] as const;
export type CollageLayoutId = (typeof COLLAGE_LAYOUT_IDS)[number];
export const COLLAGE_CELLS: Record<CollageLayoutId, number> = { sideBySide: 2, stacked: 2, bigTwo: 3, row3: 3, grid4: 4, inset: 2 };
/** Square, Rounded, Round — the three masks there are (`CORNER_MASK[corner]`). */
export const COLLAGE_CORNERS = [0, 1, 2] as const;
export type CollageCorner = (typeof COLLAGE_CORNERS)[number];
export const CORNER_MASK: readonly MaskId[] = ["none", "rounded", "circle"];
/** `border` is a fraction of the frame's SHORTER side. */
export const COLLAGE_LIMITS = { border: [0, 0.06] as const, borderStep: 0.005 };
/**
 * What makes a layer a collage cell: which collage (`group`), which layout and cell, and the border, corner and frame shape
 * (`aspect` = width / height) it was last laid out with. Only collage.ts / collageOps.ts write it.
 */
export interface CollageCell { group: string; layout: CollageLayoutId; cell: number; border: number; corner: CollageCorner; aspect: number }

/** One pin. Clips: `t` is SOURCE time (seconds in the file; for a photo, seconds from its start) so a pin stays on its picture
 *  through trim, split and speed changes. Overlays: `t` is seconds from the overlay's start. */
export interface Keyframe { t: number; x: number; y: number; scale: number; rotation: number; opacity: number }
export const KEYFRAME_LIMITS = { minGap: 0.05, max: 50, opacity: [0, 1] as const };
/** Two pin times closer than `minGap` are the same pin. The 1e-9 makes pins exactly `minGap` apart distinct despite float noise (0.15 − 0.1 < 0.05). */
export const isSamePinTime = (a: number, b: number): boolean => Math.abs(a - b) < KEYFRAME_LIMITS.minGap - 1e-9;

export interface Clip {
  id: string; sourceUri: string; sourceDuration: number; width: number; height: number;
  trimStart: number; trimEnd: number;
  speed: number;                 // 0.25–4
  filter: FilterId | null;
  volume: number;   // 0–2
  muted: boolean;
  transitionOut: { type: TransitionType; duration: number };
  kind: ClipKind;
  transform: ClipTransform;
  crop: CropRect;
  background: ClipBackground;
  reversed: boolean;
  filterIntensity: number;       // 0–1, default 1
  adjust: ClipAdjust;            // default all 0
  animation: ClipAnimation;      // default none
  keyframes: Keyframe[];         // sorted by t (SOURCE seconds); default []
  speedCurve: SpeedCurve | null; // default null; photos always null; a curve means `speed` is 1 (model/timeline.ts does the maths)
  fadeIn: number;                // seconds of OUTPUT time, 0–5; photos always 0
  fadeOut: number;               // same
  opacity: number;               // 0–1, default 1
  mask: MaskId;                  // default "none"
  blend: BlendId;                // default "normal"; layers only — main clips are always "normal"
  chroma: ChromaKey | null;      // default null; layers and main clips
  motion?: PhotoMotion;          // photos only; ABSENT = still (never null / undefined). Read it through `activePhotoMotion` / `shownPhotoMotion`
  collage?: CollageCell;         // layers only; ABSENT = not a collage cell
}
/** A layer is a clip with a place on the project timeline. */
export interface LayerClip extends Clip { start: number }   // project seconds
export const isPhoto = (c: Clip) => c.kind === "photo";
/**
 * The Motion that PLAYS on a clip: a photo's stored motion, unless a Combo owns the clip or keyframes move it (the ops keep the three
 * apart; this is the rule the preview and the export both go by should a file hold two). Never a video.
 */
export const activePhotoMotion = (c: Clip): PhotoMotion | null =>
  (c.kind === "photo" && c.motion && c.animation.combo === null && c.keyframes.length === 0 ? c.motion : null);
/** What the Motion tool shows as selected: the motion that plays, else an older zoom / pan Combo as its twin at the default strength. */
export function shownPhotoMotion(c: Clip): PhotoMotion | null {
  const active = activePhotoMotion(c);
  if (active) return active;
  const twin = c.kind === "photo" && c.animation.combo !== null ? COMBO_AS_MOTION[c.animation.combo] : undefined;
  return twin ? { id: twin, strength: PHOTO_MOTION_LIMITS.defaultStrength } : null;
}

/** Rotation in degrees, wrapped into (−180, 180]. */
export function normaliseRotation(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  const m = ((deg % 360) + 360) % 360;   // [0, 360)
  return m > 180 ? m - 360 : m;
}
/** A finite number clamped to 0–1; anything else → 1. */
export const clampOpacity = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1);
/** A `#RRGGBB` key with strength clamped to 0–1 (non-finite → the default); anything else → null. The colour string is kept as given. */
export function clampChroma(v: unknown): ChromaKey | null {
  if (!isRec(v) || !isHexColor(v.color)) return null;
  return { color: v.color, strength: isNum(v.strength) ? clampNum(v.strength, 0, 1) : CHROMA.defaultStrength };
}
/** Sides in [REGION_LIMITS.min, 1], origin inside the frame; invalid → a fresh copy of the default. Values are not rounded. */
export function clampEffectRect(v: unknown): EffectRect {
  if (!isRec(v) || !isNum(v.x) || !isNum(v.y) || !isNum(v.w) || !isNum(v.h)) return { ...REGION_LIMITS.default };
  const w = clampNum(v.w, REGION_LIMITS.min, 1);
  const h = clampNum(v.h, REGION_LIMITS.min, 1);
  return { x: clampNum(v.x, 0, 1 - w), y: clampNum(v.y, 0, 1 - h), w, h };
}
/** Known fps and quality or the defaults; always a fresh object, unknown keys dropped. */
export function clampExportSettings(v: unknown): ExportSettings {
  const r = isRec(v) ? v : {};
  return {
    fps: (EXPORT_FPS as readonly unknown[]).includes(r.fps) ? (r.fps as ExportFps) : DEFAULT_EXPORT_SETTINGS.fps,
    quality: (EXPORT_QUALITIES as readonly unknown[]).includes(r.quality) ? (r.quality as ExportQuality) : DEFAULT_EXPORT_SETTINGS.quality,
  };
}
/** Not a string → ""; trimmed, cut to COVER_LIMITS.titleMax whole characters (code points), trimmed again so a cut leaves no trailing space. */
export const clampCoverTitle = (v: unknown): string =>
  (typeof v === "string" ? Array.from(v.trim()).slice(0, COVER_LIMITS.titleMax).join("").trim() : "");
/**
 * `total` = the project's length in seconds. The time is rounded to the millisecond, then clamped to the project's last WHOLE
 * millisecond (a bound like 7.0004 would be rounded away on the next pass): one pass is final.
 */
export function clampCover(v: unknown, total: number): Cover | null {
  if (!isRec(v) || !isNum(v.time)) return null;
  const end = isNum(total) ? Math.max(0, Math.floor(total * 1000) / 1000) : 0;
  return { time: clampNum(Math.round(v.time * 1000) / 1000, 0, end), title: clampCoverTitle(v.title) };
}
export const clampNum = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const finiteOr = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);

/** Every key present, in range; missing / non-finite → 0; unknown keys dropped. */
export function clampAdjust(a: Partial<ClipAdjust> | undefined): ClipAdjust {
  const out = { ...DEFAULT_ADJUST };
  for (const k of ADJUST_KEYS) {
    const [lo, hi] = ADJUST_RANGE[k];
    out[k] = clampNum(finiteOr(a?.[k], 0), lo, hi);
  }
  return out;
}
export const isNeutralAdjust = (a: ClipAdjust) => ADJUST_KEYS.every((k) => a[k] === 0);

export function clampTransform(t: ClipTransform): ClipTransform {
  const [sMin, sMax] = TRANSFORM_LIMITS.scale;
  const [oMin, oMax] = TRANSFORM_LIMITS.offset;
  return {
    scale: clampNum(finiteOr(t.scale, DEFAULT_TRANSFORM.scale), sMin, sMax),
    x: clampNum(finiteOr(t.x, DEFAULT_TRANSFORM.x), oMin, oMax),
    y: clampNum(finiteOr(t.y, DEFAULT_TRANSFORM.y), oMin, oMax),
    rotation: normaliseRotation(finiteOr(t.rotation, DEFAULT_TRANSFORM.rotation)),
    flipH: t.flipH === true, flipV: t.flipV === true,
  };
}

/** Keeps the rect inside the 0–1 frame with both sides >= CROP_MIN; a non-finite rect becomes the full frame. */
export function clampCrop(c: CropRect): CropRect {
  if (![c?.x, c?.y, c?.w, c?.h].every((v) => typeof v === "number" && Number.isFinite(v))) return { ...FULL_CROP };
  const w = clampNum(c.w, CROP_MIN, 1);
  const h = clampNum(c.h, CROP_MIN, 1);
  return { x: clampNum(c.x, 0, 1 - w), y: clampNum(c.y, 0, 1 - h), w, h };
}

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Unknown id / non-object → null; a missing or non-finite duration → the default, otherwise clamped to ANIM_LIMITS. */
export function clampAnimEdge(e: unknown): AnimEdge | null {
  if (!isRec(e) || !(ANIM_IN_IDS as readonly unknown[]).includes(e.id)) return null;
  const duration = isNum(e.duration) ? clampNum(e.duration, ANIM_LIMITS.minDuration, ANIM_LIMITS.maxDuration) : ANIM_LIMITS.defaultDuration;
  return { id: e.id as AnimInId, duration };
}
/** A combo owns the whole clip, so it forces in / out to null. */
export function clampClipAnimation(a: unknown): ClipAnimation {
  if (!isRec(a)) return { ...NO_CLIP_ANIMATION };
  const combo = (ANIM_COMBO_IDS as readonly unknown[]).includes(a.combo) ? (a.combo as AnimComboId) : null;
  if (combo) return { in: null, out: null, combo };
  return { in: clampAnimEdge(a.in), out: clampAnimEdge(a.out), combo: null };
}
export function clampOverlayAnimation(a: unknown): OverlayAnimation {
  if (!isRec(a)) return { ...NO_OVERLAY_ANIMATION };
  const loop = (ANIM_LOOP_IDS as readonly unknown[]).includes(a.loop) ? (a.loop as AnimLoopId) : null;
  return { in: clampAnimEdge(a.in), out: clampAnimEdge(a.out), loop };
}
/** A known motion with its strength clamped to 0–1 (not a number → the default); anything else → null. Unknown keys dropped. */
export function clampPhotoMotion(v: unknown): PhotoMotion | null {
  if (!isRec(v) || !(PHOTO_MOTION_IDS as readonly unknown[]).includes(v.id)) return null;
  const [lo, hi] = PHOTO_MOTION_LIMITS.strength;
  return { id: v.id as PhotoMotionId, strength: isNum(v.strength) ? clampNum(v.strength, lo, hi) : PHOTO_MOTION_LIMITS.defaultStrength };
}
/** A usable collage tag (border clamped, an unknown corner → square) or null: no group, an unknown layout, a cell outside it, no usable frame shape. */
export function clampCollageCell(v: unknown): CollageCell | null {
  if (!isRec(v) || typeof v.group !== "string" || v.group.length === 0 || !(COLLAGE_LAYOUT_IDS as readonly unknown[]).includes(v.layout)) return null;
  const layout = v.layout as CollageLayoutId;
  if (!isNum(v.cell) || !Number.isInteger(v.cell) || v.cell < 0 || v.cell >= COLLAGE_CELLS[layout]) return null;
  if (!isNum(v.aspect) || v.aspect <= 0) return null;
  const [lo, hi] = COLLAGE_LIMITS.border;
  return {
    group: v.group, layout, cell: v.cell, border: isNum(v.border) ? clampNum(v.border, lo, hi) : 0,
    corner: (COLLAGE_CORNERS as readonly unknown[]).includes(v.corner) ? (v.corner as CollageCorner) : 0, aspect: v.aspect,
  };
}

type KeyframeLimits = { x: readonly [number, number]; y: readonly [number, number]; scale: readonly [number, number] };
function clampKeyframes(k: unknown, lim: KeyframeLimits): Keyframe[] {
  if (!Array.isArray(k)) return [];
  const clean: Keyframe[] = [];
  for (const e of k) {
    if (!isRec(e) || !(["t", "x", "y", "scale", "rotation", "opacity"] as const).every((f) => isNum(e[f]))) continue;
    clean.push({
      t: Math.max(0, e.t as number), x: clampNum(e.x as number, lim.x[0], lim.x[1]), y: clampNum(e.y as number, lim.y[0], lim.y[1]),
      scale: clampNum(e.scale as number, lim.scale[0], lim.scale[1]), rotation: e.rotation as number,
      opacity: clampNum(e.opacity as number, KEYFRAME_LIMITS.opacity[0], KEYFRAME_LIMITS.opacity[1]),
    });
  }
  clean.sort((a, b) => a.t - b.t);
  const out: Keyframe[] = [];
  for (const e of clean) {
    if (out.length > 0 && isSamePinTime(e.t, out[out.length - 1].t)) continue;
    out.push(e);
    if (out.length === KEYFRAME_LIMITS.max) break;
  }
  return out;
}
/** Clip units (TRANSFORM_LIMITS). Rotation is NOT normalised: a pin may hold 350 or 720 so a full turn can be keyframed. */
export const clampClipKeyframes = (k: unknown): Keyframe[] =>
  clampKeyframes(k, { x: TRANSFORM_LIMITS.offset, y: TRANSFORM_LIMITS.offset, scale: TRANSFORM_LIMITS.scale });
/** Overlay units: x, y are fractions of the frame. */
export const clampOverlayKeyframes = (k: unknown): Keyframe[] =>
  clampKeyframes(k, { x: [0, 1], y: [0, 1], scale: OVERLAY_LIMITS.scale });
export function makeKeyframe(partial: Partial<Keyframe> & Pick<Keyframe, "t">): Keyframe {
  return { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, ...partial };
}

/**
 * A safe curve or none: unknown id / junk / no usable step / photo → null. Steps need a finite `from` and speed (speed clamped to
 * SPEED_LIMITS), are sorted by `from`, a step shorter than `minStep` is dropped (the last step runs on, so it always stays) and only
 * the first `maxSteps` are kept. Idempotent.
 */
export function clampSpeedCurve(v: unknown, clip: { kind: ClipKind }): SpeedCurve | null {
  if (clip.kind === "photo" || !isRec(v) || !(SPEED_CURVE_IDS as readonly unknown[]).includes(v.id) || !Array.isArray(v.steps)) return null;
  const clean: SpeedStep[] = [];
  for (const e of v.steps) {
    if (!isRec(e) || !isNum(e.from) || !isNum(e.speed)) continue;
    clean.push({ from: e.from, speed: clampNum(e.speed, SPEED_LIMITS[0], SPEED_LIMITS[1]) });
  }
  clean.sort((a, b) => a.from - b.from);
  const steps: SpeedStep[] = [];
  for (const e of clean) {
    // The 1e-9 keeps a step of exactly `minStep` despite float noise (2.01 − 2 < 0.01).
    if (steps.length > 0 && e.from - steps[steps.length - 1].from < SPEED_CURVE_LIMITS.minStep - 1e-9) steps[steps.length - 1] = e;
    else steps.push(e);
  }
  if (steps.length === 0) return null;
  return { id: v.id as SpeedCurveId, steps: steps.slice(0, SPEED_CURVE_LIMITS.maxSteps) };
}

export interface TextShadow { color: string; opacity: number; distance: number; blur: number }   // distance, blur: fractions of the font size
export interface TextGlow { color: string; size: number }                                         // size: fraction of the font size
/** The corners of a text's background box. */
export const BOX_CORNERS = ["rounded", "square"] as const;
export type BoxCorner = (typeof BOX_CORNERS)[number];
export interface TextStyle {
  opacity: number;              // 0–1, default 1
  letterSpacing: number;        // −0.05…0.3 of the font size, default 0
  lineSpacing: number;          // 0.8…2 × the normal line height, default 1
  outlineColor: string | null;  // null = automatic contrast colour
  outlineWidth: number;         // 0.5…3 × the base outline width, default 1
  shadow: TextShadow | null;    // default null
  glow: TextGlow | null;        // default null
  boxPadding: number;           // 0…0.6 of the font size between the text and the edge of its background box; default 0.25 (every box before v15)
  boxCorner: BoxCorner;         // default "rounded" (every box before v15)
}
export const DEFAULT_TEXT_STYLE: TextStyle = { opacity: 1, letterSpacing: 0, lineSpacing: 1, outlineColor: null, outlineWidth: 1, shadow: null, glow: null, boxPadding: 0.25, boxCorner: "rounded" };
export const TEXT_STYLE_LIMITS = { opacity: [0, 1], letterSpacing: [-0.05, 0.3], lineSpacing: [0.8, 2], outlineWidth: [0.5, 3],
  shadowOpacity: [0, 1], shadowDistance: [0, 0.3], shadowBlur: [0, 0.5], glowSize: [0.05, 0.6], boxPadding: [0, 0.6] } as const;
export const DEFAULT_SHADOW: TextShadow = { color: "#000000", opacity: 0.6, distance: 0.06, blur: 0.1 };
export const DEFAULT_GLOW: TextGlow = { color: "#FFFFFF", size: 0.25 };
export interface CaptionWord { text: string; start: number; end: number }   // seconds from the caption's start

export const isHexColor = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);

/** Every field present and in range; non-finite / missing numbers → the default, bad colours → the default (outlineColor: null). Idempotent, unknown keys dropped. The box fields: padding clamped, corner one of BOX_CORNERS (else the default) — a style stored before v15 gets the box it always had. */
export function clampTextStyle(v: unknown): TextStyle {
  const s = isRec(v) ? v : {};
  const L = TEXT_STYLE_LIMITS;
  const num = (x: unknown, d: number, r: readonly [number, number]) => clampNum(isNum(x) ? x : d, r[0], r[1]);
  const sh = s.shadow, gl = s.glow;
  return {
    opacity: num(s.opacity, DEFAULT_TEXT_STYLE.opacity, L.opacity),
    letterSpacing: num(s.letterSpacing, DEFAULT_TEXT_STYLE.letterSpacing, L.letterSpacing),
    lineSpacing: num(s.lineSpacing, DEFAULT_TEXT_STYLE.lineSpacing, L.lineSpacing),
    outlineColor: isHexColor(s.outlineColor) ? s.outlineColor : null,
    outlineWidth: num(s.outlineWidth, DEFAULT_TEXT_STYLE.outlineWidth, L.outlineWidth),
    shadow: isRec(sh) ? {
      color: isHexColor(sh.color) ? sh.color : DEFAULT_SHADOW.color,
      opacity: num(sh.opacity, DEFAULT_SHADOW.opacity, L.shadowOpacity),
      distance: num(sh.distance, DEFAULT_SHADOW.distance, L.shadowDistance),
      blur: num(sh.blur, DEFAULT_SHADOW.blur, L.shadowBlur),
    } : null,
    glow: isRec(gl) ? {
      color: isHexColor(gl.color) ? gl.color : DEFAULT_GLOW.color,
      size: num(gl.size, DEFAULT_GLOW.size, L.glowSize),
    } : null,
    boxPadding: num(s.boxPadding, DEFAULT_TEXT_STYLE.boxPadding, L.boxPadding),
    boxCorner: (BOX_CORNERS as readonly unknown[]).includes(s.boxCorner) ? (s.boxCorner as BoxCorner) : DEFAULT_TEXT_STYLE.boxCorner,
  };
}

/** A caption's length for `clampCaptionWords`: in milliseconds like every stored time (3.4 − 3 is 0.4, not 0.3999…); 0 when it is not a number. */
export function captionLength(start: number, end: number): number {
  const length = end - start;
  return Number.isFinite(length) ? Math.round(length * 1000) / 1000 : 0;
}

/** Entries need non-empty text and finite times (clamped to [0, length], end ≥ start); sorted by start. If the words joined with single spaces
 *  do not equal the caption's text (whitespace-normalised) the words are stale → []. Idempotent. */
export function clampCaptionWords(v: unknown, text: string, length: number): CaptionWord[] {
  if (!Array.isArray(v)) return [];
  const hi = Number.isFinite(length) ? Math.max(0, length) : 0;
  const words: CaptionWord[] = [];
  for (const e of v) {
    if (!isRec(e) || typeof e.text !== "string" || e.text.trim().length === 0 || !isNum(e.start) || !isNum(e.end)) continue;
    const start = clampNum(e.start, 0, hi);
    words.push({ text: e.text, start, end: Math.max(start, clampNum(e.end, 0, hi)) });
  }
  words.sort((a, b) => a.start - b.start);
  return words.map((w) => w.text).join(" ") === text.trim().replace(/\s+/g, " ") ? words : [];
}

export interface TextOverlay {
  id: string; kind: "text" | "caption"; text: string; fontId: FontId; fontScale: number; color: string;
  background: { color: string; opacity: number } | null; outline: boolean; align: Align;
  x: number; y: number; scale: number; rotation: number; start: number; end: number;
  animation: OverlayAnimation; keyframes: Keyframe[];   // captions carry them too but the sanity pass keeps them empty
  style: TextStyle;
  words: CaptionWord[];            // captions only; [] for plain text
  highlightColor: string | null;   // captions only; null = no word highlight
}
export interface StickerOverlay {
  id: string; kind: "sticker"; emoji: string | null; shape: ShapeId | null; color: string;
  x: number; y: number; scale: number; rotation: number; start: number; end: number;
  animation: OverlayAnimation; keyframes: Keyframe[];
}
export type Overlay = TextOverlay | StickerOverlay;
export const isTextOverlay = (o: Overlay): o is TextOverlay => o.kind === "text" || o.kind === "caption";
export const isSticker = (o: Overlay): o is StickerOverlay => o.kind === "sticker";

export interface AudioTrack {
  id: string; sourceUri: string; title: string; sourceDuration: number;
  start: number; trimStart: number; trimEnd: number; volume: number;
  kind: AudioKind;   // default "music"
  fadeIn: number;    // seconds, 0–5
  fadeOut: number;   // seconds, 0–5 (fitting both to the length is the mixing maths' job, not the model's)
  sound?: SoundSettings;   // ABSENT = as recorded (never null / undefined / neutral). Written only by `setTrackSound`
}

/** A finite number clamped to AUDIO_LIMITS.fade; anything else → 0. */
export const clampFade = (v: unknown): number => (isNum(v) ? clampNum(v, AUDIO_LIMITS.fade[0], AUDIO_LIMITS.fade[1]) : 0);

/**
 * A usable sound setting with every value in range (strength 2 decimals, not a number → the default; pitch a whole step, not a
 * number → 0; unknown ids → none; `level` only when exactly true), or null when it is not an object or changes nothing. Idempotent.
 */
export function clampSound(v: unknown): SoundSettings | null {
  if (!isRec(v) || Array.isArray(v)) return null;
  const [sLo, sHi] = SOUND_LIMITS.strength, [pLo, pHi] = SOUND_LIMITS.pitch;
  const s: SoundSettings = {
    voice: (VOICE_IDS as readonly unknown[]).includes(v.voice) ? (v.voice as VoiceId) : null,
    strength: isNum(v.strength) ? Math.round(clampNum(v.strength, sLo, sHi) * 100) / 100 : SOUND_LIMITS.defaultStrength,
    pitch: isNum(v.pitch) ? clampNum(Math.round(v.pitch), pLo, pHi) + 0 : 0,   // + 0: a rounded −0 is stored as 0
    eq: (EQ_IDS as readonly unknown[]).includes(v.eq) ? (v.eq as EqId) : null,
    level: v.level === true,
  };
  return isNeutralSound(s) ? null : s;
}

/** Finite, ≥ 0, sorted, rounded to 3 decimals; one closer than `minGap` to the previous KEPT one is dropped; at most `max` kept. Idempotent. */
export function clampBeatMarkers(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  const sorted = v.filter((x): x is number => isNum(x) && x >= 0).map((x) => Math.round(x * 1000) / 1000).sort((a, b) => a - b);
  const out: number[] = [];
  for (const t of sorted) {
    if (out.length > 0 && t - out[out.length - 1] < BEAT_LIMITS.minGap - 1e-9) continue;
    out.push(t);
    if (out.length === BEAT_LIMITS.max) break;
  }
  return out;
}

export interface Project {
  id: string; name: string; createdAt: string; updatedAt: string; aspectRatio: AspectRatio;
  clips: Clip[]; overlays: Overlay[]; audioTracks: AudioTrack[]; posts: PostRecord[]; effects: EffectItem[]; schemaVersion: typeof SCHEMA_VERSION;
  layers: LayerClip[];    // drawn in list order (later = on top)
  ducking: boolean;       // default false
  beatMarkers: number[];  // project seconds, sorted, unique within BEAT_LIMITS.minGap
  exportSettings: ExportSettings;   // default { fps: 30, quality: "high" }
  cover: Cover | null;              // default null = the first frame, no title
}

/** Shared factory for real code: a full-length video clip with every default. */
export function newVideoClip(a: Pick<Clip, "id" | "sourceUri" | "sourceDuration" | "width" | "height">): Clip {
  return { ...a, trimStart: 0, trimEnd: a.sourceDuration, speed: 1, filter: null, volume: 1, muted: false,
    transitionOut: { type: "none", duration: 0 }, kind: "video", transform: { ...DEFAULT_TRANSFORM }, crop: { ...FULL_CROP },
    background: { ...BLACK_BACKGROUND }, reversed: false, filterIntensity: 1, adjust: { ...DEFAULT_ADJUST },
    animation: { ...NO_CLIP_ANIMATION }, keyframes: [], speedCurve: null, fadeIn: 0, fadeOut: 0, opacity: 1, mask: "none", blend: "normal", chroma: null };
}
/** A still-image clip: default length, silent, speed 1, never reversed. */
export function newPhotoClip(a: Pick<Clip, "id" | "sourceUri" | "width" | "height"> & { seconds?: number }): Clip {
  const { seconds, ...rest } = a;
  return { ...newVideoClip({ ...rest, sourceDuration: PHOTO.maxSeconds }), kind: "photo", trimEnd: clampNum(seconds ?? PHOTO.defaultSeconds, PHOTO.minSeconds, PHOTO.maxSeconds), muted: true };
}
export function makeClip(partial: Partial<Clip> & Pick<Clip, "id" | "sourceDuration">): Clip {
  return { ...newVideoClip({ sourceUri: `file:///media/${partial.id}.mp4`, width: 1080, height: 1920, ...partial }), ...partial };
}
export function makePhotoClip(partial: Partial<Clip> & Pick<Clip, "id"> & { seconds?: number }): Clip {
  const { seconds, ...rest } = partial;
  return { ...newPhotoClip({ sourceUri: `file:///media/${partial.id}.jpg`, width: 1080, height: 1920, seconds, ...rest }), ...rest };
}
export function makeLayer(partial: Partial<LayerClip> & Pick<LayerClip, "id" | "sourceDuration">): LayerClip {
  return { start: 0, ...makeClip(partial), ...partial };
}
/** A new layer from a clip: every nested value copied, centred at the default scale, no transition. */
export function newLayer(clip: Clip, start: number): LayerClip {
  const edge = (e: AnimEdge | null) => (e ? { ...e } : null);
  return {
    ...clip,
    transform: { ...clip.transform, scale: LAYER_LIMITS.defaultScale, x: 0, y: 0 },
    crop: { ...clip.crop }, background: { ...clip.background }, adjust: { ...clip.adjust },
    animation: { in: edge(clip.animation.in), out: edge(clip.animation.out), combo: clip.animation.combo },
    keyframes: clip.keyframes.map((k) => ({ ...k })),
    speedCurve: clip.speedCurve ? { ...clip.speedCurve, steps: clip.speedCurve.steps.map((s) => ({ ...s })) } : null,
    chroma: clip.chroma ? { ...clip.chroma } : null,
    ...(clip.motion ? { motion: { ...clip.motion } } : null),
    ...(clip.collage ? { collage: { ...clip.collage } } : null),
    transitionOut: { type: "none", duration: 0 },
    start: Math.round(Math.max(0, start) * 1000) / 1000,
  };
}
export function makeOverlay(partial: Partial<TextOverlay> & Pick<TextOverlay, "id">): TextOverlay {
  return { kind: "text", text: "Your text", fontId: "bangers", fontScale: 0.07, color: "#F4F4F5", background: null, outline: true,
    align: "center", x: 0.5, y: 0.5, scale: 1, rotation: 0, start: 0, end: 3,
    animation: { ...NO_OVERLAY_ANIMATION }, keyframes: [], style: { ...DEFAULT_TEXT_STYLE }, words: [], highlightColor: null, ...partial };
}
export function makeSticker(partial: Partial<StickerOverlay> & Pick<StickerOverlay, "id">): StickerOverlay {
  return { kind: "sticker", emoji: "⭐", shape: null, color: "#F5C542", x: 0.5, y: 0.5, scale: 1, rotation: 0, start: 0, end: 3,
    animation: { ...NO_OVERLAY_ANIMATION }, keyframes: [], ...partial };
}
export function makeAudioTrack(partial: Partial<AudioTrack> & Pick<AudioTrack, "id" | "sourceDuration">): AudioTrack {
  return { sourceUri: `file:///media/${partial.id}.m4a`, title: "Track", start: 0, trimStart: 0, trimEnd: partial.sourceDuration, volume: 1, kind: "music", fadeIn: 0, fadeOut: 0, ...partial };
}
export function makeProject(partial: Partial<Project> = {}): Project {
  return { id: "p1", name: "Project 1", createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z",
    aspectRatio: "9:16", clips: [], overlays: [], audioTracks: [], posts: [], effects: [], layers: [], schemaVersion: SCHEMA_VERSION, ducking: false, beatMarkers: [],
    exportSettings: { ...DEFAULT_EXPORT_SETTINGS }, cover: null, ...partial };
}

/** A fixed ratio's width / height. For a project use `frameAspect` (it also resolves `auto`). */
export function aspectRatioValue(r: FixedAspectRatio): number {
  const [w, h] = r.split(":").map(Number);
  return w / h;
}
/**
 * The frame's width / height — the ONE place a ratio id becomes a number (preview, clip layout, cover, export).
 * A fixed id is its ratio. `auto` is the first main clip as displayed (`width` / `height` are stored display-oriented: the picker has
 * already applied the file's rotation), clamped to ASPECT_LIMITS; the clip's own transform and crop do not count. No clip, or one
 * without a usable size, gives 9:16. Also takes picked media before a project exists (anything with `width` / `height`).
 */
export function frameAspect(p: { aspectRatio: AspectRatio; clips: readonly { width: number; height: number }[] }): number {
  if (p.aspectRatio !== "auto") return aspectRatioValue(isAspectRatio(p.aspectRatio) ? p.aspectRatio : FALLBACK_ASPECT_RATIO);
  const first = p.clips[0];
  if (!first || !isNum(first.width) || !isNum(first.height) || first.width <= 0 || first.height <= 0) return aspectRatioValue(FALLBACK_ASPECT_RATIO);
  return clampNum(first.width / first.height, ASPECT_LIMITS[0], ASPECT_LIMITS[1]);
}
export function makeEffect(partial: Partial<EffectItem> & Pick<EffectItem, "id">): EffectItem {
  const type = partial.type ?? "shake";
  return { type, start: 0, end: EFFECT_LIMITS.defaultDuration, intensity: EFFECT_LIMITS.defaultIntensity,
    rect: isRegionEffect(type) ? { ...REGION_LIMITS.default } : null, ...partial };
}
