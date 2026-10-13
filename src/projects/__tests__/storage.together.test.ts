// The serial saves (the chain per project, the tmp recovery, the "deleted" mark) and the project files (the reader that
// re-points references, Save a Copy, Open Project File) were built apart. These pin the two together.
import { makeClip, makeProject, type Project } from "@/src/editor/model/types";
import { memoryFs } from "../fs";
import { readHeader, type FileRun } from "../projectFile";
import { makeStorage } from "../storage";

type Fs = ReturnType<typeof memoryFs>;

const OLD = "file:///old/projects/p1";                                        // where the app's container was when the project was last saved
const NOW = "file:///doc/projects/p1";
const now = async () => {};
const go = (): FileRun => ({ cancelled: false });
let warn: jest.SpyInstance;
beforeEach(() => { warn = jest.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => warn.mockRestore());

function setup(ids: string[] = []) {
  const fs = memoryFs();
  let n = 0;
  const storage = makeStorage(fs, { thumbnail: async () => { fs.files.set("file:///tmp/t.jpg", "JPEG"); return "file:///tmp/t.jpg"; }, newId: () => ids.shift() ?? `id${++n}`, nowIso: () => "2026-10-13T10:00:00.000Z" });
  return { fs, storage, ids };
}
const json = (id = "p1") => `file:///doc/projects/${id}/project.json`;
const stored = (fs: Fs, id = "p1") => JSON.parse(fs.files.get(json(id)) ?? "null") as Project;
/** A project with one clip whose reference points under `root`; the clip's file is in today's folder. */
const at = (root: string, more: Partial<Project> = {}): Project =>
  makeProject({ id: "p1", name: "Beach", clips: [makeClip({ id: "c1", sourceDuration: 4, sourceUri: `${root}/media/c1.mov` })], ...more });
function holdMoves(fs: Fs) {
  const real = fs.move.bind(fs);
  let open!: () => void;
  const gate = new Promise<void>((r) => { open = r; });
  fs.move = async (from, to) => { await gate; return real(from, to); };
  return open;
}
const settle = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); };

describe("every reader of a stored project re-points its references", () => {
  test("a project left with only its tmp, saved in another container: loaded re-pointed, and the tmp's bytes become project.json unchanged", async () => {
    const { fs, storage } = setup();
    const text = JSON.stringify(at(OLD));
    fs.files.set(`${json()}.tmp`, text);
    fs.files.set(`${NOW}/media/c1.mov`, "VIDEO");
    const { project, missingSourceUris } = await storage.loadProject("p1");
    expect(project.clips[0].sourceUri).toBe(`${NOW}/media/c1.mov`);
    expect(missingSourceUris).toEqual([]);
    expect(fs.files.get(json())).toBe(text);                                  // moved, not rewritten: stored references stay until the next save
    expect(fs.files.has(`${json()}.tmp`)).toBe(false);
  });

  test("a rename is an ordinary save: it stores today's references with the new name", async () => {
    const { fs, storage } = setup();
    fs.files.set(json(), JSON.stringify(at(OLD)));
    fs.files.set(`${NOW}/media/c1.mov`, "VIDEO");
    await storage.renameProject("p1", "Trip");
    expect(stored(fs)).toMatchObject({ name: "Trip" });
    expect(stored(fs).clips[0].sourceUri).toBe(`${NOW}/media/c1.mov`);
  });

  test("a duplicate of a project saved in another container, a save of it still queued: the copy has that save and its own files", async () => {
    const { fs, storage } = setup();
    fs.files.set(json(), JSON.stringify(at(OLD)));
    fs.files.set(`${NOW}/media/c1.mov`, "VIDEO");
    const open = holdMoves(fs);
    const save = storage.saveProject(at(OLD, { ducking: true }));             // still the old references: the editor's object from before
    await settle();
    const copy = storage.duplicateProject("p1");
    await settle();
    open();
    await save;
    const made = await copy;
    expect(made.ducking).toBe(true);
    expect(made.clips[0].sourceUri).toBe(`file:///doc/projects/${made.id}/media/c1.mov`);
    expect(fs.files.get(made.clips[0].sourceUri)).toBe("VIDEO");
    expect(stored(fs, made.id).clips[0].sourceUri).toBe(made.clips[0].sourceUri);
  });
});

