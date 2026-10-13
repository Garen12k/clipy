// Two more holes of the serial saves. (1) Opening a project read project.json WITHOUT waiting for that project's chain:
// opened right after it was left (the leave save still queued), the editor got the text from BEFORE that save and its
// next autosave wrote it back. (2) Delete was outside the chain: a save queued before it landed after it and made the
// folder again — a project with nothing but project.json.
import { makeProject, type Project } from "@/src/editor/model/types";
import { memoryFs } from "../fs";
import { makeStorage } from "../storage";

type Fs = ReturnType<typeof memoryFs>;

function setup(newId?: () => string) {
  const fs = memoryFs();
  let n = 0;
  const storage = makeStorage(fs, { thumbnail: async () => "file:///tmp/t.jpg", newId: newId ?? (() => `id${++n}`), nowIso: () => "2026-10-13T10:00:00.000Z" });
  return { fs, storage };
}
const dir = (fs: Fs, id = "p1") => `${fs.documentDir}projects/${id}`;
const json = (fs: Fs, id = "p1") => `${dir(fs, id)}/project.json`;
const named = (name: string, id = "p1"): Project => makeProject({ id, name });
const text = (name: string, id = "p1") => JSON.stringify(named(name, id));
/** Everything of one project that is on disk: files and folders. */
const left = (fs: Fs, id = "p1") => [...fs.files.keys(), ...fs.dirs].filter((p) => p.startsWith(dir(fs, id)));
/** The phone's queue is busy: every move waits until `open()`. `only` = just that project's. */
function holdMoves(fs: Fs, only?: string) {
  const real = fs.move.bind(fs);
  let open!: () => void;
  const gate = new Promise<void>((r) => { open = r; });
  fs.move = async (from, to) => { if (!only || from.includes(`/${only}/`)) await gate; return real(from, to); };
  return open;
}
const settle = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); };
/** Every file-system call made, by name and file. */
function spy(fs: Fs) {
  const calls: string[] = [];
  for (const name of ["exists", "readText", "writeText", "move", "remove", "copy", "mkdir", "list"] as const) {
    const real = (fs[name] as (...a: string[]) => Promise<unknown>).bind(fs);
    (fs as unknown as Record<string, unknown>)[name] = (...a: string[]) => { calls.push(`${name} ${a[0].split("/").pop()}`); return real(...a); };
  }
  return calls;
}
const state = async (p: Promise<unknown>) => { let s = "waiting"; void p.then(() => { s = "done"; }, () => { s = "failed"; }); await settle(); return s; };

describe("opening waits for a save that is still queued", () => {
  test("a save of B still on its way, then open: B is what is loaded", async () => {
    const { fs, storage } = setup();
    await storage.saveProject(named("A"));
    const open = holdMoves(fs);
    const save = storage.saveProject(named("B"));                             // the leave save: its move waits
    await settle();
    const load = storage.loadProject("p1");
    expect(await state(load)).toBe("waiting");
    open();
    await save;
    expect((await load).project.name).toBe("B");
    expect(fs.files.get(json(fs))).toBe(text("B"));
  });

  test("two saves queued, then open: the LAST one is what is loaded", async () => {
    const { fs, storage } = setup();
    await storage.saveProject(named("A"));
    const open = holdMoves(fs);
    const saves = [storage.saveProject(named("B")), storage.saveProject(named("C"))];
    await settle();
    const load = storage.loadProject("p1");
    await settle();
    open();
    await Promise.all(saves);
    expect((await load).project.name).toBe("C");
  });

  test("a save asked while the open is waiting is waited for too", async () => {
    const { fs, storage } = setup();
    await storage.saveProject(named("A"));
    const open = holdMoves(fs);
    const first = storage.saveProject(named("B"));
    await settle();
    const load = storage.loadProject("p1");
    await settle();
    const second = storage.saveProject(named("C"));
    await settle();
    open();
    await Promise.all([first, second]);
    expect((await load).project.name).toBe("C");
  });

  test("a queued save that FAILS holds the open up no longer than itself: what is on disk is loaded", async () => {
    const { fs, storage } = setup();
    await storage.saveProject(named("A"));
    const real = fs.move.bind(fs);
    fs.move = async (from, to) => { if (!fs.files.has(from)) throw new Error(`nothing to move: ${from}`); return real(from, to); };  // as expoFs refuses it
    const open = holdMoves(fs);
    const save = storage.saveProject(named("B"));
    await settle();
    fs.files.delete(`${json(fs)}.tmp`);                                       // its move will find nothing and be refused
    const load = storage.loadProject("p1");
    await settle();
    open();
    await expect(save).rejects.toThrow();
    expect((await load).project.name).toBe("A");
  });

  test("the list waits as well: a project with a save on its way is listed as saved", async () => {
    const { fs, storage } = setup();
    await storage.saveProject(named("A"));
    const open = holdMoves(fs);
    const save = storage.saveProject(named("B"));
    await settle();
    const list = storage.listProjects();
    expect(await state(list)).toBe("waiting");
    open();
    await save;
    expect((await list).map((p) => p.name)).toEqual(["B"]);
  });

  test("only that project's saves are waited for", async () => {
    const { fs, storage } = setup();
    await storage.saveProject(named("A", "p1"));
    await storage.saveProject(named("other", "p2"));
    const open = holdMoves(fs, "p1");
    const save = storage.saveProject(named("B", "p1"));
    await settle();
    expect((await storage.loadProject("p2")).project.name).toBe("other");     // p1's save is still held
    open();
    await save;
  });

  test("nothing queued: the open asks the phone for ONE read and nothing else, also right after a save has ended", async () => {
    const { fs, storage } = setup();
    await storage.saveProject(named("A"));
    const calls = spy(fs);
    await storage.loadProject("p1");
    expect(calls).toEqual(["readText project.json"]);
    await storage.saveProject(named("B"));
    calls.length = 0;
    expect((await storage.loadProject("p1")).project.name).toBe("B");
    expect(calls).toEqual(["readText project.json"]);
  });

  test("nothing queued: the read is asked in the very call, not a tick later", async () => {
    const { fs, storage } = setup();
    fs.files.set(json(fs), text("A"));
    const calls = spy(fs);
    const load = storage.loadProject("p1");
    expect(calls).toEqual(["readText project.json"]);
    expect((await load).project.name).toBe("A");
  });
});

