import { coverTimeOf, frameAt, totalDuration } from "@/src/editor/model/timeline";
import { migrateProject } from "@/src/editor/model/migrate";
import { DEFAULT_ASPECT_RATIO, DEFAULT_EXPORT_SETTINGS, isAspectRatio, newPhotoClip, newVideoClip, POST_PLATFORMS, SCHEMA_VERSION, type AspectRatio, type AudioKind, type AudioTrack, type Clip, type LayerClip, type PostPlatform, type Project } from "@/src/editor/model/types";
import type { FsAdapter } from "./fs";
import { PROJECT_FILE, ProjectFileError, baseName, encodeHeader, extractFiles, fileNameFor, freeName, isSafeName, nextTurn, readHeader, totalBytes, writeProjectFile, type FileEntry, type FileHeader, type FileRun, type Pause } from "./projectFile";
import { rebaseProject } from "./rebase";

export interface PickedAsset { uri: string; kind: "video" | "photo"; durationSec: number; width: number; height: number; fileName?: string }
export interface ProjectSummary { id: string; name: string; durationSec: number; updatedAt: string; thumbUri: string | null; broken: boolean; postedTo: PostPlatform[]; coverTitle: string }
export interface StorageDeps { thumbnail(uri: string, timeMs: number): Promise<string>; newId(): string; nowIso(): string }

const extOf = (s?: string) => /\.([A-Za-z0-9]+)$/.exec(s ?? "")?.[1]?.toLowerCase();
// A picked photo may be a converted JPEG whose fileName still says .HEIC, so photos trust the uri first.
const ext = (a: PickedAsset) => (a.kind === "photo" ? extOf(a.uri) ?? extOf(a.fileName) : extOf(a.fileName) ?? extOf(a.uri)) ?? (a.kind === "photo" ? "jpg" : "mp4");

