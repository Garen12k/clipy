import { requireOptionalNativeModule, type EventSubscription } from "expo-modules-core";
import type { AspectRatio } from "@/src/editor/model/types";
import type { Resolution } from "@/src/export/estimate";

export type ExportEvent = { jobId: string } & (
  | { type: "progress"; progress: number }
  | { type: "done"; fileUri: string }
  | { type: "error"; message: string }
  | { type: "cancelled" });

export interface ExportRequest {
  clips: { sourceUri: string; trimStart: number; trimEnd: number }[];
  aspectRatio: AspectRatio;
  resolution: Resolution;
  outputPath: string;
}

// `NativeModule<TEventsMap>` from `expo-modules-core` resolves to the class's constructor
// type (not its instance type) in this SDK 57 build, so `addListener` is missing from it.
// Declaring `addListener` ourselves avoids relying on that broken generic.
type ClipyVideoNative = {
  hello(): string;
  exportTimeline(req: ExportRequest): Promise<string>;
  cancelExport(jobId: string): void;
  addListener(eventName: "onExportEvent", listener: (e: ExportEvent) => void): EventSubscription;
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
