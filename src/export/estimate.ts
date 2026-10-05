import { clipDuration } from "@/src/editor/model/timeline";
import { clampExportSettings, DEFAULT_EXPORT_SETTINGS, type AudioTrack, type Clip, type ExportFps, type ExportQuality, type ExportSettings, type LayerClip, type Project } from "@/src/editor/model/types";

export type Resolution = 720 | 1080 | 2160;
export const RESOLUTIONS: { value: Resolution; label: string }[] = [{ value: 720, label: "720p" }, { value: 1080, label: "1080p" }, { value: 2160, label: "4K" }];
export const BITRATE_MBPS: Record<Resolution, number> = { 720: 5, 1080: 10, 2160: 35 };

export const FPS_BITRATE_FACTOR: Record<ExportFps, number> = { 24: 0.9, 30: 1, 60: 1.5 };
export const QUALITY_BITRATE_FACTOR: Record<ExportQuality, number> = { high: 1, small: 0.6 };
export const QUALITY_LABELS: Record<ExportQuality, string> = { high: "High", small: "Smaller file" };
/** Video bits per second for a resolution and export settings, rounded. Settings are clamped, so junk never yields NaN. */
export const exportBitrate = (res: Resolution, s: ExportSettings = DEFAULT_EXPORT_SETTINGS): number => {
  const c = clampExportSettings(s);
  return Math.round(BITRATE_MBPS[res] * 1e6 * FPS_BITRATE_FACTOR[c.fps] * QUALITY_BITRATE_FACTOR[c.quality]);
};
export const estimateBytes = (durationSec: number, res: Resolution, s: ExportSettings = DEFAULT_EXPORT_SETTINGS): number => (durationSec * exportBitrate(res, s)) / 8;
/** H.264 level 5.1 / 5.2 frame-size limit in 16 × 16 macroblocks (= 4096 × 2304) — `MediaPrePass.maxMacroblocks` on the native side. */
export const MAX_MACROBLOCKS = 36_864;
/**
 * The exported video's size in pixels for a frame shape (`frameAspect`: width / height) — the mirror of `ExportSession.renderSize`
 * (keep them identical; src/export/__tests__/renderSize.swift.test.ts). The SHORT side is the resolution (720 / 1080 / 2160), the long
 * side follows the shape, both are EVEN (encoders need that). A frame the H.264 encoder cannot take (only wider than about 2:1 at 4K)
 * is scaled down in steps of 2 on the short side, same shape. A shape that is not a positive number is a square.
 * Neither the bitrate nor the size estimate depends on the shape: they go by resolution, fps and quality only.
 */
export function renderSize(aspect: number, resolution: number): { width: number; height: number } {
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const ratio = Math.max(a, 1 / a);
  const even = (v: number) => Math.max(2, Math.round(v / 2) * 2);
  const macroblocks = (w: number, h: number) => Math.ceil(w / 16) * Math.ceil(h / 16);
  let short = even(resolution);
  let long = even(short * ratio);
  while (macroblocks(long, short) > MAX_MACROBLOCKS && short > 2) { short -= 2; long = even(short * ratio); }
  return a >= 1 ? { width: long, height: short } : { width: short, height: long };
}
/** What the request carries: 0 (no limit — today's export) for High, the capped bitrate for Smaller file. */
export const requestBitrate = (res: Resolution, s: ExportSettings = DEFAULT_EXPORT_SETTINGS): number => (clampExportSettings(s).quality === "small" ? exportBitrate(res, s) : 0);
/**
 * Only video clips count: a still photo is never a 4K source. Called with the main clips only — layers never gate 4K
 * (they are drawn smaller than the frame, so a 4K export is fine whatever resolution they have).
 */
export const canExport4K = (clips: { width: number; height: number; kind?: Clip["kind"] }[]): boolean =>
  clips.some((c) => c.kind !== "photo" && Math.max(c.width, c.height) >= 2160);
/** The clips that go into the export: non-empty and with a source file that still exists. */
export function exportableClips(project: Project, missingSourceUris: string[]): Clip[] {
  return project.clips.filter((c) => c.trimEnd > c.trimStart && !missingSourceUris.includes(c.sourceUri));
}
/** Layers closer than this to the end of the exported video are dropped (nothing visible would be drawn). */
export const LAYER_END_SLACK = 0.05;
/** The layers that go into the export, order preserved: non-empty (as `exportableClips`), source file present and starting before the exported `total` seconds end. */
export const exportableLayers = (project: Project, missingSourceUris: string[], total: number): LayerClip[] =>
  project.layers.filter((l) => l.trimEnd > l.trimStart && !missingSourceUris.includes(l.sourceUri) && l.start < total - LAYER_END_SLACK);
/** Length of the exported video in seconds (what the finish screen shows and the Post screen receives). */
export const exportDuration = (project: Project, missingSourceUris: string[]): number => exportableClips(project, missingSourceUris).reduce((s, c) => s + clipDuration(c), 0);
/** The audio tracks that go into the export, in order: every track whose source file still exists. */
export const exportableAudio = (p: Project, missing: string[]): AudioTrack[] => p.audioTracks.filter((t) => !missing.includes(t.sourceUri));
export function formatBytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  return `${Math.round(n / 1e6)} MB`;
}
