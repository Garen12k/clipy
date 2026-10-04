import { clipDuration } from "@/src/editor/model/timeline";
import type { AudioTrack, Clip, LayerClip, Project } from "@/src/editor/model/types";

export type Resolution = 720 | 1080 | 2160;
export const RESOLUTIONS: { value: Resolution; label: string }[] = [{ value: 720, label: "720p" }, { value: 1080, label: "1080p" }, { value: 2160, label: "4K" }];
export const BITRATE_MBPS: Record<Resolution, number> = { 720: 5, 1080: 10, 2160: 35 };

export const estimateBytes = (durationSec: number, res: Resolution): number => (durationSec * BITRATE_MBPS[res] * 1e6) / 8;
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
