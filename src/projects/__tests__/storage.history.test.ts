import { migrateProject } from "@/src/editor/model/migrate";
import { SCHEMA_VERSION, type Project } from "@/src/editor/model/types";
import { memoryFs } from "../fs";
import { stampOf } from "../history";
import { makeStorage, type PickedAsset } from "../storage";

const asset = (uri: string): PickedAsset => ({ uri, kind: "video", durationSec: 4, width: 1080, height: 1920, fileName: "clip.mov" });
const now = async () => {};
/** A snapshot as a load gives it back: through the text and the sanity pass. */
const asLoaded = (p: Project): Project => migrateProject(JSON.parse(JSON.stringify(p)));

async function made() {
  const fs = memoryFs();
  let n = 0;
  const storage = makeStorage(fs, { thumbnail: async () => { fs.files.set("file:///tmp/t.jpg", "JPEG"); return "file:///tmp/t.jpg"; }, newId: () => `id${++n}`, nowIso: () => "2026-10-13T10:00:00.000Z" });
  fs.files.set("file:///picked/a.mov", "A"); fs.files.set("file:///picked/b.mov", "B");
  const { project: v0 } = await storage.createProject("Beach", [asset("file:///picked/a.mov"), asset("file:///picked/b.mov")]);
  const v1: Project = { ...v0, name: "One" }, v2: Project = { ...v1, name: "Two" }, v3: Project = { ...v2, name: "Three" };
  const dir = "file:///doc/projects/id1";
  return { fs, storage, dir, json: `${dir}/project.json`, history: `${dir}/history.jsonl`, v0, v1, v2, v3 };
}
/** v2 is the project on disk; its history is undo [v0, v1] and redo [v3]. */
async function kept() {
  const s = await made();
  await s.storage.saveProject(s.v2);
  expect(await s.storage.saveHistory(s.v2, [s.v0, s.v1], [s.v3])).toBe(true);
  return s;
}
const reopen = async (s: Awaited<ReturnType<typeof made>>) => {
  const { project, stamp } = await s.storage.loadProject("id1");
  return s.storage.loadHistory(project, stamp, now);
};
const names = (h: { past: Project[]; future: Project[] } | null) => h && { past: h.past.map((p) => p.name), future: h.future.map((p) => p.name) };
const lines = (s: Awaited<ReturnType<typeof made>>) => s.fs.files.get(s.history)!.split("\n");
const rewrite = (s: Awaited<ReturnType<typeof made>>, change: (l: string[]) => string[]) => s.fs.files.set(s.history, change(lines(s)).join("\n"));

