import { requireOptionalNativeModule, type EventSubscription } from "expo-modules-core";
import { FONTS } from "@/src/editor/fonts";
import type { Align, AspectRatio, TextOverlay } from "@/src/editor/model/types";
import type { Resolution } from "@/src/export/estimate";

export type ExportEvent = { jobId: string } & (
  | { type: "progress"; progress: number }
  | { type: "done"; fileUri: string }
  | { type: "error"; message: string }
  | { type: "cancelled" });

export interface ExportOverlay {
  text: string; fontPostScriptName: string; fontScale: number; color: string;
  backgroundColor: string | null; backgroundOpacity: number; outline: boolean; align: Align;
  x: number; y: number; scale: number; rotation: number; start: number; end: number;
}
export interface ExportAudio { sourceUri: string; start: number; trimStart: number; trimEnd: number; volume: number }
export interface ExportRequest {
  clips: { sourceUri: string; trimStart: number; trimEnd: number; volume: number; muted: boolean }[];
  overlays: ExportOverlay[];
  audio: ExportAudio | null;
  aspectRatio: AspectRatio;
  resolution: Resolution;
  outputPath: string;
}
export function toExportOverlay(o: TextOverlay): ExportOverlay {
  return {
    text: o.text, fontPostScriptName: FONTS[o.fontId].postScriptName, fontScale: o.fontScale, color: o.color,
    backgroundColor: o.background?.color ?? null, backgroundOpacity: o.background?.opacity ?? 0, outline: o.outline, align: o.align,
    x: o.x, y: o.y, scale: o.scale, rotation: o.rotation, start: o.start, end: o.end,
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