export function makeStorage(fs: FsAdapter, deps: StorageDeps) {
  const root = `${fs.documentDir}projects`;
  const projectDir = (id: string) => `${root}/${id}`;
  const jsonPath = (id: string) => `${projectDir(id)}/project.json`;
  const thumbPath = (id: string) => `${projectDir(id)}/thumb.jpg`;
  /** Any text as part of a file name. */
  const namePart = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, "_");
  const stemOf = (uri: string) => (uri.split("/").pop() ?? "").replace(/\.[A-Za-z0-9]+$/, "");
  const ms = (seconds: number) => Math.round(seconds * 1000);
  /**
   * The cover picture's file, named after the frame it holds — cover time, clip, source file and source time — so a
   * change of the frame under the cover (a trim, a reorder, replaced media) is another name: a picture is never
   * rewritten under a name it already had (Image caches by uri). Null without a cover or without a frame.
   */
  const coverFrame = (p: Project) => {
    const f = p.cover ? frameAt(p, coverTimeOf(p)) : null;
    return f ? { ...f, path: `${projectDir(p.id)}/cover-${ms(coverTimeOf(p))}-${namePart(f.clip.id)}-${namePart(stemOf(f.clip.sourceUri))}-${ms(f.sourceTime)}.jpg` } : null;
  };
  /** Every cover file this app has written, the older `cover-<ms>.jpg` included. */
  const isCoverName = (name: string) => /^cover-[A-Za-z0-9_-]+\.jpg$/.test(name);

  function parse(text: string): Project { return migrateProject(JSON.parse(text)); }
  /** The ONE reader of a stored project: migrated, and every file reference re-pointed at where the folder is now (rebase.ts). Writes nothing. */
  async function read(id: string): Promise<Project> { return rebaseProject(parse(await fs.readText(jsonPath(id))), projectDir(id)); }

  async function saveProject(p: Project): Promise<void> {
    await fs.mkdir(projectDir(p.id));
    const tmp = `${jsonPath(p.id)}.tmp`;
    await fs.writeText(tmp, JSON.stringify(p));
    await fs.move(tmp, jsonPath(p.id));
  }

  async function loadProject(id: string) {
    const project = await read(id);
    const missingSourceUris: string[] = [];
    for (const uri of new Set([...project.clips.map((c) => c.sourceUri), ...project.layers.map((l) => l.sourceUri), ...project.audioTracks.map((a) => a.sourceUri)]))
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

  /**
   * The drafts list's picture of the cover: the file `coverFrame` names holds the frame at the cover time (read clamped),
   * written only when missing. Older cover files go once the new one is there; a project without a cover keeps none.
   */
  async function writeCover(p: Project): Promise<void> {
    try {
      const names = await fs.list(projectDir(p.id));
      const f = coverFrame(p), want = f?.path ?? null;
      if (p.cover && !f) return;
      if (f && !(await fs.exists(f.path)))
        await fs.copy(f.clip.kind === "photo" ? f.clip.sourceUri : await deps.thumbnail(f.clip.sourceUri, ms(f.sourceTime)), f.path);
      for (const name of names) {
        const path = `${projectDir(p.id)}/${name}`;
        if (isCoverName(name) && path !== want) await fs.remove(path);
      }
    } catch (e) { console.warn("cover failed", e); }
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

  /** `aspectRatio`: what the creation picker chose; a new project is Auto unless told otherwise. */
  async function createProject(name: string, assets: PickedAsset[], aspectRatio: AspectRatio = DEFAULT_ASPECT_RATIO) {
    const id = deps.newId();
    const now = deps.nowIso();
    const { clips, failed } = await importMedia(id, assets);
    if (assets.length > 0 && clips.length === 0) {
      await fs.remove(projectDir(id)).catch(() => {});
      throw new Error("Couldn't import any of the selected items.");
    }
    const project: Project = { id, name, createdAt: now, updatedAt: now, aspectRatio: isAspectRatio(aspectRatio) ? aspectRatio : DEFAULT_ASPECT_RATIO, clips, overlays: [], audioTracks: [], posts: [], effects: [], layers: [], schemaVersion: SCHEMA_VERSION, ducking: false, beatMarkers: [], exportSettings: { ...DEFAULT_EXPORT_SETTINGS }, cover: null };
    await saveProject(project);
    await writeThumb(project);
    return { project, failed };
  }

  async function listProjects(): Promise<ProjectSummary[]> {
    if (!(await fs.exists(root))) return [];
    const out: ProjectSummary[] = [];
    for (const id of await fs.list(root)) {
      try {
        const p = await read(id);
        const cover = coverFrame(p)?.path ?? null;
        out.push({ id: p.id, name: p.name, durationSec: totalDuration(p), updatedAt: p.updatedAt,
          thumbUri: cover && (await fs.exists(cover)) ? cover : (await fs.exists(thumbPath(id))) ? thumbPath(id) : null, broken: false,
          postedTo: POST_PLATFORMS.filter((pl) => p.posts.some((r) => r.platform === pl)), coverTitle: p.cover?.title ?? "" });
      } catch { out.push({ id, name: "Can't open", durationSec: 0, updatedAt: "", thumbUri: null, broken: true, postedTo: [], coverTitle: "" }); }
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
    const layers: LayerClip[] = [];
    for (const l of project.layers) {
      const dest = l.sourceUri.replace(projectDir(id), projectDir(copyId));
      await fs.copy(l.sourceUri, dest);
      layers.push({ ...l, sourceUri: dest });
    }
    const audioTracks: AudioTrack[] = [];
    for (const a of project.audioTracks) {
      const dest = a.sourceUri.replace(projectDir(id), projectDir(copyId));
      await fs.copy(a.sourceUri, dest);
      audioTracks.push({ ...a, sourceUri: dest });
    }
    const copy: Project = { ...project, id: copyId, name: `${project.name} copy`, clips, layers, audioTracks, createdAt: deps.nowIso(), updatedAt: deps.nowIso(), posts: [] };
    await saveProject(copy);
    if (await fs.exists(thumbPath(id))) await fs.copy(thumbPath(id), thumbPath(copyId));
    for (const name of await fs.list(projectDir(id))) if (isCoverName(name)) await fs.copy(`${projectDir(id)}/${name}`, `${projectDir(copyId)}/${name}`);
    return copy;
  }

  async function importAudio(projectId: string, a: { uri: string; title: string; durationSec: number }, kind: AudioKind = "music"): Promise<AudioTrack> {
    const id = deps.newId();
    const m = /\.([A-Za-z0-9]+)$/.exec(a.title) ?? /\.([A-Za-z0-9]+)$/.exec(a.uri);
    const dest = `${projectDir(projectId)}/media/${id}.${(m?.[1] ?? "m4a").toLowerCase()}`;
    await fs.mkdir(`${projectDir(projectId)}/media`);
    await fs.copy(a.uri, dest);
    return { id, sourceUri: dest, title: a.title, sourceDuration: a.durationSec, start: 0, trimStart: 0, trimEnd: a.durationSec, volume: 1, kind, fadeIn: 0, fadeOut: 0 };
  }

  async function renameProject(id: string, name: string): Promise<void> {
    const { project } = await loadProject(id);
    await saveProject({ ...project, name: name.trim() || project.name, updatedAt: deps.nowIso() });
  }

  // —— Project files (.clipy): Save a Copy and Open Project File. Spec: docs/superpowers/specs/2026-10-13-project-backup-design.md ——
  /** Where a copy is written before it is shared; and where an opened file is laid out before its folder is moved into place. Both are swept whole. */
  const filesDir = `${fs.cacheDir}project-files`;
  const incoming = `${fs.documentDir}incoming`;
  const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
  /** Every item's reference rewritten by `to` — clips, layers and sounds: the model's only file references (rebase.guard.test.ts). */
  const pointed = (list: unknown, to: (uri: unknown) => string): unknown => (Array.isArray(list) ? list.map((x) => (isObj(x) ? { ...x, sourceUri: to(x.sourceUri) } : x)) : list);

  /** Removes a temporary, whatever the file system answers — a clean-up must never be the failure that is reported. */
  async function gone(path: string): Promise<void> { try { await fs.remove(path); } catch { /* swept again on the next run and the next launch */ } }

  /** Removes everything a save or an open may have left behind (a run that was killed). Never throws. Only one run exists at a time. */
  async function sweepProjectFiles(): Promise<void> {
    await gone(filesDir);
    await gone(incoming);
  }

  /**
   * ONE project as one file in the cache, named after it: the document with relative references, each source file once, the
   * thumbnail. No cover picture and no cache folder — they are made again. Written as `part-…` and moved into place only when
   * complete. A source file that is missing (or is not `<project>/media/<name>`) is left out and counted.
   */
  async function packProject(id: string, run: FileRun, pause: Pause = nextTurn): Promise<{ uri: string; name: string; bytes: number; missing: number }> {
    await sweepProjectFiles();
    const { project } = await loadProject(id);
    const dir = projectDir(id);
    const rel = (uri: unknown) => `media/${baseName(uri)}`;
    const files: FileEntry[] = [];
    const seen = new Set<string>();
    let missing = 0;
    for (const uri of [...project.clips, ...project.layers, ...project.audioTracks].map((x) => x.sourceUri)) {
      const path = rel(uri);
      if (seen.has(path)) continue;
      seen.add(path);
      const size = isSafeName(baseName(uri)) && uri === `${dir}/${path}` ? await fs.size(uri) : null;
      if (size === null) missing++; else files.push({ path, size });
    }
    const thumb = await fs.size(thumbPath(id));
    if (thumb !== null) files.push({ path: "thumb.jpg", size: thumb });
    const doc = { ...project, clips: pointed(project.clips, rel), layers: pointed(project.layers, rel), audioTracks: pointed(project.audioTracks, rel) } as unknown as Record<string, unknown>;
    const header: FileHeader = { app: "clipy", schemaVersion: SCHEMA_VERSION, savedAt: deps.nowIso(), name: project.name, project: doc, files };
    const bytes = totalBytes(encodeHeader(header).byteLength, files);
    const free = await fs.freeBytes();
    if (free < bytes + PROJECT_FILE.spare) throw new ProjectFileError("space", bytes + PROJECT_FILE.spare, free);
    run.onStart?.({ name: project.name, bytes });
    const runId = deps.newId();
    const part = `${filesDir}/part-${runId}.${PROJECT_FILE.ext}`, home = `${filesDir}/${runId}`;
    const uri = `${home}/${encodeURIComponent(fileNameFor(project.name))}`;
    try {
      const out = fs.openWriter(part);
      try { await writeProjectFile(out, header, (path) => fs.openReader(`${dir}/${path}`), run, pause); } finally { out.close(); }
      await fs.mkdir(home);
      await fs.move(part, uri);
    } catch (e) {
      await gone(part);
      await gone(home);
      throw e;
    }
    return { uri, name: project.name, bytes, missing };
  }

  /**
   * A project file as a NEW project (a new id; no existing project is ever touched). The file is proved complete and readable by
   * this app before anything is written; its files are laid out in `incoming/`, project.json LAST, and the folder is moved into
   * place in one rename — so a half-opened project is never listed. Item ids and file base names are kept (a speech bar is known
   * by its file name; cache names come from the stem). Any failure or a cancel leaves nothing. The picked file is the caller's.
   */
  async function restoreProject(fileUri: string, run: FileRun, pause: Pause = nextTurn): Promise<{ id: string; name: string }> {
    await sweepProjectFiles();
    const id = deps.newId();
    const stage = `${incoming}/${id}`, dir = projectDir(id);
    // The new project's folder must not exist: a folder moved onto an existing one lands INSIDE it (expoFs.moveDir), and the
    // clean-up below removes `dir` — which must only ever be a folder this run made.
    if (await fs.exists(dir)) throw new Error("project file: the new project's folder already exists");
    const src = fs.openReader(fileUri);
    let restored: Project;
    let hasThumb = false;
    try {
      const { header, bodyStart } = readHeader(src);
      if (header.schemaVersion > SCHEMA_VERSION) throw new ProjectFileError("newer");
      const at = (uri: unknown) => `${dir}/media/${isSafeName(baseName(uri)) ? baseName(uri) : "missing"}`;
      const raw = header.project;
      let project: Project;
      try { project = migrateProject({ ...raw, id, clips: pointed(raw.clips, at), layers: pointed(raw.layers, at), audioTracks: pointed(raw.audioTracks, at) }); }
      catch (e) { throw new ProjectFileError(e instanceof Error && /newer version/.test(e.message) ? "newer" : "damaged"); }
      const bytes = header.files.reduce((n, f) => n + f.size, 0);
      const free = await fs.freeBytes();
      if (free < bytes + PROJECT_FILE.spare) throw new ProjectFileError("space", bytes + PROJECT_FILE.spare, free);
      const wanted = (typeof project.name === "string" && project.name.trim()) || header.name.trim() || "Project";
      const name = freeName(wanted, (await listProjects()).filter((p) => !p.broken).map((p) => p.name));
      run.onStart?.({ name, bytes });
      await fs.mkdir(`${stage}/media`);
      await extractFiles(src, header, bodyStart, (path) => fs.openWriter(`${stage}/${path}`), run, pause);
      restored = { ...project, name, updatedAt: deps.nowIso() };
      await fs.writeText(`${stage}/project.json`, JSON.stringify(restored));
      await fs.mkdir(root);
      await fs.moveDir(stage, dir);
      hasThumb = header.files.some((f) => f.path === "thumb.jpg");
    } catch (e) {
      await gone(stage);
      await gone(dir);
      throw e;
    } finally { src.close(); }
    // The pictures of the card: best effort, neither throws.
    if (!hasThumb) await writeThumb(restored);
    await writeCover(restored);
    return { id, name: restored.name };
  }

  return {
    projectDir, createProject, listProjects, loadProject, saveProject,
    deleteProject: async (id: string) => { await fs.remove(projectDir(id)); },
    duplicateProject, renameProject, importAudio, importMedia, saveStill, writeCover,
    packProject, restoreProject, sweepProjectFiles,
  };
}

export type Storage = ReturnType<typeof makeStorage>;
