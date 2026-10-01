export const ASPECT_RATIOS = ["9:16", "1:1", "16:9"] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];
export const MIN_CLIP_SECONDS = 0.1;

export const SCHEMA_VERSION = 3 as const;
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

export interface Clip {
  id: string; sourceUri: string; sourceDuration: number; width: number; height: number;
  trimStart: number; trimEnd: number;
  speed: number;                 // 0.25–4
  filter: FilterId | null;
  volume: number;   // 0–2
  muted: boolean;
  transitionOut: { type: TransitionType; duration: number };
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
  clips: Clip[]; overlays: Overlay[]; audioTracks: AudioTrack[]; schemaVersion: typeof SCHEMA_VERSION;
}

export function makeClip(partial: Partial<Clip> & Pick<Clip, "id" | "sourceDuration">): Clip {
  return { sourceUri: `file:///media/${partial.id}.mp4`, width: 1080, height: 1920, trimStart: 0, trimEnd: partial.sourceDuration,
    speed: 1, filter: null, volume: 1, muted: false, transitionOut: { type: "none", duration: 0 }, ...partial };
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
    aspectRatio: "9:16", clips: [], overlays: [], audioTracks: [], schemaVersion: SCHEMA_VERSION, ...partial };
}

export function aspectRatioValue(r: AspectRatio): number {
  const [w, h] = r.split(":").map(Number);
  return w / h;
}