describe("a deleted project cannot be made again by a late save", () => {
  test("a save on its way and one queued behind it, then delete: both saves end, then the folder goes — nothing is left", async () => {
    const { fs, storage } = setup();
    await storage.saveProject(named("A"));
    fs.files.set(`${dir(fs)}/media/a.mp4`, "video");
    const open = holdMoves(fs);
    const first = storage.saveProject(named("B"));                            // its move waits
    await settle();
    const second = storage.saveProject(named("C"));                           // queued: not started
    const gone = storage.deleteProject("p1");
    expect(await state(gone)).toBe("waiting");
    expect(fs.files.get(json(fs))).toBe(text("A"));                           // the delete has not jumped the queue
    open();
    expect((await Promise.allSettled([first, second, gone])).map((r) => r.status)).toEqual(["fulfilled", "fulfilled", "fulfilled"]);
    await settle();
    expect(left(fs)).toEqual([]);
    expect(await fs.exists(dir(fs))).toBe(false);
  });

  test("delete, then a save asked late: it resolves, writes nothing, and there is no folder", async () => {
    const { fs, storage } = setup();
    await storage.saveProject(named("A"));
    await storage.deleteProject("p1");
    const calls = spy(fs);
    await expect(storage.saveProject(named("late"))).resolves.toBeUndefined();
    expect(calls).toEqual([]);
    expect(left(fs)).toEqual([]);
  });

  test("a save asked while the delete is waiting its turn is behind it: it writes nothing", async () => {
    const { fs, storage } = setup();
    await storage.saveProject(named("A"));
    const open = holdMoves(fs);
    const first = storage.saveProject(named("B"));
    await settle();
    const gone = storage.deleteProject("p1");
    const late = storage.saveProject(named("late"));
    await settle();
    open();
    expect((await Promise.allSettled([first, gone, late])).map((r) => r.status)).toEqual(["fulfilled", "fulfilled", "fulfilled"]);
    await settle();
    expect(left(fs)).toEqual([]);
  });

  test("a rename queued behind a delete fails for its caller and writes nothing", async () => {
    const { fs, storage } = setup();
    await storage.saveProject(named("A"));
    const open = holdMoves(fs);
    const first = storage.saveProject(named("B"));
    await settle();
    const gone = storage.deleteProject("p1");
    const refused = expect(storage.renameProject("p1", "New name")).rejects.toThrow();
    await settle();
    open();
    await first; await gone;
    await refused;
    await settle();
    expect(left(fs)).toEqual([]);
  });

  test("a deleted project's cover is not drawn again by the leave's writeCover", async () => {
    const { fs, storage } = setup();
    await storage.saveProject(named("A"));
    await storage.deleteProject("p1");
    const calls = spy(fs);
    await storage.writeCover(named("A"));
    expect(calls).toEqual([]);
    expect(left(fs)).toEqual([]);
  });

  test("a delete with nothing queued removes the folder in the very call, as before", async () => {
    const { fs, storage } = setup();
    fs.files.set(json(fs), text("A"));
    const calls = spy(fs);
    const gone = storage.deleteProject("p1");
    expect(calls).toEqual(["remove p1"]);
    await gone;
    expect(left(fs)).toEqual([]);
  });

  test("a delete that FAILS leaves the project alive: the next save is written", async () => {
    const { fs, storage } = setup();
    await storage.saveProject(named("A"));
    const real = fs.remove.bind(fs);
    fs.remove = async () => { throw new Error("busy"); };
    await expect(storage.deleteProject("p1")).rejects.toThrow("busy");
    fs.remove = real;
    await storage.saveProject(named("B"));
    expect(fs.files.get(json(fs))).toBe(text("B"));
  });

  test("another project is not touched by the mark", async () => {
    const { fs, storage } = setup();
    await storage.saveProject(named("A", "p1"));
    await storage.deleteProject("p1");
    await storage.saveProject(named("other", "p2"));
    expect(fs.files.get(json(fs, "p2"))).toBe(text("other", "p2"));
  });

  test("a project created again under a deleted id is an ordinary project", async () => {
    const { fs, storage } = setup(() => "p1");
    await storage.saveProject(named("A"));
    await storage.deleteProject("p1");
    const { project } = await storage.createProject("Again", []);
    expect(project.id).toBe("p1");
    expect(JSON.parse(fs.files.get(json(fs)) ?? "null")).toMatchObject({ id: "p1", name: "Again" });
    await storage.saveProject({ ...project, name: "Edited" });
    expect(JSON.parse(fs.files.get(json(fs)) ?? "null")).toMatchObject({ name: "Edited" });
  });
});
