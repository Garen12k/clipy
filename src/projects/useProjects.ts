import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { storage, type ProjectSummary } from "@/src/projects";
import { useToast } from "@/src/ui/Toast";
import { pickVideos } from "./pickVideos";

export function useProjects() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try { setProjects((await storage.listProjects()) ?? []); } finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  async function create(): Promise<string | null> {
    const assets = await pickVideos();
    if (!assets || assets.length === 0) return null;
    const name = `Project ${projects.filter((p) => !p.broken).length + 1}`;
    const { project, failed } = await storage.createProject(name, assets);
    if (failed > 0) useToast.getState().show(`${assets.length - failed} of ${assets.length} clips added; ${failed} couldn't be read`);
    await reload();
    return project.id;
  }
  async function rename(id: string, name: string) { await storage.renameProject(id, name); await reload(); }
  async function duplicate(id: string) { await storage.duplicateProject(id); await reload(); }
  async function remove(id: string) { await storage.deleteProject(id); await reload(); }

  return { projects, loading, reload, create, rename, duplicate, remove };
}