let warn: jest.SpyInstance;
beforeEach(() => { warn = jest.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => warn.mockRestore());

test("loadProject also gives the stamp of the very text it parsed", async () => {
  const s = await made();
  const { stamp } = await s.storage.loadProject("id1");
  expect(stamp).toBe(stampOf(s.fs.files.get(s.json)!));
});

test("a history written beside its project comes back: both stacks, in order, as a load gives a project", async () => {
  const s = await kept();
  expect(s.fs.files.has(`${s.history}.tmp`)).toBe(false);
  const got = await reopen(s);
  expect(JSON.stringify(got)).toBe(JSON.stringify({ past: [s.v0, s.v1].map(asLoaded), future: [asLoaded(s.v3)] }));
  expect(warn).not.toHaveBeenCalled();
});

test("the project file is not touched by a history write, and holds no history", async () => {
  const s = await made();
  await s.storage.saveProject(s.v2);
  const before = s.fs.files.get(s.json);
  await s.storage.saveHistory(s.v2, [s.v0, s.v1], [s.v3]);
  expect(s.fs.files.get(s.json)).toBe(before);
  expect(before).not.toContain("history");
});

test("saveHistory writes nothing when project.json on disk is not this very project", async () => {
  const s = await made();
  await s.storage.saveProject(s.v1);
  expect(await s.storage.saveHistory(s.v2, [s.v0, s.v1], [])).toBe(false);
  expect(s.fs.files.has(s.history)).toBe(false);
  // …and an older history that is there stays as it is.
  await s.storage.saveProject(s.v2);
  await s.storage.saveHistory(s.v2, [s.v0, s.v1], []);
  const old = s.fs.files.get(s.history);
  expect(await s.storage.saveHistory(s.v3, [s.v0, s.v1, s.v2], [])).toBe(false);
  expect(s.fs.files.get(s.history)).toBe(old);
});

test("with no step to keep the file goes", async () => {
  const s = await kept();
  expect(await s.storage.saveHistory(s.v2, [], [])).toBe(false);
  expect(s.fs.files.has(s.history)).toBe(false);
});

test("no history file: null, quietly", async () => {
  const s = await made();
  expect(await reopen(s)).toBeNull();
  expect(warn).not.toHaveBeenCalled();
});

test("a project.json rewritten since (Home's rename, a later autosave): the history is dropped and its file is left alone", async () => {
  const s = await kept();
  const file = s.fs.files.get(s.history);
  await s.storage.renameProject("id1", "Renamed");
  expect(await reopen(s)).toBeNull();
  expect(s.fs.files.get(s.history)).toBe(file);
  // A stamp taken from an older read never meets a newer history: the pair is refused from either side.
  const t = await kept();
  const older = await t.storage.loadProject("id1");
  await t.storage.saveProject(t.v3);
  await t.storage.saveHistory(t.v3, [t.v0, t.v1, t.v2], []);
  expect(await t.storage.loadHistory(older.project, older.stamp, now)).toBeNull();
});

describe("anything odd drops all of it", () => {
  const cases: [string, (l: string[], s: Awaited<ReturnType<typeof made>>) => string[]][] = [
    ["a cut-off file", (l) => l.slice(0, -1)],
    ["a line that is not JSON", (l) => [l[0], "{not json", ...l.slice(2)]],
    ["a line that is not an object", (l) => [l[0], "[]", ...l.slice(2)]],
    ["a snapshot of another project", (l, s) => [l[0], JSON.stringify({ ...s.v0, id: "other" }), ...l.slice(2)]],
    ["a snapshot of another schema", (l, s) => [l[0], JSON.stringify({ ...s.v0, schemaVersion: SCHEMA_VERSION - 1 }), ...l.slice(2)]],
    ["a snapshot the sanity pass refuses", (l) => [l[0], JSON.stringify({ id: "id1", schemaVersion: SCHEMA_VERSION }), ...l.slice(2)]],
    ["a header of another schema", (l) => [l[0].replace(`"schemaVersion":${SCHEMA_VERSION}`, `"schemaVersion":${SCHEMA_VERSION - 1}`), ...l.slice(1)]],
    ["a header of a newer schema", (l) => [l[0].replace(`"schemaVersion":${SCHEMA_VERSION}`, `"schemaVersion":${SCHEMA_VERSION + 1}`), ...l.slice(1)]],
  ];
  test.each(cases)("%s", async (_name, change) => {
    const s = await kept();
    rewrite(s, (l) => change(l, s));
    expect(await reopen(s)).toBeNull();
  });
  test("a file far too big is not even read", async () => {
    const s = await kept();
    s.fs.files.set(s.history, "x".repeat(12_000_001));
    const read = jest.spyOn(s.fs, "readText");
    const { project, stamp } = await s.storage.loadProject("id1");
    read.mockClear();
    expect(await s.storage.loadHistory(project, stamp, now)).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });
});

test("references written under another container are re-pointed at where the folder is now", async () => {
  const s = await made();
  const OLD = "file:///old/Documents/projects/id1";
  const away = (p: Project): Project => ({ ...p, clips: p.clips.map((c) => ({ ...c, sourceUri: c.sourceUri.replace(s.dir, OLD) })) });
  await s.storage.saveProject(s.v2);
  await s.storage.saveHistory(s.v2, [away(s.v0), away(s.v1)], [away(s.v3)]);
  expect(s.fs.files.get(s.history)).toContain(OLD);
  const got = await reopen(s);
  expect(got!.past.concat(got!.future).flatMap((p) => p.clips.map((c) => c.sourceUri))).toEqual(Array(3).fill(s.v0.clips.map((c) => c.sourceUri)).flat());   // three snapshots, the same two files each
});

test("a step whose file is gone cuts its stack: undo keeps the newer steps, redo the nearer ones", async () => {
  const s = await made();
  const ghost = (name: string): Project => ({ ...s.v0, name, clips: [...s.v0.clips, { ...s.v0.clips[0], id: "g", sourceUri: `${s.dir}/media/gone.mov` }] });
  await s.storage.saveProject(s.v2);
  await s.storage.saveHistory(s.v2, [s.v0, ghost("ghost"), s.v1], [s.v3, ghost("ghost too"), s.v0]);
  expect(names(await reopen(s))).toEqual({ past: ["One"], future: ["Three"] });
  // Every undo step past a missing file: only the redo side is left; both gone: nothing.
  await s.storage.saveHistory(s.v2, [s.v0, ghost("ghost")], [s.v3]);
  expect(names(await reopen(s))).toEqual({ past: [], future: ["Three"] });
  await s.storage.saveHistory(s.v2, [ghost("ghost")], [ghost("ghost too")]);
  expect(await reopen(s)).toBeNull();
});

test("a file the opened project itself is missing does not cut anything (the editor already says so)", async () => {
  const s = await kept();
  s.fs.files.delete(s.v2.clips[0].sourceUri);
  const { project, missingSourceUris, stamp } = await s.storage.loadProject("id1");
  expect(missingSourceUris).toEqual([s.v2.clips[0].sourceUri]);
  expect(names(await s.storage.loadHistory(project, stamp, now))).toEqual({ past: ["Beach", "One"], future: ["Three"] });
});

test("one pause per snapshot; reading writes nothing and removes nothing", async () => {
  const s = await kept();
  const { project, stamp } = await s.storage.loadProject("id1");
  const before = new Map(s.fs.files);
  const spies = (["writeText", "copy", "move", "remove", "mkdir"] as const).map((m) => jest.spyOn(s.fs, m));
  const pause = jest.fn(async () => {});
  await s.storage.loadHistory(project, stamp, pause);
  expect(pause).toHaveBeenCalledTimes(3);
  for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  expect([...s.fs.files]).toEqual([...before]);
});

test("neither ever throws: a disk that fails is a warning and no history", async () => {
  const s = await kept();
  const old = s.fs.files.get(s.history), doc = s.fs.files.get(s.json);
  const realWrite = s.fs.writeText, realRead = s.fs.readText;
  jest.spyOn(s.fs, "writeText").mockImplementation(async (p, t) => { if (p.includes("history")) throw new Error("disk full"); return realWrite(p, t); });
  await expect(s.storage.saveHistory(s.v2, [s.v1], [])).resolves.toBe(false);
  expect(warn).toHaveBeenCalledWith("history save failed", expect.any(Error));
  expect(s.fs.files.get(s.history)).toBe(old);
  expect(s.fs.files.get(s.json)).toBe(doc);
  const { project, stamp } = await s.storage.loadProject("id1");
  jest.spyOn(s.fs, "readText").mockImplementation(async (p) => { if (p.includes("history")) throw new Error("io"); return realRead(p); });
  await expect(s.storage.loadHistory(project, stamp, now)).resolves.toBeNull();
  expect(warn).toHaveBeenCalledWith("history load failed", expect.any(Error));
});

test("a duplicate and a saved copy carry no history; deleting the project removes it", async () => {
  const s = await kept();
  const copy = await s.storage.duplicateProject("id1");
  expect([...s.fs.files.keys()].filter((k) => k.includes(`/projects/${copy.id}/`) && k.includes("history"))).toEqual([]);
  const file = await s.storage.packProject("id1", { cancelled: false }, now);
  expect(s.fs.files.get(file.uri)).not.toContain("clipy-history");
  expect(s.fs.files.get(file.uri)).not.toContain("history.jsonl");
  await s.storage.deleteProject("id1");
  expect(s.fs.files.has(s.history)).toBe(false);
});

test("a project opened from a saved copy starts with no history", async () => {
  const s = await kept();
  const file = await s.storage.packProject("id1", { cancelled: false }, now);
  s.fs.files.set("file:///picked/Two.clipy", s.fs.files.get(file.uri)!);   // where the picker would put it: every run sweeps the app's own temporary folder
  const back = await s.storage.restoreProject("file:///picked/Two.clipy", { cancelled: false }, now);
  expect([...s.fs.files.keys()].filter((k) => k.includes(`/projects/${back.id}/`) && k.includes("history"))).toEqual([]);
  const { project, stamp } = await s.storage.loadProject(back.id);
  expect(await s.storage.loadHistory(project, stamp, now)).toBeNull();
  expect(warn).not.toHaveBeenCalled();
});

test("the stamp is of project.json's text alone: the same project saved again keeps it, one changed character does not", async () => {
  const s = await kept();
  const first = (await s.storage.loadProject("id1")).stamp;
  await s.storage.saveProject(s.v2);
  expect((await s.storage.loadProject("id1")).stamp).toBe(first);
  expect(names(await reopen(s))).toEqual({ past: ["Beach", "One"], future: ["Three"] });
  s.fs.files.set(s.json, s.fs.files.get(s.json)!.replace('"Two"', '"Twp"'));
  expect((await s.storage.loadProject("id1")).stamp).not.toBe(first);
  expect(await reopen(s)).toBeNull();
});
