import { BUNDLED_TRACKS } from "@/src/editor/music";
import { BUNDLED_BEATS } from "@/src/editor/musicBeats";
import { QUICK_RECIPES, buildQuickEdit, type QuickPlan, type QuickRecipe, type QuickRecipeId } from "./quickEdit";
import type { PickedAsset, Storage } from "./storage";
import { planOfStyle, styleMusic, type UserStyle } from "./userStyles";

/** What making a draft needs from outside: the project store, a bundled file as a readable uri, a new id. */
export interface QuickEditDeps {
  storage: Pick<Storage, "createProject" | "importAudio" | "saveProject" | "deleteProject">;
  /** A bundled asset (a `require()` number) as a file uri that can be copied. */
  assetUri(file: number): Promise<string>;
  newId(): string;
}

/** A built-in style by id, or one of the owner's with its own music's uri (asked of the store first; null when it has none). */
export type QuickChoice = QuickRecipeId | { style: UserStyle; musicUri: string | null };
/** Thrown before anything is created when a style's music cannot be had. */
export const STYLE_MUSIC_MISSING = "style music missing";

type Source = { plan: QuickRecipe | QuickPlan; music: { uri: string; title: string; durationSec: number } | null; beats: readonly number[] };
async function bundledSong(deps: QuickEditDeps, trackId: string, missing: () => Error) {
  const song = BUNDLED_TRACKS.find((t) => t.id === trackId);
  if (!song) throw missing();
  return { song, uri: await deps.assetUri(song.file) };
}
async function sourceOf(deps: QuickEditDeps, choice: QuickChoice): Promise<Source> {
  if (typeof choice === "string") {
    const recipe = QUICK_RECIPES[choice];
    const { song, uri } = await bundledSong(deps, recipe.trackId, () => new Error(`Quick edit: no bundled track "${recipe.trackId}"`));
    return { plan: recipe, music: { uri, title: song.title, durationSec: song.durationSec }, beats: BUNDLED_BEATS[song.id]?.beats ?? [] };
  }
  const { plan, beats } = planOfStyle(choice.style);
  const m = styleMusic(choice.style);
  if (m === null) return { plan, music: null, beats: [] };   // none, or a bundled song no longer shipped
  if (m.kind === "bundled") {
    const { song, uri } = await bundledSong(deps, m.trackId, () => new Error(STYLE_MUSIC_MISSING));
    return { plan, music: { uri, title: song.title, durationSec: song.durationSec }, beats };
  }
  if (!choice.musicUri) throw new Error(STYLE_MUSIC_MISSING);
  return { plan, music: { uri: choice.musicUri, title: m.title, durationSec: m.durationSec }, beats };
}

/**
 * Makes a Quick edit draft and returns its id: the style's music is resolved to a file, the picked media become a new project
 * (ratio Auto), the music is copied into it, `buildQuickEdit` builds the draft, and the draft is saved over the plain project.
 * All or nothing: the music is resolved FIRST (a bundled song is downloaded from the dev server in Expo Go), so when that fails
 * nothing is created or copied; when nothing could be imported no project is made (`createProject` throws and removes its folder);
 * when anything after that fails the new project is deleted again before the error is passed on. `failed` = picked items that
 * could not be read (the draft is made from the rest). A style without music makes a draft without sound.
 */
export async function makeQuickEdit(deps: QuickEditDeps, name: string, assets: PickedAsset[], choice: QuickChoice): Promise<{ id: string; failed: number }> {
  const source = await sourceOf(deps, choice);
  const { project, failed } = await deps.storage.createProject(name, assets);
  try {
    const music = source.music ? await deps.storage.importAudio(project.id, source.music, "music") : null;
    const draft = buildQuickEdit({ recipe: source.plan, project, music, beats: source.beats, titleId: deps.newId() });
    await deps.storage.saveProject(draft);
    return { id: project.id, failed };
  } catch (e) {
    await deps.storage.deleteProject(project.id).catch(() => {});
    throw e;
  }
}
