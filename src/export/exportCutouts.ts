import { isCutoutCancelled, type ExportClip } from "@/modules/clipy-video";
import { cutoutNeedOf, useCutoutFiles, type CutoutFile } from "@/src/editor/cutoutFiles";
import { cutoutDir, ensureCutout, isNoPerson } from "@/src/editor/cutoutRenders";
import { CUTOUT, cutoutRefusal, cutoutStillName, parseCutoutName } from "@/src/editor/model/cutout";
import { activeCutout, isPhoto, type Clip } from "@/src/editor/model/types";
import { expoFs } from "@/src/projects/expoFs";

/** The share of the export's progress that preparing the cut-out copies takes (only when a clip has Remove background on). */
export const CUTOUT_SHARE = 0.3;
/** Why an export with Remove background cannot go out. */
export const CUTOUT_EXPORT = {
  tooLong: "A clip with Remove background is longer than 60 seconds. Shorten it, or switch Remove background off.",
  noPerson: "Remove background found no person in a clip. Switch it off for that clip.",
} as const;
/**
 * How often one clip's copy is asked for before the export gives up: a render can be stopped under the export (the editor stops
 * one it no longer needs, and every one when it is left), and the export does need it, so it asks again — by the name the editor
 * has by then.
 */
const CUTOUT_ASKS = 3;
const STOPPED = "Could not remove a background for the export: the cut-out was stopped before it was finished. Export again.";

/**
 * The cut-out copies of the clips and layers that have Remove background on: clip id → the copy's uri. A copy that exists (and
 * covers the clip) is used; a missing one is rendered first, one after the other. `onProgress` runs 0 → 1 across them and never
 * back. A copy that cannot be made stops the export — it never goes out with a background the owner switched off. `stopped`
 * (Cancel) is asked before each copy and after it: once it answers true no further copy is asked for and nothing more is reported;
 * what was gathered so far is returned.
 *
 * WHICH copy a clip uses is the editor's answer (`cutoutNeedOf` over its store, read again for every clip): the editor is still
 * mounted under the Export screen and cancels a running render whose name it does not need itself, so the two must name the same
 * copies. Added to what the store knows, as finished copies: the ones in the project's folder (the store is empty when no editor
 * holds the project) and the ones made here. A finished copy needs no render, so it can never be one the editor stops.
 */
export async function prepareCutouts(projectId: string, items: readonly Clip[], onProgress: (fraction: number) => void, stopped: () => boolean = () => false): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const cut = items.filter(activeCutout);
  if (cut.length === 0) return out;
  if (cut.some((c) => cutoutRefusal(c) === "tooLong")) throw new Error(CUTOUT_EXPORT.tooLong);
  const dir = cutoutDir(projectId);
  let finished: string[] = [];
  try { finished = (await expoFs.list(dir)).filter((name) => parseCutoutName(name) !== null); } catch { finished = []; }
  const filesNow = (): Record<string, CutoutFile> => {
    const files: Record<string, CutoutFile> = {};
    for (const name of finished) files[name] = { status: "ready", uri: `${dir}/${name}` };
    return { ...files, ...useCutoutFiles.getState().files };
  };
  let top = 0;
  const report = (fraction: number): void => {
    if (stopped() || !(fraction > top)) return;
    top = fraction;
    onProgress(fraction);
  };
  for (let i = 0; i < cut.length; i++) {
    for (let ask = 1; ; ask++) {
      if (stopped()) return out;
      const need = cutoutNeedOf(filesNow(), cut[i]);
      try {
        out.set(cut[i].id, await ensureCutout(projectId, need, (f) => report((i + f) / cut.length)));
        if (!finished.includes(need.name)) finished = [...finished, need.name];
        break;
      } catch (e) {
        if (stopped()) return out;   // cancelled meanwhile: there is nothing to say
        if (isCutoutCancelled(e)) {
          if (ask < CUTOUT_ASKS) continue;
          throw new Error(STOPPED);
        }
        const message = e instanceof Error ? e.message : String(e);
        throw new Error(isNoPerson(message) ? CUTOUT_EXPORT.noPerson : `Could not remove a background for the export: ${message}`);
      }
    }
    if (stopped()) return out;
    report((i + 1) / cut.length);
  }
  return out;
}

/**
 * A clip or layer as the export is sent it when its cut-out copy is `uri` (undefined, or the switch off: `sent` itself).
 * A video: the copy's file and nothing else. The copy's timeline is the source's — its frames sit at their own source seconds —
 * so the trim, the speed, the speed spans, the pins and the gain mean in the copy exactly what they meant in the source, and it
 * carries the source's sound. It is upright, and the export reads the turn and the pixel size from the file it is given, so the
 * request says nothing about either (`sourceWidth` / `sourceHeight` stay the shape the editor showed).
 * A photo: a VIDEO clip playing the still movie beside the PNG from 0 for the photo's length — what the export's own photo step
 * would have sent on (it keeps everything else too), with the see-through background that step cannot keep.
 * A MAIN clip: the opacity is capped just under 1, which makes the compositor draw the clip's background behind the see-through
 * picture (its rule for any picture that is not fully opaque). A layer is drawn over what is beneath it as it is.
 */
export function withCutout<T extends ExportClip>(sent: T, clip: Clip, uri: string | undefined, main: boolean): T {
  if (uri === undefined || !activeCutout(clip)) return sent;
  const opacity = !main ? sent.opacity : Number.isFinite(sent.opacity) ? Math.min(sent.opacity, CUTOUT.exportOpacity) : CUTOUT.exportOpacity;
  if (!isPhoto(clip)) return { ...sent, sourceUri: uri, opacity };
  const seconds = Math.min(Math.max(0, sent.trimEnd - sent.trimStart), CUTOUT.stillSeconds);
  return { ...sent, kind: "video", sourceUri: cutoutStillName(uri), trimStart: 0, trimEnd: seconds, reversed: false, opacity };
}
