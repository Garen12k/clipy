import { requireOptionalNativeModule, type EventSubscription } from "expo-modules-core";
import { FONTS } from "@/src/editor/fonts";
import { edgeDurations } from "@/src/editor/model/motion";
import { clipDuration, outputOffsetOf, playbackSpans } from "@/src/editor/model/timeline";
import { isSticker, type AnimEdge, type Align, type AspectRatio, type Clip, type ClipAdjust, type ClipTransform, type CropRect, type EffectItem, type Keyframe, type Overlay } from "@/src/editor/model/types";
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

export interface ExportOverlay {
  kind: "text" | "caption" | "sticker";
  text: string; fontPostScriptName: string; fontScale: number; color: string;
  backgroundColor: string | null; backgroundOpacity: number; outline: boolean; align: Align;
  emoji: string | null; shape: string | null;
  x: number; y: number; scale: number; rotation: number; start: number; end: number;
  animIn: ExportAnimEdge | null; animOut: ExportAnimEdge | null; animLoop: string | null; keyframes: ExportKeyframe[];
}
export interface ExportAudio { sourceUri: string; start: number; trimStart: number; trimEnd: number; volume: number }
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
}
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
    speedSpans: c.speedCurve ? playbackSpans(c) : [],
  };
}
export interface ExportEffect { type: string; start: number; end: number; intensity: number }
export function toExportEffect(e: EffectItem): ExportEffect {
  return { type: e.type, start: e.start, end: e.end, intensity: e.intensity };
}
export interface ExportRequest {
  clips: ExportClip[];
  overlays: ExportOverlay[];
  effects: ExportEffect[];
  audio: ExportAudio | null;
  aspectRatio: AspectRatio;
  resolution: Resolution;
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
    };
  }
  return {
    kind: o.kind, text: o.text, fontPostScriptName: FONTS[o.fontId].postScriptName, fontScale: o.fontScale, color: o.color,
    backgroundColor: o.background?.color ?? null, backgroundOpacity: o.background?.opacity ?? 0, outline: o.outline, align: o.align,
    emoji: null, shape: null, ...shared, ...motion,
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
