import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Asset } from "expo-asset";
import { lastFlush } from "@/src/editor/flush";
import type { AspectRatio } from "@/src/editor/model/types";
import { newId } from "@/src/lib/id";
import { storage, type PickedAsset, type ProjectSummary } from "@/src/projects";
import { useToast } from "@/src/ui/Toast";
import type { QuickRecipeId } from "./quickEdit";
import { makeQuickEdit, type QuickEditDeps } from "./quickEditFlow";

/** A bundled file as a uri that can be copied (downloaded from the dev server in Expo Go; already on disk in a build). */
async function assetUri(file: number): Promise<string> {
  const asset = Asset.fromModule(file);
  await asset.downloadAsync();
  return asset.localUri ?? asset.uri;
}
const IMPORT_NONE = /^Couldn't import any/;

export function useProjects() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      await lastFlush; // the editor's save-on-leave, so the list shows the latest edits
      setProjects(await storage.listProjects());
    } finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  /** "Project N", N one above the highest in use. */
  function nextName(): string {
    const used = projects
      .map((p) => /^Project (\d+)$/.exec(p.name)?.[1])
      .filter((n): n is string => n !== undefined)
      .map(Number);
    return `Project ${used.length > 0 ? Math.max(...used) + 1 : 1}`;
  }
  const partly = (picked: number, failed: number) => { if (failed > 0) useToast.getState().show(`${picked - failed} of ${picked} clips added; ${failed} couldn't be read`); };

  /** A new project from media that is already picked, with the ratio the creation picker chose. Null (and a toast) when it could not be made. */
  async function create(assets: PickedAsset[], aspectRatio: AspectRatio): Promise<string | null> {
    if (assets.length === 0) return null;
    const name = nextName();
    let created: Awaited<ReturnType<typeof storage.createProject>>;
    try { created = await storage.createProject(name, assets, aspectRatio); }
    catch (e) {
      console.warn("create failed", e);
      useToast.getState().show(e instanceof Error && IMPORT_NONE.test(e.message) ? e.message : "Couldn't create project");
      return null;
    }
    const { project, failed } = created;
    partly(assets.length, failed);
    await reload();
    return project.id;
  }
  /**
   * A Quick edit draft from media that is already picked, in the style chosen. Null (and a toast) when it could not be made — no
   * project is left behind then. Once the draft exists its id is returned even if the list cannot be re-read: the owner lands in
   * the draft, and the list is read again when the home screen is next in front.
   */
  async function createQuick(assets: PickedAsset[], recipeId: QuickRecipeId): Promise<string | null> {
    if (assets.length === 0) return null;
    const deps: QuickEditDeps = { storage, assetUri, newId };
    let made: Awaited<ReturnType<typeof makeQuickEdit>>;
    try { made = await makeQuickEdit(deps, nextName(), assets, recipeId); }
    catch (e) {
      console.warn("quick edit failed", e);
      useToast.getState().show(e instanceof Error && IMPORT_NONE.test(e.message) ? e.message : "Couldn't make the quick edit");
      return null;
    }
    partly(assets.length, made.failed);
    try { await reload(); } catch (e) { console.warn("reload after quick edit failed", e); }
    return made.id;
  }
  async function rename(id: string, name: string) {
    try { await storage.renameProject(id, name); await reload(); }
    catch (e) { console.warn("rename failed", e); useToast.getState().show("Couldn't rename project"); }
  }
  async function duplicate(id: string) {
    try { await storage.duplicateProject(id); await reload(); }
    catch (e) { console.warn("duplicate failed", e); useToast.getState().show("Couldn't duplicate project"); }
  }
  async function remove(id: string) {
    try { await storage.deleteProject(id); await reload(); }
    catch (e) { console.warn("delete failed", e); useToast.getState().show("Couldn't delete project"); }
  }

  return { projects, loading, reload, create, createQuick, rename, duplicate, remove };
}
