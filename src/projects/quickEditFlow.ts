import { BUNDLED_TRACKS } from "@/src/editor/music";
import { BUNDLED_BEATS } from "@/src/editor/musicBeats";
import { QUICK_RECIPES, buildQuickEdit, type QuickRecipeId } from "./quickEdit";
import type { PickedAsset, Storage } from "./storage";

/** What making a draft needs from outside: the project store, a bundled file as a readable uri, a new id. */
export interface QuickEditDeps {
  storage: Pick<Storage, "createProject" | "importAudio" | "saveProject" | "deleteProject">;
  /** A bundled asset (a `require()` number) as a file uri that can be copied. */
  assetUri(file: number): Promise<string>;
  newId(): string;
}

/**
 * Makes a Quick edit draft and returns its id: the recipe's bundled track is resolved to a file, the picked media become a new
 * project (ratio Auto), the track is copied into it, `buildQuickEdit` builds the draft, and the draft is saved over the plain project.
 * All or nothing: the music is resolved FIRST (in Expo Go it is downloaded from the dev server), so when that fails nothing is
 * created or copied; when nothing could be imported no project is made (`createProject` throws and removes its folder); when anything
 * after that fails the new project is deleted again before the error is passed on. `failed` = picked items that could not be read
 * (the draft is made from the rest).
 */
export async function makeQuickEdit(deps: QuickEditDeps, name: string, assets: PickedAsset[], recipeId: QuickRecipeId): Promise<{ id: string; failed: number }> {
  const recipe = QUICK_RECIPES[recipeId];
  const song = BUNDLED_TRACKS.find((t) => t.id === recipe.trackId);
  if (!song) throw new Error(`Quick edit: no bundled track "${recipe.trackId}"`);
  const songUri = await deps.assetUri(song.file);
  const { project, failed } = await deps.storage.createProject(name, assets);
  try {
    const music = await deps.storage.importAudio(project.id, { uri: songUri, title: song.title, durationSec: song.durationSec }, "music");
    const draft = buildQuickEdit({ recipe, project, music, beats: BUNDLED_BEATS[song.id]?.beats ?? [], titleId: deps.newId() });
    await deps.storage.saveProject(draft);
    return { id: project.id, failed };
  } catch (e) {
    await deps.storage.deleteProject(project.id).catch(() => {});
    throw e;
  }
}
