// Two saves of one project at once used to be able to DELETE its project.json: both wrote the one tmp file, the phone
// queued both moves, the first move landed, and the second removed project.json and then found no tmp to put there.
// The fake fs models that move (fs.ts); these tests hold the phone's queue where the timing matters.
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
const onDisk = (fs: Fs, id: string) => fs.files.get(`${dir(fs, id)}/project.json`);
const strays = (fs: Fs) => [...fs.files.keys()].filter((f) => f.includes(".tmp"));
const named = (name: string, id = "p1"): Project => makeProject({ id, name });
/** The phone's queue is busy (thumbnails are being made): every move waits until `open()`. `only` = just that project's. */
function holdMoves(fs: Fs, only?: string) {
  const real = fs.move.bind(fs);
  let open!: () => void;
  const gate = new Promise<void>((r) => { open = r; });
  fs.move = async (from, to) => { if (!only || from.includes(`/${only}/`)) await gate; return real(from, to); };
  return open;
}
const settle = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); };

test("the fake's move is the phone's: the destination goes first, and a missing source then throws", async () => {
  const fs = memoryFs();
  fs.files.set("file:///doc/a.json", "old");
  await expect(fs.move("file:///doc/a.json.tmp", "file:///doc/a.json")).rejects.toThrow(/ENOENT/);
  expect(fs.files.has("file:///doc/a.json")).toBe(false);
  fs.files.set("file:///doc/a.json", "old");
  fs.files.set("file:///doc/a.json.tmp", "new");
  await fs.move("file:///doc/a.json.tmp", "file:///doc/a.json");
  expect(fs.files.get("file:///doc/a.json")).toBe("new");
  expect(fs.files.has("file:///doc/a.json.tmp")).toBe(false);
});

test("two saves of one project at once: both end well and the second one's project is on disk", async () => {
  const { fs, storage } = setup();
  await storage.saveProject(named("saved before"));
  const first = storage.saveProject(named("first"));
  const second = storage.saveProject(named("second"));
  expect((await Promise.allSettled([first, second])).map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
  expect(onDisk(fs, "p1")).toBe(JSON.stringify(named("second")));
  expect(strays(fs)).toEqual([]);
});

test("the same with the phone's queue busy (the autosave's move still waiting when the next save starts)", async () => {
  const { fs, storage } = setup();
  await storage.saveProject(named("saved before"));
  const open = holdMoves(fs);
  const first = storage.saveProject(named("first"));
  await settle();
  const second = storage.saveProject(named("second"));
  await settle();
  expect(onDisk(fs, "p1")).toBe(JSON.stringify(named("saved before")));     // never a moment without the file
  open();
  expect((await Promise.allSettled([first, second])).map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
  expect(onDisk(fs, "p1")).toBe(JSON.stringify(named("second")));
  expect(strays(fs)).toEqual([]);
});

test("three saves at once run one after another, in the order asked: the last one's project is on disk", async () => {
  const { fs, storage } = setup();
  const log: string[] = [];
  const write = fs.writeText.bind(fs), move = fs.move.bind(fs);
  fs.writeText = async (p, text) => { log.push(`write ${(JSON.parse(text) as Project).name}`); return write(p, text); };
  fs.move = async (from, to) => { await settle(); await move(from, to); log.push("moved"); };
  await Promise.all(["first", "second", "third"].map((name) => storage.saveProject(named(name))));
  expect(log).toEqual(["write first", "moved", "write second", "moved", "write third", "moved"]);
  expect(onDisk(fs, "p1")).toBe(JSON.stringify(named("third")));
  expect(strays(fs)).toEqual([]);
});

test("a save that fails tells its own caller and holds nobody up: the next one lands", async () => {
  const { fs, storage } = setup();
  const write = fs.writeText.bind(fs);
  fs.writeText = async (p, text) => { if (text.includes("\"second\"")) throw new Error("disk full"); return write(p, text); };
  const open = holdMoves(fs);
  const first = storage.saveProject(named("first"));
  const second = storage.saveProject(named("second"));
  const third = storage.saveProject(named("third"));
  open();
  await expect(first).resolves.toBeUndefined();
  await expect(second).rejects.toThrow("disk full");
  await expect(third).resolves.toBeUndefined();
  expect(onDisk(fs, "p1")).toBe(JSON.stringify(named("third")));
  expect(strays(fs)).toEqual([]);
  await storage.saveProject(named("fourth"));                                 // and the one after a failure, alone
  expect(onDisk(fs, "p1")).toBe(JSON.stringify(named("fourth")));
});

test("a move that fails leaves the project that was there, and the next save still lands", async () => {
  const { fs, storage } = setup();
  await storage.saveProject(named("saved before"));
  const move = fs.move.bind(fs);
  let calls = 0;
  fs.move = async (from, to) => { if (++calls === 1) throw new Error("no permission"); return move(from, to); };
  const first = storage.saveProject(named("first"));
  const second = storage.saveProject(named("second"));
  await expect(first).rejects.toThrow("no permission");
  await expect(second).resolves.toBeUndefined();
  expect(onDisk(fs, "p1")).toBe(JSON.stringify(named("second")));
  expect(strays(fs)).toEqual([]);
});

test("saves of two different projects do not wait for each other", async () => {
  const { fs, storage } = setup();
  holdMoves(fs, "p1");                                                        // p1's move never gets its turn
  let firstDone = false;
  void storage.saveProject(named("slow", "p1")).then(() => { firstDone = true; });
  void storage.saveProject(named("slow again", "p1"));
  await storage.saveProject(named("other", "p2"));
  expect(onDisk(fs, "p2")).toBe(JSON.stringify(named("other", "p2")));
  expect(firstDone).toBe(false);
});

test("what is written is the project as JSON, under project.json, through project.json.tmp", async () => {
  const { fs, storage } = setup();
  const seen: string[] = [];
  const move = fs.move.bind(fs);
  fs.move = async (from, to) => { seen.push(`${from} -> ${to}`); return move(from, to); };
  await storage.saveProject(named("one"));
  expect(seen).toEqual([`${dir(fs, "p1")}/project.json.tmp -> ${dir(fs, "p1")}/project.json`]);
  expect([...fs.files.keys()]).toEqual([`${dir(fs, "p1")}/project.json`]);
  expect(onDisk(fs, "p1")).toBe(JSON.stringify(named("one")));
});

test("a tmp file left by an app that was closed mid-save is not a project, and the next save takes it away", async () => {
  const { fs, storage } = setup();
  await storage.saveProject(named("kept"));
  fs.files.set(`${dir(fs, "p1")}/project.json.tmp`, "{\"half\":");
  const list = await storage.listProjects();
  expect(list.map((p) => [p.id, p.name, p.broken])).toEqual([["p1", "kept", false]]);
  expect((await storage.loadProject("p1")).project.name).toBe("kept");
  await storage.saveProject(named("later"));
  expect(strays(fs)).toEqual([]);
  expect(onDisk(fs, "p1")).toBe(JSON.stringify(named("later")));
});
