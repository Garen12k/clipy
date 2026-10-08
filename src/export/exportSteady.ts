import { isSteadyCancelled, type ExportClip } from "@/modules/clipy-video";
import { parseSteadyName, steadyBytes, steadyOf, steadyRefusal } from "@/src/editor/model/steady";
import type { Clip } from "@/src/editor/model/types";
import { steadyNeedOf, useSteadyFiles, type SteadyFile } from "@/src/editor/steadyFiles";
import { ensureSteady, steadyDir } from "@/src/editor/steadyRenders";
import { expoFs } from "@/src/projects/expoFs";

/** The share of the export's progress that preparing the steady copies takes (only when a clip has Stabilize or an active Smooth slow motion). */
export const STEADY_SHARE = 0.3;
/** Why an export with such a clip cannot go out. */
export const STEADY_EXPORT = {
  tooLong: "A clip with Stabilize or Smooth slow motion is longer than 60 seconds. Shorten it, or switch them off.",
} as const;
/**
 * How often one clip's copy is asked for before the export gives up: a render can be stopped under the export (the editor stops
 * one it no longer needs, and every one when it is left), and the export does need it, so it asks again — by the name the editor
 * has by then.
 */
const STEADY_ASKS = 3;
const FAILED = "Could not prepare a clip for the export: ";
const STOPPED = `${FAILED}its copy was stopped before it was finished. Export again.`;

/** The finished copies in a project's steady folder, by name; a folder that cannot be read counts as empty. */
async function finishedCopies(dir: string): Promise<string[]> {
  try { return (await expoFs.list(dir)).filter((name) => parseSteadyName(name) !== null); } catch { return []; }
}
/** The clips that have a copy (`steadyOf`): a clip without a setting, a photo, a reversed or cut-out clip has none. */
const withCopy = (items: readonly Clip[]): Clip[] => items.filter((c) => steadyOf(c) !== null);

/**
 * About how many bytes the copies that `prepareSteady` would still have to MAKE for these clips take (`steadyBytes` each): the
 * export asks for that much free space on top of the video's, so a nearly full phone is told so before anything is rendered. A
 * copy that is on disk or ready costs nothing more; a copy counted for one clip serves the next, as it will when it is made. 0 —
 * and nothing is read — when no clip has a copy.
 */
export async function steadyBytesToMake(projectId: string, items: readonly Clip[]): Promise<number> {
  const made = withCopy(items).filter((c) => steadyRefusal(c) === null);
  if (made.length === 0) return 0;
  const dir = steadyDir(projectId);
  const files: Record<string, SteadyFile> = {};
  for (const name of await finishedCopies(dir)) files[name] = { status: "ready", uri: `${dir}/${name}` };
  Object.assign(files, useSteadyFiles.getState().files);
  let bytes = 0;
  for (const clip of made) {
    const need = steadyNeedOf(files, clip);
    if (need === null) continue;
    const known = files[need.name];
    if (known !== undefined && known.status === "ready") continue;
    bytes += steadyBytes(clip, need);
    files[need.name] = { status: "ready", uri: `${dir}/${need.name}` };
  }
  return bytes;
}

/**
 * The steady copies of the clips and layers that have a setting: clip id → the copy's uri. A copy that exists (and covers the
 * clip) is used; a missing one is made first, one after the other. `onProgress` runs 0 → 1 across them and never back. A copy that
 * cannot be made stops the export — it never goes out shaky or choppy where the owner asked otherwise. `stopped` (Cancel) is asked
 * before each copy and after it: once it answers true no further copy is asked for and nothing more is reported; what was gathered
 * so far is returned.
 *
 * WHICH copy a clip uses is the editor's answer (`steadyNeedOf` over its store, read again for every clip): the editor is still
 * mounted under the Export screen and cancels a running render whose name it does not need itself, so the two must name the same
 * copies. Added to what the store knows, as finished copies: the ones in the project's folder (the store is empty when no editor
 * holds the project) and the ones made here.
 */
export async function prepareSteady(projectId: string, items: readonly Clip[], onProgress: (fraction: number) => void, stopped: () => boolean = () => false): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const made = withCopy(items);
  if (made.length === 0) return out;
  if (made.some((c) => steadyRefusal(c) === "tooLong")) throw new Error(STEADY_EXPORT.tooLong);
  const dir = steadyDir(projectId);
  let finished: string[] = await finishedCopies(dir);
  const filesNow = (): Record<string, SteadyFile> => {
    const files: Record<string, SteadyFile> = {};
    for (const name of finished) files[name] = { status: "ready", uri: `${dir}/${name}` };
    return { ...files, ...useSteadyFiles.getState().files };
  };
  let top = 0;
  const report = (fraction: number): void => {
    if (stopped() || !(fraction > top)) return;
    top = fraction;
    onProgress(fraction);
  };
  for (let i = 0; i < made.length; i++) {
    for (let ask = 1; ; ask++) {
      if (stopped()) return out;
      const need = steadyNeedOf(filesNow(), made[i]);
      if (need === null) break;
      try {
        out.set(made[i].id, await ensureSteady(projectId, need, (f) => report((i + f) / made.length)));
        if (!finished.includes(need.name)) finished = [...finished, need.name];
        break;
      } catch (e) {
        if (stopped()) return out;   // cancelled meanwhile: there is nothing to say
        if (isSteadyCancelled(e)) {
          if (ask < STEADY_ASKS) continue;
          throw new Error(STOPPED);
        }
        throw new Error(`${FAILED}${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (stopped()) return out;
    report((i + 1) / made.length);
  }
  return out;
}

/**
 * A clip or layer as the export is sent it when its steady copy is `uri` (undefined, or a clip without a copy: `sent` itself): the
 * copy's file and nothing else. The copy's timeline is the source's — its frames sit at source seconds — so the trim, the speed, the
 * speed spans, the pins and the gain mean in the copy exactly what they meant in the source, and it carries the source's sound. The
 * export stretches it as it stretched the original; a Smooth slow motion copy simply has a frame for every moment it is asked for.
 */
export function withSteady<T extends ExportClip>(sent: T, clip: Clip, uri: string | undefined): T {
  return uri === undefined || steadyOf(clip) === null ? sent : { ...sent, sourceUri: uri };
}
