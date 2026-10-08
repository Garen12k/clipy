import { create } from "zustand";
import { coveringSteady, steadyNeed, steadyOf, steadyRefusal, type NeededSteady } from "./model/steady";
import type { Clip, Project } from "./model/types";

/**
 * What is known of one steady copy (Stabilize and / or Smooth slow motion), by its file name (`steadyFileName`). Nothing known = no
 * entry. A busy copy's `progress` is 0 … 1 in whole percent: it is written at most a hundred times per render.
 */
export type SteadyFile = { status: "ready"; uri: string } | { status: "busy"; progress: number } | { status: "failed"; message: string };

/**
 * The steady copies of the open project (transient: not saved, not undoable). Written only by steadyRenders.ts. Read it with a
 * selector that returns a primitive or a stored entry (`shownSteady`, `steadyPercent`, `steadyFileOf`) — never `s.files` itself,
 * which is a new object on every percent.
 */
export const useSteadyFiles = create<{ files: Record<string, SteadyFile> }>(() => ({ files: {} }));

/** The copies that exist or are being rendered: what a clip may be served from. A failed one is not among them. */
export function knownSteady(files: Record<string, SteadyFile>): string[] {
  return Object.keys(files).filter((name) => files[name].status !== "failed");
}
/** Whether the clip has a copy and can be served (not too long). */
const served = (clip: Clip): boolean => steadyOf(clip) !== null && steadyRefusal(clip) === null;

/**
 * The copy a clip uses NOW — asked every time, never remembered; null for a clip without a setting. A READY copy that covers the
 * clip comes first, so a clip that shows its copy is never moved to a smaller one that is still being rendered for another clip;
 * only without one is it the smallest known copy (a busy one included), else the copy that would be rendered for it. The queue,
 * the preview, the strips and the export all ask here, so they agree on the name.
 */
export function steadyNeedOf(files: Record<string, SteadyFile>, clip: Clip): NeededSteady | null {
  const setting = steadyOf(clip);
  if (setting === null) return null;
  const held = coveringSteady(Object.keys(files).filter((name) => files[name].status === "ready"), clip, setting);
  return steadyNeed(clip, held === null ? knownSteady(files) : [held]);
}
/**
 * Every different copy the project needs, main clips first, then layers — `neededSteady`'s rule (a clip without a setting, whose
 * file is missing or that is too long needs none), with each clip resolved by `steadyNeedOf`.
 */
export function steadyNeeded(p: Project, missing: readonly string[], files: Record<string, SteadyFile>): NeededSteady[] {
  const out: NeededSteady[] = [];
  for (const c of [...p.clips, ...p.layers]) {
    if (!served(c) || missing.includes(c.sourceUri)) continue;
    const need = steadyNeedOf(files, c);
    if (need !== null && !out.some((n) => n.name === need.name)) out.push(need);
  }
  return out;
}
/** What is known of the copy a clip uses: undefined for a clip without a copy, and for a copy nobody has asked for yet. */
export function steadyFileOf(files: Record<string, SteadyFile>, clip: Clip): SteadyFile | undefined {
  const need = served(clip) ? steadyNeedOf(files, clip) : null;
  return need === null ? undefined : files[need.name];
}
/** The file the preview shows instead of the clip's own: its steady copy once that is ready, else null (the clip shows as it is). */
export function shownSteady(files: Record<string, SteadyFile>, clip: Clip): string | null {
  const entry = steadyFileOf(files, clip);
  return entry !== undefined && entry.status === "ready" ? entry.uri : null;
}
/** How far the clip's copy is, 0 … 100 in whole percent, while it is being rendered; null at every other time. */
export function steadyPercent(files: Record<string, SteadyFile>, clip: Clip): number | null {
  const entry = steadyFileOf(files, clip);
  return entry !== undefined && entry.status === "busy" ? Math.round(entry.progress * 100) : null;
}
