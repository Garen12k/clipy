import { SCHEMA_VERSION } from "@/src/editor/model/types";
import { memoryFs } from "../fs";
import { makeStorage, type PickedAsset } from "../storage";

function setup() {
  const fs = memoryFs();
  let n = 0;
  const thumbnail = jest.fn(async (uri: string) => {
    const out = `file:///tmp/thumb-${uri.length}.jpg`;
    fs.files.set(out, "JPEG");
    return out;
  });
  const storage = makeStorage(fs, { thumbnail, newId: () => `id${++n}`, nowIso: () => "2026-10-01T10:00:00.000Z" });
  return { fs, storage, thumbnail };
}
let warn: jest.SpyInstance;
beforeEach(() => { warn = jest.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => warn.mockRestore());

const asset = (uri: string, durationSec = 4): PickedAsset => ({ uri, kind: "video", durationSec, width: 1080, height: 1920, fileName: "clip.mov" });

test("createProject copies media, writes project.json and a thumbnail", async () => {
  const { fs, storage } = setup();
  fs.files.set("file:///picked/a.mov", "A");
  fs.files.set("file:///picked/b.mov", "B");
  const { project, failed } = await storage.createProject("Project 1", [asset("file:///picked/a.mov"), asset("file:///picked/b.mov", 2)]);
  expect(failed).toBe(0);
  expect(project.id).toBe("id1");
  expect(project.clips.map((c) => c.trimEnd)).toEqual([4, 2]);
  expect(project.clips[0].sourceUri).toBe(`${fs.documentDir}projects/id1/media/id2.mov`);
  expect(fs.files.get(`${fs.documentDir}projects/id1/media/id2.mov`)).toBe("A");
  expect(JSON.parse(fs.files.get(`${fs.documentDir}projects/id1/project.json`)!).schemaVersion).toBe(SCHEMA_VERSION);
  expect(fs.files.has(`${fs.documentDir}projects/id1/thumb.jpg`)).toBe(true);
});

test("createProject skips unreadable assets and counts them", async () => {
  const { fs, storage } = setup();
  fs.files.set("file:///picked/a.mov", "A");
  const { project, failed } = await storage.createProject("P", [asset("file:///picked/a.mov"), asset("file:///picked/missing.mov")]);
  expect(project.clips).toHaveLength(1);
  expect(failed).toBe(1);
});

test("saveProject is atomic and loadProject round-trips; missing media is reported", async () => {
  const { fs, storage } = setup();
  fs.files.set("file:///picked/a.mov", "A");
  const { project } = await storage.createProject("P", [asset("file:///picked/a.mov")]);
  await storage.saveProject({ ...project, name: "Renamed" });
  expect(fs.files.has(`${fs.documentDir}projects/id1/project.json.tmp`)).toBe(false);
  const loaded = await storage.loadProject("id1");
  expect(loaded.project.name).toBe("Renamed");
  expect(loaded.missingSourceUris).toEqual([]);
  fs.files.delete(project.clips[0].sourceUri);
  // Two clips sharing one missing source (e.g. after a split) report it once.
  await storage.saveProject({ ...project, clips: [project.clips[0], { ...project.clips[0], id: "split" }] });
  expect((await storage.loadProject("id1")).missingSourceUris).toEqual([project.clips[0].sourceUri]);
});

test("loadProject rejects a wrong schemaVersion with a readable error", async () => {
  const { fs, storage } = setup();
  await fs.mkdir(`${fs.documentDir}projects/x`);
  await fs.writeText(`${fs.documentDir}projects/x/project.json`, JSON.stringify({ id: "x", clips: [], schemaVersion: SCHEMA_VERSION + 1 }));
  await expect(storage.loadProject("x")).rejects.toThrow(/newer version/);
});

test("loadProject migrates a v1 file to v2, adding muted: false", async () => {
  const { fs, storage } = setup();
  await fs.mkdir(`${fs.documentDir}projects/x`);
  await fs.writeText(`${fs.documentDir}projects/x/project.json`, JSON.stringify({
    id: "x", name: "Old", createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z",
    aspectRatio: "9:16", schemaVersion: 1,
    clips: [{ id: "a", sourceUri: "file:///m/a.mp4", sourceDuration: 4, width: 1080, height: 1920, trimStart: 0, trimEnd: 4, speed: 1, filter: null, volume: 1, transitionOut: { type: "none", duration: 0 } }],
  }));
  const { project } = await storage.loadProject("x");
  expect(project.schemaVersion).toBe(SCHEMA_VERSION);
  expect(project.clips[0]).toMatchObject({ muted: false, volume: 1 });
  expect(project.overlays).toEqual([]);
  expect(project.audioTracks).toEqual([]);
});

test("listProjects summarises, newest first, and flags broken files", async () => {
  const { fs, storage } = setup();
  fs.files.set("file:///picked/a.mov", "A");
  await storage.createProject("First", [asset("file:///picked/a.mov", 3)]);
  await fs.mkdir(`${fs.documentDir}projects/bad`);
  await fs.writeText(`${fs.documentDir}projects/bad/project.json`, "{not json");
  const list = await storage.listProjects();
  expect(list.map((s) => [s.id, s.broken])).toEqual([["id1", false], ["bad", true]]);
  expect(list[0]).toMatchObject({ name: "First", durationSec: 3, thumbUri: `${fs.documentDir}projects/id1/thumb.jpg` });
});

test("deleteProject, duplicateProject, renameProject", async () => {
  const { fs, storage } = setup();
  fs.files.set("file:///picked/a.mov", "A");
  const { project } = await storage.createProject("P", [asset("file:///picked/a.mov")]);
  const copy = await storage.duplicateProject(project.id);
  expect(copy.id).not.toBe(project.id);
  expect(copy.name).toBe("P copy");
  expect(fs.files.get(copy.clips[0].sourceUri)).toBe("A");
  await storage.renameProject(copy.id, "Second");
  expect((await storage.loadProject(copy.id)).project.name).toBe("Second");
  await storage.deleteProject(project.id);
  expect((await storage.listProjects()).map((s) => s.id)).toEqual([copy.id]);
});

test("listProjects reports unique postedTo in platform order; new projects have no posts", async () => {
  const { fs, storage } = setup();
  const { project } = await storage.createProject("P", []);
  expect(project.posts).toEqual([]);
  const at = "2026-10-02T10:00:00.000Z";
  await storage.saveProject({ ...project, posts: [
    { platform: "tiktok", url: null, postedAt: at }, { platform: "youtube", url: "u", postedAt: at }, { platform: "youtube", url: "v", postedAt: at }] });
  await fs.writeText(`${fs.documentDir}projects/bad/project.json`, "{");
  const list = await storage.listProjects();
  expect(list.find((p) => p.id === project.id)!.postedTo).toEqual(["youtube", "tiktok"]);
  expect(list.find((p) => p.id === "bad")!.postedTo).toEqual([]);
});

test("duplicateProject starts with no posts and leaves the original's records", async () => {
  const { storage } = setup();
  const { project } = await storage.createProject("P", []);
  const post = { platform: "youtube" as const, url: "u", postedAt: "2026-10-02T10:00:00.000Z" };
  await storage.saveProject({ ...project, posts: [post] });
  const copy = await storage.duplicateProject(project.id);
  expect(copy.posts).toEqual([]);
  const list = await storage.listProjects();
  expect(list.find((p) => p.id === copy.id)!.postedTo).toEqual([]);
  expect(list.find((p) => p.id === project.id)!.postedTo).toEqual(["youtube"]);
  expect((await storage.loadProject(project.id)).project.posts).toEqual([post]);
});

const photo = (uri: string, over: Partial<PickedAsset> = {}): PickedAsset => ({ uri, kind: "photo", durationSec: 0, width: 4032, height: 3024, fileName: "IMG_1.HEIC", ...over });

test("importMedia copies files into media/ and builds video and photo clips", async () => {
  const { fs, storage } = setup();
  fs.files.set("file:///picked/a.mov", "A");
  fs.files.set("file:///picked/p.heic", "P");
  const { clips, failed } = await storage.importMedia("proj", [asset("file:///picked/a.mov"), photo("file:///picked/p.heic")]);
  expect(failed).toBe(0);
  expect(clips).toHaveLength(2);
  expect(clips[0]).toMatchObject({ kind: "video", trimStart: 0, trimEnd: 4, sourceDuration: 4, sourceUri: `${fs.documentDir}projects/proj/media/id1.mov` });
  expect(clips[1]).toMatchObject({ kind: "photo", trimStart: 0, trimEnd: 3, sourceDuration: 60, muted: true, speed: 1, reversed: false, width: 4032, height: 3024,
    sourceUri: `${fs.documentDir}projects/proj/media/id2.heic` });
  expect(fs.files.get(clips[1].sourceUri)).toBe("P");
});

test("importMedia counts unreadable items and photos without a size as failed", async () => {
  const { fs, storage } = setup();
  fs.files.set("file:///picked/p.jpg", "P");
  const { clips, failed } = await storage.importMedia("proj", [
    asset("file:///picked/missing.mov"), photo("file:///picked/p.jpg", { width: 0 }), photo("file:///picked/p.jpg", { height: 0 }), photo("file:///picked/p.jpg", { fileName: "p.jpg" })]);
  expect(failed).toBe(3);
  expect(clips).toHaveLength(1);
  expect(clips[0].kind).toBe("photo");
});

test("importMedia throws when the project folder can't be written", async () => {
  const { fs, storage } = setup();
  fs.mkdir = async () => { throw new Error("EACCES"); };
  await expect(storage.importMedia("proj", [asset("file:///picked/a.mov")])).rejects.toThrow("EACCES");
});

test("saveStill copies a captured frame into media/ as a .jpg", async () => {
  const { fs, storage } = setup();
  fs.files.set("file:///tmp/frame.png", "F");
  const { uri } = await storage.saveStill("proj", "file:///tmp/frame.png");
  expect(uri).toBe(`${fs.documentDir}projects/proj/media/id1.jpg`);
  expect(fs.files.get(uri)).toBe("F");
});

test("createProject with a photo first uses the photo as the thumbnail, without the video thumbnailer", async () => {
  const { fs, storage, thumbnail } = setup();
  fs.files.set("file:///picked/p.jpg", "P");
  const { project } = await storage.createProject("P", [photo("file:///picked/p.jpg", { fileName: "p.jpg" })]);
  expect(project.clips[0].kind).toBe("photo");
  expect(thumbnail).not.toHaveBeenCalled();
  expect(fs.files.get(`${fs.documentDir}projects/id1/thumb.jpg`)).toBe("P");
});

test("createProject with every item failing removes the folder and throws; an empty list still works", async () => {
  const { fs, storage } = setup();
  await expect(storage.createProject("P", [asset("file:///picked/missing.mov")])).rejects.toThrow("Couldn't import any of the selected items.");
  expect(await fs.exists(`${fs.documentDir}projects/id1`)).toBe(false);
  await expect(storage.createProject("P", [])).resolves.toMatchObject({ failed: 0 });
});

test("a failed copy deletes the partial destination file", async () => {
  const { fs, storage } = setup();
  const remove = jest.spyOn(fs, "remove");
  await storage.importMedia("proj", [asset("file:///picked/missing.mov")]);
  expect(remove).toHaveBeenCalledWith(`${fs.documentDir}projects/proj/media/id1.mov`);
  remove.mockClear();
  await expect(storage.saveStill("proj", "file:///tmp/none.png")).rejects.toThrow();
  expect(remove).toHaveBeenCalledWith(`${fs.documentDir}projects/proj/media/id2.jpg`);
});

test("extension: extension-less fileName falls back to the uri; hostile names can't escape", async () => {
  const { fs, storage } = setup();
  fs.files.set("file:///picked/a.mp4", "A");
  fs.files.set("file:///picked/b", "B");
  const { clips } = await storage.importMedia("proj", [{ ...asset("file:///picked/a.mp4"), fileName: "clip" }, { ...asset("file:///picked/b"), fileName: "x.mo/../v" }]);
  expect(clips[0].sourceUri).toBe(`${fs.documentDir}projects/proj/media/id1.mp4`);
  expect(clips[1].sourceUri).toBe(`${fs.documentDir}projects/proj/media/id2.mp4`);
  expect(clips[1].sourceUri).not.toContain("..");
});

test("a video with zero or missing duration counts as failed", async () => {
  const { fs, storage } = setup();
  fs.files.set("file:///picked/a.mov", "A");
  const { clips, failed } = await storage.importMedia("proj", [asset("file:///picked/a.mov", 0), asset("file:///picked/a.mov", NaN)]);
  expect(clips).toHaveLength(0);
  expect(failed).toBe(2);
});
