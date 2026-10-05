import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { lastFlush } from "@/src/editor/flush";
import type { AspectRatio } from "@/src/editor/model/types";
import { storage, type PickedAsset, type ProjectSummary } from "@/src/projects";
import { useToast } from "@/src/ui/Toast";

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

  /** A new project from media that is already picked, with the ratio the creation picker chose. Null (and a toast) when it could not be made. */
  async function create(assets: PickedAsset[], aspectRatio: AspectRatio): Promise<string | null> {
    if (assets.length === 0) return null;
    const used = projects
      .map((p) => /^Project (\d+)$/.exec(p.name)?.[1])
      .filter((n): n is string => n !== undefined)
      .map(Number);
    const nextNumber = used.length > 0 ? Math.max(...used) + 1 : 1;
    const name = `Project ${nextNumber}`;
    let created: Awaited<ReturnType<typeof storage.createProject>>;
    try { created = await storage.createProject(name, assets, aspectRatio); }
    catch (e) {
      console.warn("create failed", e);
      useToast.getState().show(e instanceof Error && /^Couldn't import any/.test(e.message) ? e.message : "Couldn't create project");
      return null;
    }
    const { project, failed } = created;
    if (failed > 0) useToast.getState().show(`${assets.length - failed} of ${assets.length} clips added; ${failed} couldn't be read`);
    await reload();
    return project.id;
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

  return { projects, loading, reload, create, rename, duplicate, remove };
}
