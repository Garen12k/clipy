import { totalDuration } from "@/src/editor/model/timeline";
import type { Clip, Project } from "@/src/editor/model/types";
import type { FsAdapter } from "./fs";

export interface PickedAsset { uri: string; durationSec: number; width: number; height: number; fileName?: string }
export interface ProjectSummary { id: string; name: string; durationSec: number; updatedAt: string; thumbUri: string | null; broken: boolean }
export interface StorageDeps { thumbnail(uri: string, timeMs: number): Promise<string>; newId(): string; nowIso(): string }

const ext = (a: PickedAsset) => { const m = /\.([A-Za-z0-9]+)$/.exec(a.fileName ?? a.uri); return (m?.[1] ?? "mp4").toLowerCase(); };

export function makeStorage(fs: FsAdapter, deps: StorageDeps) {
  const root = `${fs.documentDir}projects`;
  const projectDir = (id: string) => `${root}/${id}`;
  const jsonPath = (id: string) => `${projectDir(id)}/project.json`;
  const thumbPath = (id: string) => `${projectDir(id)}/thumb.jpg`;

  function parse(text: string): Project {
    const raw = JSON.parse(text) as Partial<Project>;
    if (raw.schemaVersion !== 1) throw new Error(`Unsupported project schemaVersion: ${String(raw.schemaVersion)}`);
    if (!raw.id || !Array.isArray(raw.clips)) throw new Error("Project file is missing required fields");
    return { overlays: [], audioTracks: [], ...raw } as Project;
  }

  async function saveProject(p: Project): Promise<void> {
    await fs.mkdir(projectDir(p.id));
    const tmp = `${jsonPath(p.id)}.tmp`;
    await fs.writeText(tmp, JSON.stringify(p));
    await fs.move(tmp, jsonPath(p.id));
  }

  async function loadProject(id: string) {
    const project = parse(await fs.readText(jsonPath(id)));
    const missingClipIds: string[] = [];
    for (const c of project.clips) if (!(await fs.exists(c.sourceUri))) missingClipIds.push(c.id);
    return { project, missingClipIds };
  }

  async function writeThumb(p: Project): Promise<void> {
    const first = p.clips[0];
    if (!first) return;
    try {
      const tmp = await deps.thumbnail(first.sourceUri, Math.min(500, Math.max(0, first.sourceDuration * 1000 - 1)));
      await fs.copy(tmp, thumbPath(p.id));
    } catch (e) { console.warn("thumbnail failed", e); }
  }

  async function createProject(name: string, assets: PickedAsset[]) {
    const id = deps.newId();
    const now = deps.nowIso();
    await fs.mkdir(`${projectDir(id)}/media`);
    const clips: Clip[] = [];
    let failed = 0;
    for (const a of assets) {
      const clipId = deps.newId();
      const dest = `${projectDir(id)}/media/${clipId}.${ext(a)}`;
      try {
        await fs.copy(a.uri, dest);
        clips.push({ id: clipId, sourceUri: dest, sourceDuration: a.durationSec, width: a.width, height: a.height,
          trimStart: 0, trimEnd: a.durationSec, speed: 1, filter: null, volume: 1, transitionOut: { type: "none", duration: 0 } });
      } catch (e) { failed++; console.warn("import failed", a.uri, e); }
    }
    const project: Project = { id, name, createdAt: now, updatedAt: now, aspectRatio: "9:16", clips, overlays: [], audioTracks: [], schemaVersion: 1 };
    await saveProject(project);
    await writeThumb(project);
    return { project, failed };
  }

  async function listProjects(): Promise<ProjectSummary[]> {
    if (!(await fs.exists(root))) return [];
    const out: ProjectSummary[] = [];
    for (const id of await fs.list(root)) {
      try {
        const p = parse(await fs.readText(jsonPath(id)));
        out.push({ id: p.id, name: p.name, durationSec: totalDuration(p), updatedAt: p.updatedAt,
          thumbUri: (await fs.exists(thumbPath(id))) ? thumbPath(id) : null, broken: false });
      } catch { out.push({ id, name: "Can't open", durationSec: 0, updatedAt: "", thumbUri: null, broken: true }); }
    }
    return out.sort((a, b) => Number(a.broken) - Number(b.broken) || b.updatedAt.localeCompare(a.updatedAt));
  }

  async function duplicateProject(id: string): Promise<Project> {
    const { project } = await loadProject(id);
    const copyId = deps.newId();
    await fs.mkdir(`${projectDir(copyId)}/media`);
    const clips: Clip[] = [];
    for (const c of project.clips) {
      const dest = c.sourceUri.replace(projectDir(id), projectDir(copyId));
      await fs.copy(c.sourceUri, dest);
      clips.push({ ...c, sourceUri: dest });
    }
    const copy: Project = { ...project, id: copyId, name: `${project.name} copy`, clips, createdAt: deps.nowIso(), updatedAt: deps.nowIso() };
    await saveProject(copy);
    if (await fs.exists(thumbPath(id))) await fs.copy(thumbPath(id), thumbPath(copyId));
    return copy;
  }

  async function renameProject(id: string, name: string): Promise<void> {
    const { project } = await loadProject(id);
    await saveProject({ ...project, name: name.trim() || project.name, updatedAt: deps.nowIso() });
  }

  return {
    projectDir, createProject, listProjects, loadProject, saveProject,
    deleteProject: async (id: string) => { await fs.remove(projectDir(id)); },
    duplicateProject, renameProject,
  };
}

export type Storage = ReturnType<typeof makeStorage>;
