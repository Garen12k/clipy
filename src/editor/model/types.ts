export const ASPECT_RATIOS = ["9:16", "1:1", "16:9"] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];
export const MIN_CLIP_SECONDS = 0.1;

export const SCHEMA_VERSION = 5 as const;
export const POST_PLATFORMS = ["youtube", "tiktok", "instagram", "facebook", "x"] as const;
export type PostPlatform = (typeof POST_PLATFORMS)[number];
export const PLATFORM_LABELS: Record<PostPlatform, string> = { youtube: "YouTube", tiktok: "TikTok", instagram: "Instagram", facebook: "Facebook", x: "X" };
export interface PostRecord { platform: PostPlatform; url: string | null; postedAt: string }
export const FONT_IDS = ["bangers", "anton", "oswald", "montserrat", "pacifico", "permanentMarker", "lobster", "roboto"] as const;
export type FontId = (typeof FONT_IDS)[number];
export type Align = "left" | "center" | "right";
export const OVERLAY_LIMITS = { fontScale: [0.02, 0.25] as const, scale: [0.2, 5] as const, minDuration: 0.2 };
export const AUDIO_LIMITS = { minDuration: 0.5, volume: [0, 2] as const };
export const CLIP_VOLUME = [0, 2] as const;

export const FILTER_IDS = ["none", "warm", "cool", "vivid", "faded", "mono", "noir", "vintage"] as const;
export type FilterId = (typeof FILTER_IDS)[number];
export const TRANSITION_TYPES = ["none", "fade", "dissolve", "slide", "zoom"] as const;
export type TransitionType = (typeof TRANSITION_TYPES)[number];
export const SHAPE_IDS = ["circle", "square", "roundedBox", "arrow", "star", "speechBubble", "heart"] as const;
export type ShapeId = (typeof SHAPE_IDS)[number];
export const SPEED_LIMITS = [0.25, 4] as const;
export const TRANSITION_LIMITS = { min: 0.3, max: 1.0 };

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
}
export const isPhoto = (c: Clip) => c.kind === "photo";

/** Rotation in degrees, wrapped into (−180, 180]. */
export function normaliseRotation(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  const m = ((deg % 360) + 360) % 360;   // [0, 360)
  return m > 180 ? m - 360 : m;
}
const clampNum = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const finiteOr = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);

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

export interface TextOverlay {
  id: string; kind: "text" | "caption"; text: string; fontId: FontId; fontScale: number; color: string;
  background: { color: string; opacity: number } | null; outline: boolean; align: Align;
  x: number; y: number; scale: number; rotation: number; start: number; end: number;
}
export interface StickerOverlay {
  id: string; kind: "sticker"; emoji: string | null; shape: ShapeId | null; color: string;
  x: number; y: number; scale: number; rotation: number; start: number; end: number;
}
export type Overlay = TextOverlay | StickerOverlay;
export const isTextOverlay = (o: Overlay): o is TextOverlay => o.kind === "text" || o.kind === "caption";
export const isSticker = (o: Overlay): o is StickerOverlay => o.kind === "sticker";

export interface AudioTrack {
  id: string; sourceUri: string; title: string; sourceDuration: number;
  start: number; trimStart: number; trimEnd: number; volume: number;
}

export interface Project {
  id: string; name: string; createdAt: string; updatedAt: string; aspectRatio: AspectRatio;
  clips: Clip[]; overlays: Overlay[]; audioTracks: AudioTrack[]; posts: PostRecord[]; schemaVersion: typeof SCHEMA_VERSION;
}

/** Shared factory for real code: a full-length video clip with every default. */
export function newVideoClip(a: Pick<Clip, "id" | "sourceUri" | "sourceDuration" | "width" | "height">): Clip {
  return { ...a, trimStart: 0, trimEnd: a.sourceDuration, speed: 1, filter: null, volume: 1, muted: false,
    transitionOut: { type: "none", duration: 0 }, kind: "video", transform: { ...DEFAULT_TRANSFORM }, crop: { ...FULL_CROP },
    background: { ...BLACK_BACKGROUND }, reversed: false };
}
/** A still-image clip: default length, silent, speed 1, never reversed. */
export function newPhotoClip(a: Pick<Clip, "id" | "sourceUri" | "width" | "height"> & { seconds?: number }): Clip {
  const { seconds, ...rest } = a;
  return { ...newVideoClip({ ...rest, sourceDuration: PHOTO.maxSeconds }), kind: "photo", trimEnd: seconds ?? PHOTO.defaultSeconds, muted: true };
}
export function makeClip(partial: Partial<Clip> & Pick<Clip, "id" | "sourceDuration">): Clip {
  return { ...newVideoClip({ sourceUri: `file:///media/${partial.id}.mp4`, width: 1080, height: 1920, ...partial }), ...partial };
}
export function makePhotoClip(partial: Partial<Clip> & Pick<Clip, "id"> & { seconds?: number }): Clip {
  const { seconds, ...rest } = partial;
  return { ...newPhotoClip({ sourceUri: `file:///media/${partial.id}.jpg`, width: 1080, height: 1920, seconds, ...rest }), ...rest };
}
export function makeOverlay(partial: Partial<TextOverlay> & Pick<TextOverlay, "id">): TextOverlay {
  return { kind: "text", text: "Your text", fontId: "bangers", fontScale: 0.07, color: "#F4F4F5", background: null, outline: true,
    align: "center", x: 0.5, y: 0.5, scale: 1, rotation: 0, start: 0, end: 3, ...partial };
}
export function makeSticker(partial: Partial<StickerOverlay> & Pick<StickerOverlay, "id">): StickerOverlay {
  return { kind: "sticker", emoji: "⭐", shape: null, color: "#F5C542", x: 0.5, y: 0.5, scale: 1, rotation: 0, start: 0, end: 3, ...partial };
}
export function makeAudioTrack(partial: Partial<AudioTrack> & Pick<AudioTrack, "id" | "sourceDuration">): AudioTrack {
  return { sourceUri: `file:///media/${partial.id}.m4a`, title: "Track", start: 0, trimStart: 0, trimEnd: partial.sourceDuration, volume: 1, ...partial };
}
export function makeProject(partial: Partial<Project> = {}): Project {
  return { id: "p1", name: "Project 1", createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z",
    aspectRatio: "9:16", clips: [], overlays: [], audioTracks: [], posts: [], schemaVersion: SCHEMA_VERSION, ...partial };
}

export function aspectRatioValue(r: AspectRatio): number {
  const [w, h] = r.split(":").map(Number);
  return w / h;
}
