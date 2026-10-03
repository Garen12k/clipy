import { totalDuration } from "@/src/editor/model/timeline";
import { migrateProject } from "@/src/editor/model/migrate";
import { newPhotoClip, newVideoClip, POST_PLATFORMS, SCHEMA_VERSION, type AudioTrack, type Clip, type PostPlatform, type Project } from "@/src/editor/model/types";
import type { FsAdapter } from "./fs";

export interface PickedAsset { uri: string; kind: "video" | "photo"; durationSec: number; width: number; height: number; fileName?: string }
export interface ProjectSummary { id: string; name: string; durationSec: number; updatedAt: string; thumbUri: string | null; broken: boolean; postedTo: PostPlatform[] }
export interface StorageDeps { thumbnail(uri: string, timeMs: number): Promise<string>; newId(): string; nowIso(): string }

const extOf = (s?: string) => /\.([A-Za-z0-9]+)$/.exec(s ?? "")?.[1]?.toLowerCase();
// A picked photo may be a converted JPEG whose fileName still says .HEIC, so photos trust the uri first.
const ext = (a: PickedAsset) => (a.kind === "photo" ? extOf(a.uri) ?? extOf(a.fileName) : extOf(a.fileName) ?? extOf(a.uri)) ?? (a.kind === "photo" ? "jpg" : "mp4");

export function makeStorage(fs: FsAdapter, deps: StorageDeps) {
  const root = `${fs.documentDir}projects`;
  const projectDir = (id: string) => `${root}/${id}`;
  const jsonPath = (id: string) => `${projectDir(id)}/project.json`;
  const thumbPath = (id: string) => `${projectDir(id)}/thumb.jpg`;

  function parse(text: string): Project { return migrateProject(JSON.parse(text)); }

  async function saveProject(p: Project): Promise<void> {
    await fs.mkdir(projectDir(p.id));
    const tmp = `${jsonPath(p.id)}.tmp`;
    await fs.writeText(tmp, JSON.stringify(p));
    await fs.move(tmp, jsonPath(p.id));
  }

  async function loadProject(id: string) {
    const project = parse(await fs.readText(jsonPath(id)));
    const missingSourceUris: string[] = [];
    for (const uri of new Set([...project.clips.map((c) => c.sourceUri), ...project.audioTracks.map((a) => a.sourceUri)]))
      if (!(await fs.exists(uri))) missingSourceUris.push(uri);
    return { project, missingSourceUris };
  }

  async function writeThumb(p: Project): Promise<void> {
    const first = p.clips[0];
    if (!first) return;
    try {
      if (first.kind === "photo") { await fs.copy(first.sourceUri, thumbPath(p.id)); return; }
      const tmp = await deps.thumbnail(first.sourceUri, Math.min(500, Math.max(0, first.sourceDuration * 1000 - 1)));
      await fs.copy(tmp, thumbPath(p.id));
    } catch (e) { console.warn("thumbnail failed", e); }
  }

  async function importMedia(projectId: string, assets: PickedAsset[]): Promise<{ clips: Clip[]; failed: number }> {
    const mediaDir = `${projectDir(projectId)}/media`;
    await fs.mkdir(mediaDir);
    const clips: Clip[] = [];
    let failed = 0;
    for (const a of assets) {
      const badSize = a.kind === "photo" && !(a.width > 0 && a.height > 0);
      const badDuration = a.kind === "video" && !(a.durationSec > 0);
      if (badSize || badDuration) { failed++; console.warn("import failed: no size or duration", a.uri); continue; }
      const clipId = deps.newId();
      const dest = `${mediaDir}/${clipId}.${ext(a)}`;
      try {
        await fs.copy(a.uri, dest);
        clips.push(a.kind === "photo"
          ? newPhotoClip({ id: clipId, sourceUri: dest, width: a.width, height: a.height })
          : newVideoClip({ id: clipId, sourceUri: dest, sourceDuration: a.durationSec, width: a.width, height: a.height }));
      } catch (e) { failed++; console.warn("import failed", a.uri, e); await fs.remove(dest).catch(() => {}); }
    }
    return { clips, failed };
  }

  async function saveStill(projectId: string, tempUri: string): Promise<{ uri: string }> {
    const mediaDir = `${projectDir(projectId)}/media`;
    await fs.mkdir(mediaDir);
    const uri = `${mediaDir}/${deps.newId()}.jpg`;
    try { await fs.copy(tempUri, uri); }
    catch (e) { await fs.remove(uri).catch(() => {}); throw e; }
    return { uri };
  }

  async function createProject(name: string, assets: PickedAsset[]) {
    const id = deps.newId();
    const now = deps.nowIso();
    const { clips, failed } = await importMedia(id, assets);
    if (assets.length > 0 && clips.length === 0) {
      await fs.remove(projectDir(id)).catch(() => {});
      throw new Error("Couldn't import any of the selected items.");
    }
    const project: Project = { id, name, createdAt: now, updatedAt: now, aspectRatio: "9:16", clips, overlays: [], audioTracks: [], posts: [], schemaVersion: SCHEMA_VERSION };
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
          thumbUri: (await fs.exists(thumbPath(id))) ? thumbPath(id) : null, broken: false,
          postedTo: POST_PLATFORMS.filter((pl) => p.posts.some((r) => r.platform === pl)) });
      } catch { out.push({ id, name: "Can't open", durationSec: 0, updatedAt: "", thumbUri: null, broken: true, postedTo: [] }); }
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
    const audioTracks: AudioTrack[] = [];
    for (const a of project.audioTracks) {
      const dest = a.sourceUri.replace(projectDir(id), projectDir(copyId));
      await fs.copy(a.sourceUri, dest);
      audioTracks.push({ ...a, sourceUri: dest });
    }
    const copy: Project = { ...project, id: copyId, name: `${project.name} copy`, clips, audioTracks, createdAt: deps.nowIso(), updatedAt: deps.nowIso(), posts: [] };
    await saveProject(copy);
    if (await fs.exists(thumbPath(id))) await fs.copy(thumbPath(id), thumbPath(copyId));
    return copy;
  }

  async function importAudio(projectId: string, a: { uri: string; title: string; durationSec: number }): Promise<AudioTrack> {
    const id = deps.newId();
    const m = /\.([A-Za-z0-9]+)$/.exec(a.title) ?? /\.([A-Za-z0-9]+)$/.exec(a.uri);
    const dest = `${projectDir(projectId)}/media/${id}.${(m?.[1] ?? "m4a").toLowerCase()}`;
    await fs.mkdir(`${projectDir(projectId)}/media`);
    await fs.copy(a.uri, dest);
    return { id, sourceUri: dest, title: a.title, sourceDuration: a.durationSec, start: 0, trimStart: 0, trimEnd: a.durationSec, volume: 1 };
  }

  async function renameProject(id: string, name: string): Promise<void> {
    const { project } = await loadProject(id);
    await saveProject({ ...project, name: name.trim() || project.name, updatedAt: deps.nowIso() });
  }

  return {
    projectDir, createProject, listProjects, loadProject, saveProject,
    deleteProject: async (id: string) => { await fs.remove(projectDir(id)); },
    duplicateProject, renameProject, importAudio, importMedia, saveStill,
  };
}

export type Storage = ReturnType<typeof makeStorage>;
