import { requireOptionalNativeModule } from "expo-modules-core";

/**
 * The "auto enhance" build (2026-10-17): the phone reads a few frames of a clip and answers PLAIN NUMBERS about them
 * (FrameStats.swift) — what to set from them is TypeScript (src/editor/model/autoEnhance.ts). Imported by its own path, so a
 * test that mocks `@/modules/clipy-video` still gets these real, absent-safe functions. Nothing here throws.
 */
export interface FrameStatsRequest { jobId: string; uri: string; kind: "video" | "photo"; times: number[]; maxSide: number }
/** One frame: `histogram` = 64 bins of Rec. 709 luma on gamma values (counts); means of R′ G′ B′ and of chroma (max − min), 0 … 1. */
export interface FrameStat { time: number; histogram: number[]; r: number; g: number; b: number; saturation: number; pixels: number }
export interface FrameStatsResult { frames: FrameStat[]; failed: number }
/** The code a cancelled look rejects with (`cancelFrameStats`). */
export const STATS_CANCELLED = "E_STATS_CANCELLED";
/** The code of a look that was not made, or cannot be trusted, because Clipy was in the background during it. */
export const STATS_INTERRUPTED = "E_STATS_INTERRUPTED";
const NOT_IN_BUILD = "This build of the app cannot do that yet. Install the latest Clipy build.";

type StatsNative = { frameStats?: (req: FrameStatsRequest) => Promise<FrameStatsResult>; cancelFrameStats?: (jobId: string) => void };
function optional(): StatsNative | null {
  try { return requireOptionalNativeModule<StatsNative>("ClipyVideo"); } catch { return null; }
}
/** Whether the installed app is the "auto enhance" build or a newer one. */
export function isFrameStatsAvailable(): boolean { return typeof optional()?.frameStats === "function"; }
export function frameStats(req: FrameStatsRequest): Promise<FrameStatsResult> {
  const m = optional();
  if (!m || typeof m.frameStats !== "function") return Promise.reject(new Error(NOT_IN_BUILD));
  try { return m.frameStats(req); } catch (e) { return Promise.reject(e); }
}
export function cancelFrameStats(jobId: string): void {
  try {
    const m = optional();
    if (m && typeof m.cancelFrameStats === "function") m.cancelFrameStats(jobId);
  } catch { /* nothing to stop */ }
}
const codeOf = (e: unknown): unknown => (typeof e === "object" && e !== null ? (e as { code?: unknown }).code : undefined);
export function isStatsCancelled(e: unknown): boolean { return codeOf(e) === STATS_CANCELLED; }
export function isStatsInterrupted(e: unknown): boolean { return codeOf(e) === STATS_INTERRUPTED; }
