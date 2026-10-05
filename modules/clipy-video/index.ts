import { requireOptionalNativeModule, type EventSubscription } from "expo-modules-core";
import { FONTS } from "@/src/editor/fonts";
import { clipGainCurve, exportTrackCurve, type GainPoint } from "@/src/editor/model/audioMix";
import { trackEnd } from "@/src/editor/model/audioSync";
import { edgeDurations } from "@/src/editor/model/motion";
import { clipDuration, hasSpeedCurve, outputOffsetOf, playbackSpans } from "@/src/editor/model/timeline";
import { DEFAULT_TEXT_STYLE, isRegionEffect, isSticker, type AnimEdge, type Align, type AspectRatio, type AudioTrack, type BlendId, type Clip, type ClipAdjust, type ClipTransform, type CropRect, type EffectItem, type ExportFps, type Keyframe, type LayerClip, type MaskId, type Overlay, type Project, type TextStyle } from "@/src/editor/model/types";
import type { Resolution } from "@/src/export/estimate";

export type ExportEvent = { jobId: string } & (
  | { type: "progress"; progress: number }
  | { type: "done"; fileUri: string }
  | { type: "error"; message: string }
  | { type: "cancelled" });

export interface ExportAnimEdge { id: string; duration: number }
/** `duration` source seconds played at `speed`. */
export interface ExportSpeedSpan { duration: number; speed: number }
export interface ExportKeyframe { t: number; x: number; y: number; scale: number; rotation: number; opacity: number }
const copyKeyframe = (k: Keyframe): ExportKeyframe => ({ t: k.t, x: k.x, y: k.y, scale: k.scale, rotation: k.rotation, opacity: k.opacity });
const toEdge = (e: AnimEdge | null, duration: number): ExportAnimEdge | null => (e && duration > 0 ? { id: e.id, duration } : null);

/** `TextStyle` as the native record has it: shadow / glow flattened, a null colour = that feature is off (its numbers are 0). */
export interface ExportTextStyle {
  opacity: number; letterSpacing: number; lineSpacing: number; outlineColor: string | null; outlineWidth: number;
  shadowColor: string | null; shadowOpacity: number; shadowDistance: number; shadowBlur: number;
  glowColor: string | null; glowSize: number;
}
export interface ExportCaptionWord { text: string; start: number; end: number }   // seconds since the caption's start
const toExportStyle = (s: TextStyle): ExportTextStyle => ({
  opacity: s.opacity, letterSpacing: s.letterSpacing, lineSpacing: s.lineSpacing, outlineColor: s.outlineColor, outlineWidth: s.outlineWidth,
  shadowColor: s.shadow?.color ?? null, shadowOpacity: s.shadow?.opacity ?? 0, shadowDistance: s.shadow?.distance ?? 0, shadowBlur: s.shadow?.blur ?? 0,
  glowColor: s.glow?.color ?? null, glowSize: s.glow?.size ?? 0,
});

export interface ExportOverlay {
  kind: "text" | "caption" | "sticker";
  text: string; fontPostScriptName: string; fontScale: number; color: string;
  backgroundColor: string | null; backgroundOpacity: number; outline: boolean; align: Align;
  emoji: string | null; shape: string | null;
  x: number; y: number; scale: number; rotation: number; start: number; end: number;
  animIn: ExportAnimEdge | null; animOut: ExportAnimEdge | null; animLoop: string | null; keyframes: ExportKeyframe[];
  style: ExportTextStyle;
  words: ExportCaptionWord[];      // captions only; [] otherwise
  highlightColor: string | null;   // captions only; null = no word highlight
}
/** One breakpoint of a piecewise-linear gain curve (`audioMix.ts`); the native side only draws ramps between them. */
export type ExportGainPoint = GainPoint;
/**
 * One audio track as the export plays it: source `[trimStart, trimEnd)` inserted at `start` (composition seconds), already
 * clipped to the exported video; `gain` is in composition seconds and includes volume, fades, ducking and the end-of-video fade.
 */
