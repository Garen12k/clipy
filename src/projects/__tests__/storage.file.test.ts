import { POST_PLATFORMS, SCHEMA_VERSION } from "@/src/editor/model/types";
import { memoryFs } from "../fs";
import { PROJECT_FILE, ProjectFileError, readHeader, writeProjectFile, type FileHeader, type FileRun } from "../projectFile";
import { makeStorage, type PickedAsset } from "../storage";

const now = async () => {};
const go = (): FileRun => ({ cancelled: false });
const asset = (uri: string): PickedAsset => ({ uri, kind: "video", durationSec: 4, width: 1080, height: 1920, fileName: "clip.mov" });
const PICKED = "file:///picked/Beach.clipy";
let warn: jest.SpyInstance;
beforeEach(() => { warn = jest.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => warn.mockRestore());

/** Project id1: clips id2, id3; one sound file id4 used by two bars; posts; caches, a cover file and an unused file beside them. */
async function setup() {
  const fs = memoryFs();
  let n = 0;
  const thumbnail = jest.fn(async () => { fs.files.set("file:///tmp/t.jpg", "JPEG"); return "file:///tmp/t.jpg"; });
  const storage = makeStorage(fs, { thumbnail, newId: () => `id${++n}`, nowIso: () => "2026-10-13T10:00:00.000Z" });
  fs.files.set("file:///picked/a.mov", "AAAA"); fs.files.set("file:///picked/b.mov", "BB"); fs.files.set("file:///picked/song.m4a", "SSS");
  const { project } = await storage.createProject("Beach", [asset("file:///picked/a.mov"), asset("file:///picked/b.mov")]);
  const track = await storage.importAudio("id1", { uri: "file:///picked/song.m4a", title: "song.m4a", durationSec: 3 });
  const dir = "file:///doc/projects/id1";
  await storage.saveProject({ ...project, audioTracks: [track, { ...track, id: "second" }], posts: [{ platform: POST_PLATFORMS[0], url: "https://example.com/v", postedAt: "2026-10-12T09:00:00.000Z" }] });
  for (const extra of ["cutout/x.mov", "steady/y.mov", "sound/z.caf", "peaks/p.json", "cover-1-a-b-2.jpg", "media/unused.mov"]) fs.files.set(`${dir}/${extra}`, "CACHE");
  return { fs, storage, dir, thumbnail };
}
const temporaries = (fs: ReturnType<typeof memoryFs>) => [...fs.files.keys(), ...fs.dirs].filter((k) => k.includes("/project-files") || k.includes("/incoming"));
/** Save a copy and put it where the picker would: outside the app's own temporary folder (which every run sweeps). */
async function saved(s: Awaited<ReturnType<typeof setup>>) {
  const made = await s.storage.packProject("id1", go(), now);
  s.fs.files.set(PICKED, s.fs.files.get(made.uri)!);
  return made;
}

describe("packProject", () => {
  test("one file named after the project: the document with relative references, each source file once, the thumbnail — no cache, no cover", async () => {
    const s = await setup();
    const started: unknown[] = [];
    const made = await s.storage.packProject("id1", { cancelled: false, onStart: (i) => started.push(i) }, now);
    expect(made.uri).toBe("file:///cache/project-files/id5/Beach.clipy");
    expect(made).toMatchObject({ name: "Beach", missing: 0, bytes: s.fs.files.get(made.uri)!.length });
    expect(started).toEqual([{ name: "Beach", bytes: made.bytes }]);
    const { header } = readHeader(s.fs.openReader(made.uri));
    expect(header.files).toEqual([{ path: "media/id2.mov", size: 4 }, { path: "media/id3.mov", size: 2 }, { path: "media/id4.m4a", size: 3 }, { path: "thumb.jpg", size: 4 }]);
    expect(header).toMatchObject({ app: "clipy", schemaVersion: SCHEMA_VERSION, name: "Beach", savedAt: "2026-10-13T10:00:00.000Z" });
    const doc = header.project as { clips: { sourceUri: string }[]; audioTracks: { sourceUri: string }[]; posts: unknown[] };
    expect(doc.clips.map((c) => c.sourceUri)).toEqual(["media/id2.mov", "media/id3.mov"]);
    expect(doc.audioTracks.map((a) => a.sourceUri)).toEqual(["media/id4.m4a", "media/id4.m4a"]);
    expect(doc.posts).toHaveLength(1);
    expect(temporaries(s.fs).filter((k) => k.includes("part-"))).toEqual([]);
    expect(JSON.stringify(header)).not.toContain("file:///");
  });

  test("a name with a space or another script is a valid uri", async () => {
    const s = await setup();
    await s.storage.renameProject("id1", "Beach trip رحلة");
    const made = await s.storage.packProject("id1", go(), now);
    expect(made.uri).toBe(`file:///cache/project-files/id5/${encodeURIComponent("Beach trip رحلة.clipy")}`);
    expect(made.uri).not.toContain(" ");
  });

  test("a missing source file is left out and counted; the copy is still made", async () => {
    const s = await setup();
    s.fs.files.delete(`${s.dir}/media/id3.mov`);
    const made = await s.storage.packProject("id1", go(), now);
    expect(made.missing).toBe(1);
    expect(readHeader(s.fs.openReader(made.uri)).header.files.map((f) => f.path)).toEqual(["media/id2.mov", "media/id4.m4a", "thumb.jpg"]);
  });

  test("not enough room: refused with the sizes, before anything is written", async () => {
    const s = await setup();
    s.fs.freeBytes = async () => 1000;
    const before = s.fs.files.size;
    await expect(s.storage.packProject("id1", go(), now)).rejects.toMatchObject({ code: "space", free: 1000 });
    await s.storage.packProject("id1", go(), now).catch((e: { need: number }) => expect(e.need).toBeGreaterThan(PROJECT_FILE.spare));
    expect(s.fs.files.size).toBe(before);
    expect(temporaries(s.fs).filter((k) => k.endsWith(".clipy"))).toEqual([]);
  });

  test("cancel and a failure leave no file behind, and the project is untouched", async () => {
    const s = await setup();
    const json = s.fs.files.get(`${s.dir}/project.json`);
    const run: FileRun = { cancelled: false, onProgress: () => { run.cancelled = true; } };
    await expect(s.storage.packProject("id1", run, now)).rejects.toMatchObject({ code: "cancelled" });
    expect(temporaries(s.fs).filter((k) => k.endsWith(".clipy"))).toEqual([]);
    const open = s.fs.openReader;
    s.fs.openReader = (p) => { if (p.endsWith("id3.mov")) throw new Error("disk"); return open(p); };
    await expect(s.storage.packProject("id1", go(), now)).rejects.toThrow("disk");
    expect(temporaries(s.fs).filter((k) => k.endsWith(".clipy"))).toEqual([]);
    expect(s.fs.files.get(`${s.dir}/project.json`)).toBe(json);
  });
});

describe("restoreProject", () => {
  test("round trip: a NEW project with the same items and file names, pointing at its own folder; the original untouched", async () => {
    const s = await setup();
    const original = s.fs.files.get(`${s.dir}/project.json`);
    await saved(s);
    const back = await s.storage.restoreProject(PICKED, go(), now);
    expect(back).toEqual({ id: "id6", name: "Beach copy" });
    const dir = "file:///doc/projects/id6";
    expect(s.fs.files.get(`${dir}/media/id2.mov`)).toBe("AAAA");
    expect(s.fs.files.get(`${dir}/media/id3.mov`)).toBe("BB");
    expect(s.fs.files.get(`${dir}/media/id4.m4a`)).toBe("SSS");
    expect(s.fs.files.get(`${dir}/thumb.jpg`)).toBe("JPEG");
    const { project, missingSourceUris } = await s.storage.loadProject("id6");
    expect(missingSourceUris).toEqual([]);
    expect(project).toMatchObject({ id: "id6", name: "Beach copy", schemaVersion: SCHEMA_VERSION, updatedAt: "2026-10-13T10:00:00.000Z" });
    expect(project.clips.map((c) => [c.id, c.sourceUri])).toEqual([["id2", `${dir}/media/id2.mov`], ["id3", `${dir}/media/id3.mov`]]);
    expect(project.audioTracks.map((a) => [a.id, a.sourceUri])).toEqual([["id4", `${dir}/media/id4.m4a`], ["second", `${dir}/media/id4.m4a`]]);
    expect(project.posts).toHaveLength(1);                                   // kept: the project as it was
    expect((await s.fs.list(dir)).sort()).toEqual(["media", "project.json", "thumb.jpg"]);   // no cache came along
    expect(s.fs.files.get(`${s.dir}/project.json`)).toBe(original);
    expect(temporaries(s.fs)).toEqual([]);
    expect((await s.storage.listProjects()).map((p) => p.name)).toEqual(["Beach", "Beach copy"]);
  });

  test("the name is kept when it is free", async () => {
    const s = await setup();
    await saved(s);
    await s.storage.deleteProject("id1");
    expect((await s.storage.restoreProject(PICKED, go(), now)).name).toBe("Beach");
  });

  test("files first, project.json LAST, then one move of the folder", async () => {
    const s = await setup();
    await saved(s);
    const order: string[] = [];
    const w = s.fs.openWriter, t = s.fs.writeText, m = s.fs.moveDir;
    s.fs.openWriter = (p) => { order.push(p); return w(p); };
    s.fs.writeText = async (p, text) => { order.push(p); return t(p, text); };
    s.fs.moveDir = async (a, b) => { order.push(`move ${a} ${b}`); return m(a, b); };
    await s.storage.restoreProject(PICKED, go(), now);
    const stage = "file:///doc/incoming/id6";
    expect(order).toEqual([`${stage}/media/id2.mov`, `${stage}/media/id3.mov`, `${stage}/media/id4.m4a`, `${stage}/thumb.jpg`, `${stage}/project.json`, `move ${stage} file:///doc/projects/id6`]);
  });

  test("a project with a cover gets its cover picture at once; a file without a thumbnail gets one made", async () => {
    const s = await setup();
    const { project } = await s.storage.loadProject("id1");
    await s.storage.saveProject({ ...project, cover: { time: 1, title: "Day one" } });
    s.fs.files.delete(`${s.dir}/thumb.jpg`);
    await saved(s);
    s.thumbnail.mockClear();
    await s.storage.restoreProject(PICKED, go(), now);
    const names = await s.fs.list("file:///doc/projects/id6");
    expect(names).toContain("thumb.jpg");
    expect(names.some((x) => /^cover-.*\.jpg$/.test(x))).toBe(true);
    expect((await s.storage.listProjects()).find((p) => p.id === "id6")).toMatchObject({ coverTitle: "Day one", broken: false });
  });

  test("not a Clipy file, a cut-off one, a newer one: refused by name, and nothing is added", async () => {
    const s = await setup();
    await saved(s);
    const whole = s.fs.files.get(PICKED)!;
    s.fs.files.set("file:///picked/song.mp3", "ID3 this is a song, not a project at all");
    await expect(s.storage.restoreProject("file:///picked/song.mp3", go(), now)).rejects.toMatchObject({ code: "notClipy" });
    s.fs.files.set("file:///picked/cut.clipy", whole.slice(0, whole.length - 5));
    await expect(s.storage.restoreProject("file:///picked/cut.clipy", go(), now)).rejects.toMatchObject({ code: "damaged" });
    const newer: FileHeader = { app: "clipy", schemaVersion: SCHEMA_VERSION + 1, savedAt: "", name: "Later", project: { id: "x", clips: [], schemaVersion: SCHEMA_VERSION + 1 }, files: [] };
    const out = s.fs.openWriter("file:///picked/newer.clipy");
    await writeProjectFile(out, newer, () => { throw new Error("no files"); }, go(), now);
    await expect(s.storage.restoreProject("file:///picked/newer.clipy", go(), now)).rejects.toMatchObject({ code: "newer" });
    const bad: FileHeader = { ...newer, schemaVersion: SCHEMA_VERSION, project: { name: "no id, no clips" } };
    await writeProjectFile(s.fs.openWriter("file:///picked/bad.clipy"), bad, () => { throw new Error("no files"); }, go(), now);
    await expect(s.storage.restoreProject("file:///picked/bad.clipy", go(), now)).rejects.toMatchObject({ code: "damaged" });
    expect(await s.fs.list("file:///doc/projects")).toEqual(["id1"]);
    expect(temporaries(s.fs)).toEqual([]);
  });

  test("an older project opens: it goes through migrate like any load", async () => {
    const s = await setup();
    const old: FileHeader = { app: "clipy", schemaVersion: 2, savedAt: "", name: "Old", project: { id: "x", name: "Old", createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", clips: [], overlays: [], audioTracks: [], schemaVersion: 2 }, files: [] };
    await writeProjectFile(s.fs.openWriter("file:///picked/old.clipy"), old, () => { throw new Error("no files"); }, go(), now);
    const back = await s.storage.restoreProject("file:///picked/old.clipy", go(), now);
    const { project } = await s.storage.loadProject(back.id);
    expect(project).toMatchObject({ name: "Old", schemaVersion: SCHEMA_VERSION, createdAt: "2026-09-01T00:00:00.000Z", layers: [], posts: [] });
  });

  test("a reference that tries to leave the folder cannot: it becomes a missing file inside media/", async () => {
    const s = await setup();
    const doc = JSON.parse(s.fs.files.get(`${s.dir}/project.json`)!);
    const evil: FileHeader = { app: "clipy", schemaVersion: SCHEMA_VERSION, savedAt: "", name: "E", files: [], project: { ...doc, clips: [{ ...doc.clips[0], sourceUri: "../../../id1/media/.." }] } };
    await writeProjectFile(s.fs.openWriter("file:///picked/evil.clipy"), evil, () => { throw new Error("no files"); }, go(), now);
    const back = await s.storage.restoreProject("file:///picked/evil.clipy", go(), now);
    const { project } = await s.storage.loadProject(back.id);
    expect(project.clips[0].sourceUri).toBe(`file:///doc/projects/${back.id}/media/missing`);
  });

  test("not enough room, a cancel, a failed write: nothing is added and nothing is left", async () => {
    const s = await setup();
    await saved(s);
    const free = s.fs.freeBytes;
    s.fs.freeBytes = async () => 1000;
    await expect(s.storage.restoreProject(PICKED, go(), now)).rejects.toMatchObject({ code: "space", free: 1000, need: 13 + PROJECT_FILE.spare });
    s.fs.freeBytes = free;
    const run: FileRun = { cancelled: false, onProgress: () => { run.cancelled = true; } };
    await expect(s.storage.restoreProject(PICKED, run, now)).rejects.toMatchObject({ code: "cancelled" });
    const move = s.fs.moveDir;
    s.fs.moveDir = async () => { throw new Error("disk"); };
    await expect(s.storage.restoreProject(PICKED, go(), now)).rejects.toThrow("disk");
    s.fs.moveDir = move;
    expect(await s.fs.list("file:///doc/projects")).toEqual(["id1"]);
    expect(temporaries(s.fs)).toEqual([]);
    expect(s.fs.files.has(PICKED)).toBe(true);   // the picked file is the caller's to remove
  });
});

test("sweepProjectFiles removes both temporary places whole, and nothing else", async () => {
  const s = await setup();
  s.fs.files.set("file:///cache/project-files/part-old.clipy", "x"); s.fs.files.set("file:///cache/project-files/r/Old.clipy", "x");
  s.fs.files.set("file:///doc/incoming/half/media/a.mov", "x"); s.fs.files.set("file:///cache/exports/v.mp4", "V");
  const projects = [...s.fs.files.keys()].filter((k) => k.includes("/projects/"));
  await s.storage.sweepProjectFiles();
  expect(temporaries(s.fs)).toEqual([]);
  expect(s.fs.files.has("file:///cache/exports/v.mp4")).toBe(true);
  expect([...s.fs.files.keys()].filter((k) => k.includes("/projects/"))).toEqual(projects);
});

test("every run starts by sweeping what an earlier one left", async () => {
  const s = await setup();
  s.fs.files.set("file:///cache/project-files/part-old.clipy", "x"); s.fs.files.set("file:///doc/incoming/half/media/a.mov", "x");
  const made = await s.storage.packProject("id1", go(), now);
  expect(temporaries(s.fs).filter((k) => s.fs.files.has(k))).toEqual([made.uri]);
});

// —— Beyond the plan's list: the rules a user's project depends on ——
/** Everything under one project's folder, path → bytes. */
const folder = (fs: ReturnType<typeof memoryFs>, dir: string) => [...fs.files.entries()].filter(([k]) => k.startsWith(`${dir}/`)).sort(([a], [b]) => a.localeCompare(b));

test("an existing project's folder is byte for byte what it was after a pack, a failed open and a successful open", async () => {
  const s = await setup();
  const before = folder(s.fs, s.dir);
  expect(before.length).toBeGreaterThan(8);
  await saved(s);
  expect(folder(s.fs, s.dir)).toEqual(before);
  const move = s.fs.moveDir;
  s.fs.moveDir = async () => { throw new Error("disk"); };
  await expect(s.storage.restoreProject(PICKED, go(), now)).rejects.toThrow("disk");
  s.fs.moveDir = move;
  expect(folder(s.fs, s.dir)).toEqual(before);
  s.fs.files.set("file:///picked/cut.clipy", s.fs.files.get(PICKED)!.slice(0, 40));
  await expect(s.storage.restoreProject("file:///picked/cut.clipy", go(), now)).rejects.toMatchObject({ code: "damaged" });
  expect(folder(s.fs, s.dir)).toEqual(before);
  await s.storage.restoreProject(PICKED, go(), now);
  expect(folder(s.fs, s.dir)).toEqual(before);
});

test("a new id that is already a project's folder: refused before anything is written, and that project is not removed", async () => {
  const s = await setup();
  await saved(s);
  const before = folder(s.fs, s.dir);
  const same = makeStorage(s.fs, { thumbnail: s.thumbnail, newId: () => "id1", nowIso: () => "2026-10-13T10:00:00.000Z" });
  const moved = jest.spyOn(s.fs, "moveDir");
  const failure = await same.restoreProject(PICKED, go(), now).catch((e: unknown) => e);
  expect(failure).toBeInstanceOf(Error);
  expect(failure).not.toBeInstanceOf(ProjectFileError);
  expect(moved).not.toHaveBeenCalled();
  expect(folder(s.fs, s.dir)).toEqual(before);
  expect(temporaries(s.fs)).toEqual([]);
});

test("two source names a phone may take for one file: the copy is not made — a plain failure, nothing left, the project untouched", async () => {
  const s = await setup();
  const { project } = await s.storage.loadProject("id1");
  s.fs.files.set(`${s.dir}/media/ID2.mov`, "UPPER");
  await s.storage.saveProject({ ...project, clips: [project.clips[0], { ...project.clips[1], sourceUri: `${s.dir}/media/ID2.mov` }] });
  const before = folder(s.fs, s.dir);
  const failure = await s.storage.packProject("id1", go(), now).catch((e: unknown) => e);
  expect(failure).toBeInstanceOf(Error);
  expect(failure).not.toBeInstanceOf(ProjectFileError);
  expect(temporaries(s.fs)).toEqual([]);
  expect(folder(s.fs, s.dir)).toEqual(before);
});

test("the sweep never throws, whatever the file system does", async () => {
  const s = await setup();
  s.fs.remove = (() => { throw new Error("sync"); }) as typeof s.fs.remove;
  await expect(s.storage.sweepProjectFiles()).resolves.toBeUndefined();
  s.fs.remove = async () => { throw new Error("async"); };
  await expect(s.storage.sweepProjectFiles()).resolves.toBeUndefined();
});
