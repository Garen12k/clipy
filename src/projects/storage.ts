import { coverTimeOf, frameAt, totalDuration } from "@/src/editor/model/timeline";
import { migrateProject } from "@/src/editor/model/migrate";
import { DEFAULT_ASPECT_RATIO, DEFAULT_EXPORT_SETTINGS, isAspectRatio, newPhotoClip, newVideoClip, POST_PLATFORMS, SCHEMA_VERSION, type AspectRatio, type AudioKind, type AudioTrack, type Clip, type LayerClip, type PostPlatform, type Project } from "@/src/editor/model/types";
import type { FsAdapter } from "./fs";

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

  /** The last save asked for each project, while one is on its way: the next save of that project starts after it. */
  const saving = new Map<string, Promise<void>>();

  /**
   * One project's work on its file runs strictly one piece after another, in the order asked — a save, a recovery, a
   * read-change-write. A piece with nothing before it starts at once; one that fails rejects for its own caller and
   * holds nobody up. NEVER ask for a turn from inside a turn of the same project: it would wait for itself.
   */
  function inTurn<T>(id: string, work: () => Promise<T>): Promise<T> {
    const before = saving.get(id);
    const run = before ? before.then(work) : work();
    const turn = run.then(() => {}, () => {});
    saving.set(id, turn);
    void turn.then(() => { if (saving.get(id) === turn) saving.delete(id); });
    return run;
  }

  /**
   * Saves of ONE project run strictly one after another, in the order asked, whoever asks (the autosave, the save on
   * leaving, a rename): each writes the one tmp file and moves it over project.json, and the phone's move is queued and
   * removes project.json before it moves — two at once could leave no project.json at all. The last call's project is
   * what ends on disk; a save that fails rejects for its own caller and holds nobody up.
   */
  function saveProject(p: Project): Promise<void> { return inTurn(p.id, () => (deleted.has(p.id) ? Promise.resolve() : writeProject(p))); }

  /**
   * The projects deleted in this session, by id. A delete is a TURN of its project's chain: what was asked before it
   * ends first, then the folder goes; and whatever comes after it — a save still queued behind it, a leave save that
   * arrives late, a rename — finds the mark at the start of its own turn and writes nothing, so a deleted project can
   * never be made again as a folder with nothing but project.json. The mark is set when the delete's turn begins, taken
   * back if the folder could not be removed (the project is still there, and must still save), and cleared when a
   * project is made under that id again (ids are new each time, so in practice never).
   */
  const deleted = new Set<string>();

  function deleteProject(id: string): Promise<void> {
    return inTurn(id, async () => {
      deleted.add(id);
      try { await fs.remove(projectDir(id)); }
      catch (e) { deleted.delete(id); throw e; }
    });
  }

  /** Resolves when nothing of this project is on its way any more — every turn asked so far, and any asked meanwhile. */
  async function idle(id: string): Promise<void> {
    for (let turn = saving.get(id); turn; turn = saving.get(id)) await turn;
  }

  async function writeProject(p: Project): Promise<void> {
    await fs.mkdir(projectDir(p.id));
    const tmp = `${jsonPath(p.id)}.tmp`;
    await fs.writeText(tmp, JSON.stringify(p));
    await fs.move(tmp, jsonPath(p.id));
  }

  /**
   * The stored project, read INSIDE a turn of its chain (call it only from there). The phone's move removes project.json
   * and only then renames the tmp, so an app closed between the two leaves ONLY project.json.tmp — a whole, newer copy:
   * when project.json is NOT there and the tmp reads as a project, the tmp is moved into place and is the project.
   * Anything else is left exactly as it is and the read fails as it always did: a tmp that does not parse (a write cut
   * off mid-way) is never deleted, and a tmp never replaces a project.json that exists, readable or not.
   */
  async function readInTurn(id: string): Promise<Project> {
    try { return parse(await fs.readText(jsonPath(id))); }
    catch (e) {
      const tmp = `${jsonPath(id)}.tmp`;
      if ((await fs.exists(jsonPath(id))) || !(await fs.exists(tmp))) throw e;
      let left: Project;
      try { left = parse(await fs.readText(tmp)); } catch { throw e; }
      await fs.move(tmp, jsonPath(id));
      return left;
    }
  }

  /**
   * The stored project for a reader. The ordinary case is ONE read of project.json and nothing else — the tmp is looked
   * for only after that read failed, and then in the project's turn, so a recovery can never race a save.
   * A reader WAITS for this project's chain first (only this project's; with nothing on its way there is nothing to
   * wait for and the read is asked in the very call): opened right after it was left, with the leave save still
   * queued, the editor would otherwise get the text from before that save and its next autosave would write it back.
   */
  async function readProject(id: string): Promise<Project> {
    if (saving.has(id)) await idle(id);
    try { return parse(await fs.readText(jsonPath(id))); }
    catch { return inTurn(id, () => readInTurn(id)); }
  }

  /**
   * Read → change → write as ONE turn of the project's chain: the read sees every save asked before it, and no save
   * can land between the read and the write. Every change of a STORED project made outside the editor's store goes
   * through here — never `loadProject` and then `saveProject`, which reads before its turn and can write older content
   * back over a save that was still queued. Resolves with what was written.
   */
  function updateProject(id: string, change: (p: Project) => Project): Promise<Project> {
    return inTurn(id, async () => {
      if (deleted.has(id)) throw new Error(`project deleted: ${id}`);
      const next = change(await readInTurn(id));
      await writeProject(next);
      return next;
    });
  }

  async function loadProject(id: string) {
    const project = await readProject(id);
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
    if (deleted.has(p.id)) return;
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
    deleted.delete(id);
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
        const p = await readProject(id);
        const cover = coverFrame(p)?.path ?? null;
        out.push({ id: p.id, name: p.name, durationSec: totalDuration(p), updatedAt: p.updatedAt,
          thumbUri: cover && (await fs.exists(cover)) ? cover : (await fs.exists(thumbPath(id))) ? thumbPath(id) : null, broken: false,
          postedTo: POST_PLATFORMS.filter((pl) => p.posts.some((r) => r.platform === pl)), coverTitle: p.cover?.title ?? "" });
      } catch { out.push({ id, name: "Can't open", durationSec: 0, updatedAt: "", thumbUri: null, broken: true, postedTo: [], coverTitle: "" }); }
    }
    return out.sort((a, b) => Number(a.broken) - Number(b.broken) || b.updatedAt.localeCompare(a.updatedAt));
  }

  async function duplicateProject(id: string): Promise<Project> {
    // The source is read in ITS turn: a save of it that is still queued is in what gets copied.
    const project = await inTurn(id, () => readInTurn(id));
    const copyId = deps.newId();
    deleted.delete(copyId);
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
    await updateProject(id, (project) => ({ ...project, name: name.trim() || project.name, updatedAt: deps.nowIso() }));
  }

  return {
    projectDir, createProject, listProjects, loadProject, saveProject, updateProject,
    deleteProject,
    duplicateProject, renameProject, importAudio, importMedia, saveStill, writeCover,
  };
}

export type Storage = ReturnType<typeof makeStorage>;