export interface ExportAudioTrack { sourceUri: string; start: number; trimStart: number; trimEnd: number; gain: ExportGainPoint[] }
/** The track clipped to a video `total` seconds long, or null when nothing of it is inside (the gain maths is `exportTrackCurve`). */
export function toExportAudioTrack(p: Project, t: AudioTrack, total: number): ExportAudioTrack | null {
  const gain = exportTrackCurve(p, t, total);
  if (gain.length < 2) return null;
  const early = Math.max(0, -t.start);   // seconds of the track before the video starts
  return {
    sourceUri: t.sourceUri, start: early > 0 ? 0 : t.start, trimStart: t.trimStart + early,
    trimEnd: trackEnd(t) > total ? t.trimStart + (total - t.start) : t.trimEnd,
    gain,
  };
}
export interface ExportClip {
  sourceUri: string; trimStart: number; trimEnd: number; volume: number; muted: boolean;
  speed: number; filter: string | null; transition: { type: string; duration: number };
  kind: "video" | "photo"; sourceWidth: number; sourceHeight: number;
  transform: ClipTransform; crop: CropRect;
  background: { type: "black" | "color" | "blur"; color: string | null };
  reversed: boolean;
  filterIntensity: number; adjust: ClipAdjust;
  animIn: ExportAnimEdge | null; animOut: ExportAnimEdge | null; animCombo: string | null;
  keyframes: ExportKeyframe[];   // clip-local OUTPUT seconds, ascending; the pins inside the clip plus the nearest one each side
  speedSpans: ExportSpeedSpan[]; // a speed curve as constant-speed spans in PLAYBACK order; [] = constant speed (`speed`)
  gain: ExportGainPoint[];       // the clip's own sound: clip-local OUTPUT seconds; volume, mute and fades included (the export mixes with this)
  opacity: number;               // the clip's STATIC opacity 0–1; keyframe opacity travels in `keyframes` and the native side multiplies the two
  mask: MaskId;
  blend: BlendId;                // how the clip composites over what is beneath it; main clips are always "normal"
  chroma: { color: string; strength: number } | null;   // green-screen key; null = none
}
/** A layer as the export draws it: a clip placed on the timeline at `start` (composition seconds). */
export type ExportLayer = ExportClip & { start: number };
/** Pins converted to output-local seconds, sorted, trimmed to [0, length] plus the last one before 0 and the first one after length. */
function outputKeyframes(c: Clip, length: number): ExportKeyframe[] {
  const pins = c.keyframes.map((k) => ({ ...copyKeyframe(k), t: outputOffsetOf(c, k.t) })).sort((a, b) => a.t - b.t);
  const before = pins.filter((k) => k.t < 0);
  const inside = pins.filter((k) => k.t >= 0 && k.t <= length);
  const after = pins.find((k) => k.t > length);
  return [...before.slice(-1), ...inside, ...(after ? [after] : [])];
}
export function toExportClip(c: Clip): ExportClip {
  const length = clipDuration(c);   // not sent: the export takes the clip's length from its composition
  const edges = edgeDurations(c.animation.in?.duration ?? 0, c.animation.out?.duration ?? 0, length);
  return {
    sourceUri: c.sourceUri, trimStart: c.trimStart, trimEnd: c.trimEnd, volume: c.volume, muted: c.muted,
    speed: c.speed, filter: c.filter, transition: { type: c.transitionOut.type, duration: c.transitionOut.duration },
    kind: c.kind, sourceWidth: c.width, sourceHeight: c.height,
    transform: { ...c.transform }, crop: { ...c.crop },
    background: { type: c.background.type, color: c.background.type === "color" ? c.background.color : null },
    reversed: c.reversed,
    filterIntensity: c.filterIntensity, adjust: { ...c.adjust },
    animIn: toEdge(c.animation.in, edges.in), animOut: toEdge(c.animation.out, edges.out), animCombo: c.animation.combo,
    keyframes: outputKeyframes(c, length),
    speedSpans: hasSpeedCurve(c) ? playbackSpans(c) : [],
    gain: clipGainCurve(c),
    opacity: c.opacity, mask: c.mask,
    // Only a layer has a blend mode (`toExportLayer` sends it); a main clip is sent as normal whatever the project holds.
    blend: "normal", chroma: c.chroma ? { color: c.chroma.color, strength: c.chroma.strength } : null,
  };
}
/** A layer has no transition or background of its own (both are ignored by the native side), so they are sent neutral. */
export function toExportLayer(l: LayerClip): ExportLayer {
  return { ...toExportClip(l), start: l.start, transition: { type: "none", duration: 0 }, background: { type: "black", color: null }, blend: l.blend };
}
export interface ExportEffect { type: string; start: number; end: number; intensity: number; rect: { x: number; y: number; w: number; h: number } | null }
/** The rectangle is sent only for a blur / mosaic box, whatever the project holds. */
export function toExportEffect(e: EffectItem): ExportEffect {
  return { type: e.type, start: e.start, end: e.end, intensity: e.intensity, rect: isRegionEffect(e.type) && e.rect ? { ...e.rect } : null };
}
export interface ExportRequest {
  clips: ExportClip[];
  layers: ExportLayer[];   // drawn in list order (later = on top)
  overlays: ExportOverlay[];
  effects: ExportEffect[];
  audioTracks: ExportAudioTrack[];
  aspectRatio: AspectRatio;   // "auto" or a "w:h" id; a "w:h" id decides the frame's shape by itself
  frameAspect: number;        // the frame's width / height (`frameAspect(project)`), finite and > 0; what "auto" exports with
  resolution: Resolution;
  fps: ExportFps;      // frames per second of the exported video
  bitrate: number;     // `requestBitrate`: 0 = no file-length limit (High, the default); above 0 = the video bits per second the file may use (Smaller file)
  outputPath: string;
}
function overlayMotion(o: Overlay): Pick<ExportOverlay, "animIn" | "animOut" | "animLoop" | "keyframes"> {
  const edges = edgeDurations(o.animation.in?.duration ?? 0, o.animation.out?.duration ?? 0, o.end - o.start);
  return { animIn: toEdge(o.animation.in, edges.in), animOut: toEdge(o.animation.out, edges.out), animLoop: o.animation.loop, keyframes: o.keyframes.map(copyKeyframe) };
}
export function toExportOverlay(o: Overlay): ExportOverlay {
  const shared = { x: o.x, y: o.y, scale: o.scale, rotation: o.rotation, start: o.start, end: o.end };
  // Captions never animate or carry pins.
  const motion = o.kind === "caption" ? { animIn: null, animOut: null, animLoop: null, keyframes: [] } : overlayMotion(o);
  if (isSticker(o)) {
    return {
      kind: "sticker", text: "", fontPostScriptName: "", fontScale: 0, color: o.color,
      backgroundColor: null, backgroundOpacity: 0, outline: false, align: "center",
      emoji: o.emoji, shape: o.shape, ...shared, ...motion,
      style: toExportStyle(DEFAULT_TEXT_STYLE), words: [], highlightColor: null,
    };
  }
  return {
    kind: o.kind, text: o.text, fontPostScriptName: FONTS[o.fontId].postScriptName, fontScale: o.fontScale, color: o.color,
    backgroundColor: o.background?.color ?? null, backgroundOpacity: o.background?.opacity ?? 0, outline: o.outline, align: o.align,
    emoji: null, shape: null, ...shared, ...motion,
    style: toExportStyle(o.style),
    // Only captions have spoken words and a highlight.
    words: o.kind === "caption" ? o.words.map((w) => ({ text: w.text, start: w.start, end: w.end })) : [],
    highlightColor: o.kind === "caption" ? o.highlightColor : null,
  };
}

