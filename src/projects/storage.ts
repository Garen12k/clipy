import { coverTimeOf, frameAt, totalDuration } from "@/src/editor/model/timeline";
import { migrateProject } from "@/src/editor/model/migrate";
import { DEFAULT_ASPECT_RATIO, DEFAULT_EXPORT_SETTINGS, isAspectRatio, newPhotoClip, newVideoClip, POST_PLATFORMS, SCHEMA_VERSION, type AspectRatio, type AudioKind, type AudioTrack, type Clip, type LayerClip, type PostPlatform, type Project } from "@/src/editor/model/types";
import type { FsAdapter } from "./fs";
import { HISTORY_FILE, decodeHistory, encodeHistory, fitSnapshots, lineOf, stampOf } from "./history";
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
  const historyPath = (id: string) => `${projectDir(id)}/${HISTORY_FILE.name}`;
  /** Any text as part of a file name. */
  const namePart = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, "_");
  const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
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
  /**
   * The ONE reader of a stored project: migrated, and every file reference re-pointed at where the folder is now (rebase.ts).
   * Writes nothing. `path` is project.json, or — for the recovery alone — the project's tmp. Everything that reads a stored
   * project (`readProject`, `readInTurn`) reads through here, so a loaded, a listed, a recovered, a renamed and a duplicated
   * project are all rebased the same way. `text` is the very string that was parsed (what a history's stamp is taken from).
   */
  async function readDoc(id: string, path = jsonPath(id)): Promise<{ project: Project; text: string }> {
    const text = await fs.readText(path);
    return { project: rebaseProject(parse(text), projectDir(id)), text };
  }

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

  /** `text`: the string to write when the caller needs the very one (a history's stamp) — else it is made here, as always. */
  async function writeProject(p: Project, text?: string): Promise<void> {
    await fs.mkdir(projectDir(p.id));
    const tmp = `${jsonPath(p.id)}.tmp`;
    await fs.writeText(tmp, text ?? JSON.stringify(p));
    await fs.move(tmp, jsonPath(p.id));
  }

  /**
   * The stored project, read INSIDE a turn of its chain (call it only from there). The phone's move removes project.json
   * and only then renames the tmp, so an app closed between the two leaves ONLY project.json.tmp — a whole, newer copy:
   * when project.json is NOT there and the tmp reads as a project, the tmp is moved into place and is the project.
   * Anything else is left exactly as it is and the read fails as it always did: a tmp that does not parse (a write cut
   * off mid-way) is never deleted, and a tmp never replaces a project.json that exists, readable or not.
   */
  async function readDocInTurn(id: string): Promise<{ project: Project; text: string }> {
    try { return await readDoc(id); }
    catch (e) {
      const tmp = `${jsonPath(id)}.tmp`;
      if ((await fs.exists(jsonPath(id))) || !(await fs.exists(tmp))) throw e;
      let left: { project: Project; text: string };
      try { left = await readDoc(id, tmp); } catch { throw e; }
      await fs.move(tmp, jsonPath(id));
      return left;
    }
  }
  async function readInTurn(id: string): Promise<Project> { return (await readDocInTurn(id)).project; }

  /**
   * The stored project for a reader. The ordinary case is ONE read of project.json and nothing else — the tmp is looked
   * for only after that read failed, and then in the project's turn, so a recovery can never race a save.
   * A reader WAITS for this project's chain first (only this project's; with nothing on its way there is nothing to
   * wait for and the read is asked in the very call): opened right after it was left, with the leave save still
   * queued, the editor would otherwise get the text from before that save and its next autosave would write it back.
   */
  async function readProject(id: string): Promise<{ project: Project; text: string }> {
    if (saving.has(id)) await idle(id);
    try { return await readDoc(id); }
    catch { return inTurn(id, () => readDocInTurn(id)); }
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
    const { project, text } = await readProject(id);
    const missingSourceUris: string[] = [];
    for (const uri of new Set([...project.clips.map((c) => c.sourceUri), ...project.layers.map((l) => l.sourceUri), ...project.audioTracks.map((a) => a.sourceUri)]))
      if (!(await fs.exists(uri))) missingSourceUris.push(uri);
    // `stamp` names the very text this project came from: only a history written beside that text is ever applied to it (loadHistory).
    return { project, missingSourceUris, stamp: stampOf(text) };
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
        const { project: p } = await readProject(id);
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

  // —— Undo history kept with the project. Spec: docs/superpowers/specs/2026-10-13-undo-history-design.md ——
  const sourcesOf = (p: Project): string[] => [...p.clips, ...p.layers, ...p.audioTracks].map((x) => x.sourceUri);

  /**
   * The stacks as `<project>/history.jsonl`, stamped `stamp` — called ONLY inside a turn of the project's chain, with the stamp
   * of the text that is project.json in that turn. Capped (`fitSnapshots`: nothing beyond the caps is even turned into text),
   * written as a `.tmp` and moved into place, so a write cut off mid-way leaves only a `.tmp`, which nothing reads. Never
   * throws and never touches project.json; false when nothing was written (the old history, or none, stays — its stamp no
   * longer names project.json, so it is dropped on the next open).
   */
  async function writeHistory(id: string, stamp: string, past: readonly Project[], future: readonly Project[]): Promise<boolean> {
    try {
      const path = historyPath(id);
      const kept = fitSnapshots(past, future);
      if (kept.past.length + kept.future.length === 0) { await fs.remove(path); return false; }
      const tmp = `${path}.tmp`;
      await fs.writeText(tmp, encodeHistory(id, SCHEMA_VERSION, stamp, kept));
      await fs.move(tmp, path);
      return true;
    } catch (e) { console.warn("history save failed", e); return false; }
  }

  /**
   * The editor's undo and redo stacks for a project that is ALREADY on disk as `p` — checked, not trusted: nothing is written
   * unless project.json is this project's own text. The check and the write are ONE turn of the project's chain, so no save can
   * land between them; a deleted project gets nothing. Never throws; false when nothing was written.
   */
  function saveHistory(p: Project, past: readonly Project[], future: readonly Project[]): Promise<boolean> {
    return inTurn(p.id, async () => {
      try {
        if (deleted.has(p.id)) return false;
        const stamp = stampOf(lineOf(p));
        if (stampOf(await fs.readText(jsonPath(p.id))) !== stamp) return false;
      } catch (e) { console.warn("history save failed", e); return false; }
      return writeHistory(p.id, stampOf(lineOf(p)), past, future);
    });
  }

  /**
   * The project AND the history that belongs to it, as ONE turn of the project's chain — how the editor keeps its undo steps
   * (historyKeeper.ts). The project is written exactly as `saveProject` writes it; only when that write has landed is the
   * history written, stamped from the SAME string, and nothing else can write project.json in between (same turn).
   * `saved` is the project's save and nothing more: it settles the moment project.json is in place (or could not be put
   * there) and never waits for, and never hears of, the history. `kept` says whether a history was written; it never rejects
   * (a history that fails is a warning; a project that could not be saved, or was deleted, gets none).
   */
  function saveWithHistory(p: Project, past: readonly Project[], future: readonly Project[]): { saved: Promise<void>; kept: Promise<boolean> } {
    let done!: () => void, fail!: (e: unknown) => void;
    const saved = new Promise<void>((yes, no) => { done = yes; fail = no; });
    const kept = inTurn(p.id, async () => {
      if (deleted.has(p.id)) { done(); return false; }
      const text = JSON.stringify(p);
      try { await writeProject(p, text); } catch (e) { fail(e); return false; }
      done();
      await Promise.resolve();                                                // whoever waits for the save hears first
      return writeHistory(p.id, stampOf(text), past, future);
    });
    return { saved, kept };
  }

  /**
   * The stacks to give back to a project that `loadProject` has just read (`stamp` is that read's) — or null. Applied to nothing
   * else: another stamp, project, schema or file version, a cut-off file, a line that is not a snapshot of this project in this
   * schema, and ALL of it is dropped. Each snapshot gets what a project gets on load (the sanity pass, the re-pointing), one per
   * `pause`. A step that needs a file which is gone — and which the opened project does not itself reference — cuts its stack:
   * undo keeps the newer steps, redo the nearer ones. Writes nothing, removes nothing, never throws.
   */
  async function loadHistory(project: Project, stamp: string, pause: Pause = nextTurn): Promise<{ past: Project[]; future: Project[] } | null> {
    try {
      const dir = projectDir(project.id), path = historyPath(project.id);
      const size = await fs.size(path);
      if (size === null || size > HISTORY_FILE.maxBytes) return null;
      const found = decodeHistory(await fs.readText(path), project.id, SCHEMA_VERSION, stamp);
      if (!found) return null;
      const snapshot = async (line: string): Promise<Project> => {
        await pause();
        const raw: unknown = JSON.parse(line);
        if (!isObj(raw) || raw.id !== project.id || raw.schemaVersion !== SCHEMA_VERSION) throw new Error("history: not a snapshot of this project");
        return rebaseProject(migrateProject(raw), dir);
      };
      const past: Project[] = [], future: Project[] = [];
      for (const line of found.past) past.push(await snapshot(line));
      for (const line of found.future) future.push(await snapshot(line));
      const there = new Map<string, boolean>(sourcesOf(project).map((uri): [string, boolean] => [uri, true]));
      const whole = async (p: Project): Promise<boolean> => {
        for (const uri of sourcesOf(p)) {
          let ok = there.get(uri);
          if (ok === undefined) { ok = await fs.exists(uri); there.set(uri, ok); }
          if (!ok) return false;
        }
        return true;
      };
      let from = past.length;
      while (from > 0 && (await whole(past[from - 1]))) from--;
      let to = 0;
      while (to < future.length && (await whole(future[to]))) to++;
      const kept = { past: past.slice(from), future: future.slice(0, to) };
      return kept.past.length + kept.future.length > 0 ? kept : null;
    } catch (e) { console.warn("history load failed", e); return null; }
  }

  // —— Project files (.clipy): Save a Copy and Open Project File. Spec: docs/superpowers/specs/2026-10-13-project-backup-design.md ——
  /** Where a copy is written before it is shared; and where an opened file is laid out before its folder is moved into place. Both are swept whole. */
  const filesDir = `${fs.cacheDir}project-files`;
  const incoming = `${fs.documentDir}incoming`;
  /** Every item's reference rewritten by `to` — clips, layers and sounds: the model's only file references (rebase.guard.test.ts). */
  const pointed = (list: unknown, to: (uri: unknown) => string): unknown => (Array.isArray(list) ? list.map((x) => (isObj(x) ? { ...x, sourceUri: to(x.sourceUri) } : x)) : list);

  /** True only when the phone SAYS it has less room than `need`: no answer (the system's value may be null) is "unknown — go on", never "0 B free". */
  const tooFull = (free: unknown, need: number): free is number => typeof free === "number" && free < need;

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
    if (tooFull(free, bytes + PROJECT_FILE.spare)) throw new ProjectFileError("space", bytes + PROJECT_FILE.spare, free);
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
    deleted.delete(id);                                                       // a project is made under this id: it is alive, whatever was deleted under it before
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
      if (tooFull(free, bytes + PROJECT_FILE.spare)) throw new ProjectFileError("space", bytes + PROJECT_FILE.spare, free);
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
    projectDir, createProject, listProjects, loadProject, saveProject, updateProject,
    deleteProject,
    duplicateProject, renameProject, importAudio, importMedia, saveStill, writeCover, saveHistory, saveWithHistory, loadHistory,
    packProject, restoreProject, sweepProjectFiles,
  };
}

export type Storage = ReturnType<typeof makeStorage>;
