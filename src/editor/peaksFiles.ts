import { create } from "zustand";
import type { Peaks } from "./model/peaks";

export type PeaksFile = { status: "ready"; peaks: Peaks } | { status: "failed" };
/**
 * What is known of a file's outline, by its uri. Nothing known = no entry (also while it is being fetched: nothing draws a wait).
 * A failed file stays failed for the session — it is not asked again — and simply has no outline. Written only by soundPeaks.ts; read
 * with `readyPeaks`, which returns a stored object (never `s.files` itself).
 */
export const usePeaksFiles = create<{ files: Record<string, PeaksFile> }>(() => ({ files: {} }));
/** The outline a bar draws: the file's, once it is there; null at every other time (and for a missing file: pass null). */
export function readyPeaks(files: Record<string, PeaksFile>, uri: string | null): Peaks | null {
  const entry = uri === null ? undefined : files[uri];
  return entry !== undefined && entry.status === "ready" ? entry.peaks : null;
}
