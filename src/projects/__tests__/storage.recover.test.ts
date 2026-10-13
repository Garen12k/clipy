// Two holes the serial saves left. (1) The phone's move removes project.json and only then renames the tmp: an app
// closed between the two leaves a project with ONLY project.json.tmp — a complete, newer copy that nothing read back.
// (2) A read-modify-write (Home's rename, a duplicate's read of its source) read the project BEFORE its turn of the
// chain: with a save still queued it read the text from before that save.
import { makeProject, type Project } from "@/src/editor/model/types";
import { memoryFs } from "../fs";
import { makeStorage } from "../storage";

type Fs = ReturnType<typeof memoryFs>;

function setup() {
  const fs = memoryFs();
  let n = 0;
  const storage = makeStorage(fs, { thumbnail: async () => "file:///tmp/t.jpg", newId: () => `id${++n}`, nowIso: () => "2026-10-13T10:00:00.000Z" });
  return { fs, storage };
}
const dir = (fs: Fs, id: string) => `${fs.documentDir}projects/${id}`;
const json = (fs: Fs, id = "p1") => `${dir(fs, id)}/project.json`;
const tmp = (fs: Fs, id = "p1") => `${json(fs, id)}.tmp`;
const named = (name: string, id = "p1"): Project => makeProject({ id, name });
const text = (name: string, id = "p1") => JSON.stringify(named(name, id));
const stored = (fs: Fs, id = "p1") => JSON.parse(fs.files.get(json(fs, id)) ?? "null") as Project;
/** The phone's queue is busy: every move waits until `open()`. */
function holdMoves(fs: Fs) {
  const real = fs.move.bind(fs);
  let open!: () => void;
  const gate = new Promise<void>((r) => { open = r; });
  fs.move = async (from, to) => { await gate; return real(from, to); };
  return open;
}
const settle = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); };
/** Every file-system call made, by name and file. */
function spy(fs: Fs) {
  const calls: string[] = [];
  for (const name of ["exists", "readText", "writeText", "move", "remove", "copy", "mkdir"] as const) {
    const real = (fs[name] as (...a: string[]) => Promise<unknown>).bind(fs);
    (fs as unknown as Record<string, unknown>)[name] = (...a: string[]) => { calls.push(`${name} ${a[0].split("/").pop()}`); return real(...a); };
  }
  return calls;
}

describe("a project left with only its temporary file", () => {
  test("loads: the tmp becomes project.json and is gone", async () => {
    const { fs, storage } = setup();
    fs.dirs.add(dir(fs, "p1"));
    fs.files.set(tmp(fs), text("newer"));
    expect((await storage.loadProject("p1")).project.name).toBe("newer");
    expect(fs.files.get(json(fs))).toBe(text("newer"));
    expect(fs.files.has(tmp(fs))).toBe(false);
    expect((await storage.loadProject("p1")).project.name).toBe("newer");     // and again, with nothing left to do
  });

  test("lists as an ordinary project: the tmp becomes project.json and is gone", async () => {
    const { fs, storage } = setup();
    fs.dirs.add(dir(fs, "p1"));
    fs.files.set(tmp(fs), text("newer"));
    expect((await storage.listProjects()).map((p) => [p.id, p.name, p.broken])).toEqual([["p1", "newer", false]]);
    expect(fs.files.get(json(fs))).toBe(text("newer"));
    expect(fs.files.has(tmp(fs))).toBe(false);
    expect((await storage.listProjects()).map((p) => [p.id, p.name, p.broken])).toEqual([["p1", "newer", false]]);
  });

  test("a tmp that was cut off mid-write is not a project: broken as before, and the tmp is not touched", async () => {
    const { fs, storage } = setup();
    fs.dirs.add(dir(fs, "p1"));
    fs.files.set(tmp(fs), text("newer").slice(0, 40));
    const before = new Map(fs.files);
    await expect(storage.loadProject("p1")).rejects.toThrow();
    expect((await storage.listProjects()).map((p) => [p.id, p.name, p.broken])).toEqual([["p1", "Can't open", true]]);
    expect(new Map(fs.files)).toEqual(before);
  });

  test("both there: project.json wins, and neither file is touched", async () => {
    const { fs, storage } = setup();
    await storage.saveProject(named("good"));
    fs.files.set(tmp(fs), text("stale"));
    const before = new Map(fs.files);
    expect((await storage.loadProject("p1")).project.name).toBe("good");
    expect((await storage.listProjects()).map((p) => p.name)).toEqual(["good"]);
    expect(new Map(fs.files)).toEqual(before);
  });

  test("a project.json that cannot be read is broken even beside a good tmp: a tmp never replaces a file that is there", async () => {
    const { fs, storage } = setup();
    fs.dirs.add(dir(fs, "p1"));
    fs.files.set(json(fs), "{\"half\":");
    fs.files.set(tmp(fs), text("stale"));
    const before = new Map(fs.files);
    await expect(storage.loadProject("p1")).rejects.toThrow();
    expect((await storage.listProjects()).map((p) => p.broken)).toEqual([true]);
    expect(new Map(fs.files)).toEqual(before);
  });

  test("neither there: broken as before, nothing written", async () => {
    const { fs, storage } = setup();
    fs.files.set(`${dir(fs, "p1")}/media/a.mp4`, "video");                      // the folder, with its media, and no project file
    await expect(storage.loadProject("p1")).rejects.toThrow(/ENOENT/);
    expect((await storage.listProjects()).map((p) => [p.id, p.name, p.broken])).toEqual([["p1", "Can't open", true]]);
    expect([...fs.files.keys()]).toEqual([`${dir(fs, "p1")}/media/a.mp4`]);
  });

  test("the ordinary case asks the phone nothing more: one read of project.json, the tmp never looked at", async () => {
    const { fs, storage } = setup();
    await storage.saveProject(named("good"));
    const calls = spy(fs);
    await storage.listProjects();
    expect(calls.filter((c) => c.includes("project.json"))).toEqual(["readText project.json"]);
    calls.length = 0;
    await storage.loadProject("p1");
    expect(calls).toEqual(["readText project.json"]);
  });

  test("the recovery waits its turn: a save on its way is not raced, and its project is what is read", async () => {
    const { fs, storage } = setup();
    fs.dirs.add(dir(fs, "p1"));
    fs.files.set(tmp(fs), text("left behind"));
    const open = holdMoves(fs);
    const save = storage.saveProject(named("saved now"));                     // writes the tmp, its move waits
    await settle();
    const load = storage.loadProject("p1");
    await settle();
    open();
    await save;
    expect((await load).project.name).toBe("saved now");
    expect(fs.files.get(json(fs))).toBe(text("saved now"));
    expect(fs.files.has(tmp(fs))).toBe(false);
  });

  test("a rename of a project left with only its tmp renames that project", async () => {
    const { fs, storage } = setup();
    fs.dirs.add(dir(fs, "p1"));
    fs.files.set(tmp(fs), text("newer"));
    await storage.renameProject("p1", "Renamed");
    expect(stored(fs).name).toBe("Renamed");
    expect(fs.files.has(tmp(fs))).toBe(false);
  });
});

