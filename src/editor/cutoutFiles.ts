import { create } from "zustand";
import { coveringCopy, cutoutNeed, cutoutRefusal, type NeededCutout } from "./model/cutout";
import { activeCutout, type Clip, type Project } from "./model/types";

/**
 * What is known of one cut-out copy, by its file name (`cutoutFileName`). Nothing known = no entry. A busy copy's `progress` is
 * 0 … 1 in whole percent (0.42, never 0.4237): it is written at most a hundred times per render.
 */
export type CutoutFile = { status: "ready"; uri: string } | { status: "busy"; progress: number } | { status: "failed"; message: string };

/**
 * The cut-out copies of the open project (transient: not saved, not undoable). Written only by cutoutRenders.ts. Read it with a
 * selector that returns a primitive or a stored entry (`shownCutout`, `cutoutPercent`, `cutoutFileOf`) — never `s.files` itself,
 * which is a new object on every percent.
 */
export const useCutoutFiles = create<{ files: Record<string, CutoutFile> }>(() => ({ files: {} }));

/** The copies that exist or are being rendered: what a clip may be served from (`coveringCopy`). A failed one is not among them. */
export function knownCopies(files: Record<string, CutoutFile>): string[] {
  return Object.keys(files).filter((name) => files[name].status !== "failed");
}
/** Whether the clip's switch is on and it can be served (not reversed, not too long): only such a clip has a copy. */
const served = (clip: Clip): boolean => activeCutout(clip) && cutoutRefusal(clip) === null;

/**
 * The copy a clip uses NOW — asked every time, never remembered. A READY copy that covers the clip comes first, so a clip that shows
 * its cut-out is never moved to a smaller copy of the same file that is still being rendered for another clip; only without one is
 * it the smallest known copy (a busy one included), else the copy that would be rendered for it. The editor, the preview, the strip
 * and the export all ask here, so they agree on the name. Meant for a clip whose switch is on and that can be served.
 */
export function cutoutNeedOf(files: Record<string, CutoutFile>, clip: Clip): NeededCutout {
  const held = coveringCopy(Object.keys(files).filter((name) => files[name].status === "ready"), clip);
  return cutoutNeed(clip, held === null ? knownCopies(files) : [held]);
}
/**
 * Every different copy the project needs, main clips first, then layers (as `neededCutouts`, each clip resolved by `cutoutNeedOf`):
 * a clip whose switch is off, whose file is missing or that cannot be served needs none.
 */
export function cutoutsNeeded(p: Project, missing: readonly string[], files: Record<string, CutoutFile>): NeededCutout[] {
  const out: NeededCutout[] = [];
  for (const c of [...p.clips, ...p.layers]) {
    if (!served(c) || missing.includes(c.sourceUri)) continue;
    const need = cutoutNeedOf(files, c);
    if (!out.some((n) => n.name === need.name)) out.push(need);
  }
  return out;
}
/** What is known of the copy a clip uses: undefined for a clip whose switch is off or that cannot be served, and for a copy nobody has asked for yet. */
export function cutoutFileOf(files: Record<string, CutoutFile>, clip: Clip): CutoutFile | undefined {
  return served(clip) ? files[cutoutNeedOf(files, clip).name] : undefined;
}
/** The file the preview shows instead of the clip's own: its cut-out copy once that is ready, else null (the clip shows as it is). */
export function shownCutout(files: Record<string, CutoutFile>, clip: Clip): string | null {
  const entry = cutoutFileOf(files, clip);
  return entry !== undefined && entry.status === "ready" ? entry.uri : null;
}
/** How far the clip's copy is, 0 … 100 in whole percent, while it is being rendered; null at every other time. */
export function cutoutPercent(files: Record<string, CutoutFile>, clip: Clip): number | null {
  const entry = cutoutFileOf(files, clip);
  return entry !== undefined && entry.status === "busy" ? Math.round(entry.progress * 100) : null;
}