// `NativeModule<TEventsMap>` from `expo-modules-core` resolves to the class's constructor
// type (not its instance type) in this SDK 57 build, so `addListener` is missing from it.
// Declaring `addListener` ourselves avoids relying on that broken generic.
export interface TranscriptSegment { text: string; start: number; end: number }

type ClipyVideoNative = {
  hello(): string;
  exportTimeline(req: ExportRequest): Promise<string>;
  cancelExport(jobId: string): void;
  addListener(eventName: "onExportEvent", listener: (e: ExportEvent) => void): EventSubscription;
  transcribe(uri: string, trimStart: number, trimEnd: number): Promise<TranscriptSegment[]>;
  cancelTranscribe(): void;
};

const NOT_LINKED = "ClipyVideo native module is not linked. Use a development build (eas build --profile development), not Expo Go.";

function optional(): ClipyVideoNative | null { return requireOptionalNativeModule<ClipyVideoNative>("ClipyVideo"); }
function native(): ClipyVideoNative { const m = optional(); if (!m) throw new Error(NOT_LINKED); return m; }

export function isNativeAvailable(): boolean { return optional() !== null; }
/** Returns a greeting from the Swift module. Phase 0 smoke test only. */
export function hello(): string { return native().hello(); }
export function exportTimeline(req: ExportRequest): Promise<string> { return native().exportTimeline(req); }
export function cancelExport(jobId: string): void { native().cancelExport(jobId); }
export function addExportListener(cb: (e: ExportEvent) => void): EventSubscription { return native().addListener("onExportEvent", cb); }
export function transcribe(uri: string, trimStart: number, trimEnd: number): Promise<TranscriptSegment[]> { return native().transcribe(uri, trimStart, trimEnd); }
export function cancelTranscribe(): void { native().cancelTranscribe(); }
