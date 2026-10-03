import { requireOptionalNativeModule, type EventSubscription } from "expo-modules-core";
import { FONTS } from "@/src/editor/fonts";
import { isSticker, type Align, type AspectRatio, type Clip, type ClipAdjust, type ClipTransform, type CropRect, type EffectItem, type Overlay } from "@/src/editor/model/types";
import type { Resolution } from "@/src/export/estimate";

export type ExportEvent = { jobId: string } & (
  | { type: "progress"; progress: number }
  | { type: "done"; fileUri: string }
  | { type: "error"; message: string }
  | { type: "cancelled" });

export interface ExportOverlay {
  kind: "text" | "caption" | "sticker";
  text: string; fontPostScriptName: string; fontScale: number; color: string;
  backgroundColor: string | null; backgroundOpacity: number; outline: boolean; align: Align;
  emoji: string | null; shape: string | null;
  x: number; y: number; scale: number; rotation: number; start: number; end: number;
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
}
export function toExportClip(c: Clip): ExportClip {
  return {
    sourceUri: c.sourceUri, trimStart: c.trimStart, trimEnd: c.trimEnd, volume: c.volume, muted: c.muted,
    speed: c.speed, filter: c.filter, transition: { type: c.transitionOut.type, duration: c.transitionOut.duration },
    kind: c.kind, sourceWidth: c.width, sourceHeight: c.height,
    transform: { ...c.transform }, crop: { ...c.crop },
    background: { type: c.background.type, color: c.background.type === "color" ? c.background.color : null },
    reversed: c.reversed,
    filterIntensity: c.filterIntensity, adjust: { ...c.adjust },
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
export function toExportOverlay(o: Overlay): ExportOverlay {
  const shared = { x: o.x, y: o.y, scale: o.scale, rotation: o.rotation, start: o.start, end: o.end };
  if (isSticker(o)) {
    return {
      kind: "sticker", text: "", fontPostScriptName: "", fontScale: 0, color: o.color,
      backgroundColor: null, backgroundOpacity: 0, outline: false, align: "center",
      emoji: o.emoji, shape: o.shape, ...shared,
    };
  }
  return {
    kind: o.kind, text: o.text, fontPostScriptName: FONTS[o.fontId].postScriptName, fontScale: o.fontScale, color: o.color,
    backgroundColor: o.background?.color ?? null, backgroundOpacity: o.background?.opacity ?? 0, outline: o.outline, align: o.align,
    emoji: null, shape: null, ...shared,
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