describe("read, change and write are one turn", () => {
  const edited = (): Project => ({ ...named("old name"), ducking: true });      // "B": the editor's last edits

  test("a rename started while a save is still queued keeps that save's content and gives it the new name", async () => {
    const { fs, storage } = setup();
    await storage.saveProject(named("old name"));
    const open = holdMoves(fs);
    const save = storage.saveProject(edited());
    await settle();
    const rename = storage.renameProject("p1", "New name");
    await settle();
    open();
    await Promise.all([save, rename]);
    expect(stored(fs).name).toBe("New name");
    expect(stored(fs).ducking).toBe(true);
    expect(fs.files.has(tmp(fs))).toBe(false);
  });

  test("a rename with nothing queued is what it was: the name, trimmed, an empty one keeps the old", async () => {
    const { fs, storage } = setup();
    await storage.saveProject(named("old name"));
    await storage.renameProject("p1", "  Trip  ");
    expect(stored(fs).name).toBe("Trip");
    await storage.renameProject("p1", "   ");
    expect(stored(fs).name).toBe("Trip");
  });

  test("updateProject: two changes asked at once both land, the second on top of the first", async () => {
    const { fs, storage } = setup();
    await storage.saveProject(named("old name"));
    const a = storage.updateProject("p1", (p) => ({ ...p, name: "renamed" }));
    const b = storage.updateProject("p1", (p) => ({ ...p, ducking: true }));
    expect((await a).name).toBe("renamed");
    expect(await b).toMatchObject({ name: "renamed", ducking: true });
    expect(stored(fs)).toMatchObject({ name: "renamed", ducking: true });
  });

  test("updateProject on a project that cannot be read rejects and writes nothing; the next save still lands", async () => {
    const { fs, storage } = setup();
    await expect(storage.updateProject("p1", (p) => p)).rejects.toThrow(/ENOENT/);
    expect([...fs.files.keys()]).toEqual([]);
    await storage.saveProject(named("later"));
    expect(fs.files.get(json(fs))).toBe(text("later"));
  });

  test("a duplicate started while a save of its source is still queued copies that save's content", async () => {
    const { fs, storage } = setup();
    await storage.saveProject(named("old name"));
    const open = holdMoves(fs);
    const save = storage.saveProject(edited());
    await settle();
    const copy = storage.duplicateProject("p1");
    await settle();
    open();
    await save;
    const made = await copy;
    expect(made.ducking).toBe(true);
    expect(stored(fs, made.id)).toMatchObject({ name: "old name copy", ducking: true });
    expect(stored(fs)).toMatchObject({ name: "old name", ducking: true });      // the source: the save's, untouched
  });
});
