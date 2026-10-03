import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { lastFlush } from "@/src/editor/flush";
import { storage, type ProjectSummary } from "@/src/projects";
import { useToast } from "@/src/ui/Toast";
import { pickMedia } from "./pickMedia";

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

  async function create(): Promise<string | null> {
    const assets = await pickMedia();
    if (!assets || assets.length === 0) return null;
    const used = projects
      .map((p) => /^Project (\d+)$/.exec(p.name)?.[1])
      .filter((n): n is string => n !== undefined)
      .map(Number);
    const nextNumber = used.length > 0 ? Math.max(...used) + 1 : 1;
    const name = `Project ${nextNumber}`;
    let created: Awaited<ReturnType<typeof storage.createProject>>;
    try { created = await storage.createProject(name, assets); }
    catch (e) { console.warn("create failed", e); useToast.getState().show("Couldn't create project"); return null; }
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