describe("Save a Copy reads through the chain", () => {
  test("a save still queued is in the copy", async () => {
    const { fs, storage } = setup();
    fs.files.set(`${NOW}/media/c1.mov`, "VIDEO");
    await storage.saveProject(at(NOW));
    const open = holdMoves(fs);
    const save = storage.saveProject(at(NOW, { name: "Beach, edited", ducking: true }));
    await settle();
    const pack = storage.packProject("p1", go(), now);
    await settle();
    open();
    await save;
    const made = await pack;
    expect(made).toMatchObject({ name: "Beach, edited", missing: 0 });
    const { header } = readHeader(fs.openReader(made.uri));
    expect(header.project).toMatchObject({ name: "Beach, edited", ducking: true });
    expect(header.files).toEqual([{ path: "media/c1.mov", size: 5 }]);
    expect(stored(fs)).toMatchObject({ name: "Beach, edited" });               // and the project itself is as the save left it
  });

  test("a project left with only its tmp can be saved as a copy", async () => {
    const { fs, storage } = setup();
    fs.files.set(`${json()}.tmp`, JSON.stringify(at(OLD)));
    fs.files.set(`${NOW}/media/c1.mov`, "VIDEO");
    const made = await storage.packProject("p1", go(), now);
    expect(made.missing).toBe(0);
    expect(readHeader(fs.openReader(made.uri)).header.files).toEqual([{ path: "media/c1.mov", size: 5 }]);
  });
});

describe("Open Project File beside the chain and the deleted mark", () => {
  const PICKED = "file:///picked/Beach.clipy";
  /** A copy of p1 where the picker would hand it over. */
  async function picked(s: ReturnType<typeof setup>) {
    s.fs.files.set(`${NOW}/media/c1.mov`, "VIDEO");
    await s.storage.saveProject(at(NOW));
    const made = await s.storage.packProject("p1", go(), now);
    s.fs.files.set(PICKED, s.fs.files.get(made.uri)!);
  }

  test("the opened project is an ordinary project of the chain: it saves, renames, and a delete then holds", async () => {
    const s = setup();
    await picked(s);
    const { id } = await s.storage.restoreProject(PICKED, go(), now);
    const { project } = await s.storage.loadProject(id);
    await s.storage.saveProject({ ...project, ducking: true });
    await s.storage.renameProject(id, "Opened");
    expect(stored(s.fs, id)).toMatchObject({ name: "Opened", ducking: true });
    await s.storage.deleteProject(id);
    await s.storage.saveProject({ ...project, name: "late" });
    expect([...s.fs.files.keys()].filter((k) => k.includes(`/projects/${id}/`))).toEqual([]);
    expect(stored(s.fs)).toMatchObject({ name: "Beach" });                    // the project the copy was made from: untouched throughout
  });

  test("a file opened while another project's save is queued waits for it and opens whole", async () => {
    const s = setup();
    await picked(s);
    const open = holdMoves(s.fs);
    const save = s.storage.saveProject(at(NOW, { name: "Beach 2" }));
    await settle();
    const restore = s.storage.restoreProject(PICKED, go(), now);
    await settle();
    open();
    await save;
    const { id, name } = await restore;
    expect(name).toBe("Beach");                                               // "Beach" was free: the queued save had renamed the other one
    expect(stored(s.fs, id).clips[0].sourceUri).toBe(`file:///doc/projects/${id}/media/c1.mov`);
    expect(stored(s.fs)).toMatchObject({ name: "Beach 2" });
  });

  test("a file opened under an id that was deleted in this session is alive: its saves are written", async () => {
    const s = setup();
    await picked(s);
    await s.storage.deleteProject("p1");
    s.ids.push("p1");                                                         // the next new id is the deleted one
    const { id } = await s.storage.restoreProject(PICKED, go(), now);
    expect(id).toBe("p1");
    const { project } = await s.storage.loadProject("p1");
    await s.storage.saveProject({ ...project, name: "Edited" });
    expect(stored(s.fs)).toMatchObject({ name: "Edited" });
  });
});
