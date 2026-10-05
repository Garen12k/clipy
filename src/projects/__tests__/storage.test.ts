import { makeClip, makePhotoClip, makeProject, SCHEMA_VERSION, type Project } from "@/src/editor/model/types";
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

test("extension: a photo prefers the uri extension (converted JPEG with a .HEIC name); videos keep fileName first", async () => {
  const { fs, storage } = setup();
  fs.files.set("file:///picked/conv.jpg", "P");
  fs.files.set("file:///picked/x.mp4", "V");
  fs.files.set("file:///picked/noext", "Q");
  const { clips } = await storage.importMedia("proj", [
    photo("file:///picked/conv.jpg", { fileName: "IMG_1.HEIC" }),
    { ...asset("file:///picked/x.mp4"), fileName: "clip.MOV" },
    photo("file:///picked/noext", { fileName: "IMG_2.heic" }),
  ]);
  expect(clips[0].sourceUri).toBe(`${fs.documentDir}projects/proj/media/id1.jpg`);
  expect(clips[1].sourceUri).toBe(`${fs.documentDir}projects/proj/media/id2.mov`);
  expect(clips[2].sourceUri).toBe(`${fs.documentDir}projects/proj/media/id3.heic`);
});

describe("cover file", () => {
  const dir = "file:///doc/projects/id1";
  const a = makeClip({ id: "a", sourceDuration: 4 });
  const b = makeClip({ id: "b", sourceDuration: 6 });
  const withCover = (cover: Project["cover"] = { time: 5, title: "Trip" }, clips = [a, b]) => makeProject({ id: "id1", clips, cover });
  /** A saved project with today's thumbnail in its folder. */
  async function saved(p: Project) {
    const s = setup();
    await s.storage.saveProject(p);
    s.fs.files.set(`${dir}/thumb.jpg`, "THUMB");
    return s;
  }
  const covers = (fs: { files: Map<string, string> }, folder = dir) => [...fs.files.keys()].filter((f) => f.startsWith(`${folder}/cover-`)).sort();

  test("writeCover writes the frame at the cover time and removes older cover files", async () => {
    const p = withCover();
    const { fs, storage, thumbnail } = await saved(p);
    fs.files.set(`${dir}/cover-2000.jpg`, "OLD");
    const json = fs.files.get(`${dir}/project.json`);
    await storage.writeCover(p);
    expect(thumbnail).toHaveBeenCalledTimes(1);
    expect(thumbnail).toHaveBeenCalledWith(b.sourceUri, 1000);
    expect(covers(fs)).toEqual([`${dir}/cover-5000-b-b-1000.jpg`]);
    expect(fs.files.get(`${dir}/cover-5000-b-b-1000.jpg`)).toBe("JPEG");
    expect(fs.files.get(`${dir}/thumb.jpg`)).toBe("THUMB");
    expect(fs.files.get(`${dir}/project.json`)).toBe(json);
  });

  test("writeCover does nothing when the file is already there", async () => {
    const p = withCover();
    const { fs, storage, thumbnail } = await saved(p);
    await storage.writeCover(p);
    await storage.writeCover(p);
    expect(thumbnail).toHaveBeenCalledTimes(1);
    expect(covers(fs)).toEqual([`${dir}/cover-5000-b-b-1000.jpg`]);
  });

  test("a photo at the cover time is copied, without the video thumbnailer", async () => {
    const ph = makePhotoClip({ id: "ph", seconds: 3 });
    const p = withCover({ time: 5, title: "" }, [a, ph]);
    const { fs, storage, thumbnail } = await saved(p);
    fs.files.set(ph.sourceUri, "PHOTO");
    await storage.writeCover(p);
    expect(thumbnail).not.toHaveBeenCalled();
    expect(covers(fs)).toEqual([`${dir}/cover-5000-ph-ph-0.jpg`]);
    expect(fs.files.get(`${dir}/cover-5000-ph-ph-0.jpg`)).toBe("PHOTO");
  });

  test("no cover removes every cover file and keeps the thumbnail", async () => {
    const p = withCover(null);
    const { fs, storage, thumbnail } = await saved(p);
    fs.files.set(`${dir}/cover-2000.jpg`, "OLD");
    fs.files.set(`${dir}/cover-5000-b-b-1000.jpg`, "OLD");
    await storage.writeCover(p);
    expect(covers(fs)).toEqual([]);
    expect(thumbnail).not.toHaveBeenCalled();
    expect(fs.files.get(`${dir}/thumb.jpg`)).toBe("THUMB");
  });

  test("a cover time past the end is read clamped: the last frame", async () => {
    const p = withCover({ time: 99, title: "Trip" });
    const { fs, storage, thumbnail } = await saved(p);
    await storage.writeCover(p);
    expect(thumbnail).toHaveBeenCalledWith(b.sourceUri, 5950);
    expect(covers(fs)).toEqual([`${dir}/cover-10000-b-b-5950.jpg`]);
  });

  test("a failing thumbnail warns once, does not throw, writes nothing and keeps the old cover file", async () => {
    const p = withCover();
    const { fs, storage, thumbnail } = await saved(p);
    fs.files.set(`${dir}/cover-2000.jpg`, "OLD");
    thumbnail.mockRejectedValueOnce(new Error("no frame"));
    await expect(storage.writeCover(p)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(covers(fs)).toEqual([`${dir}/cover-2000.jpg`]);
  });

  test("listProjects shows the cover file and title; the thumbnail when the file is missing or there is no cover", async () => {
    const p = withCover();
    const { fs, storage } = await saved(p);
    expect((await storage.listProjects())[0]).toMatchObject({ thumbUri: `${dir}/thumb.jpg`, coverTitle: "Trip" });
    await storage.writeCover(p);
    expect((await storage.listProjects())[0]).toMatchObject({ thumbUri: `${dir}/cover-5000-b-b-1000.jpg`, coverTitle: "Trip" });
    await storage.saveProject({ ...p, cover: null });
    expect((await storage.listProjects())[0]).toMatchObject({ thumbUri: `${dir}/thumb.jpg`, coverTitle: "" });
    await fs.writeText("file:///doc/projects/bad/project.json", "{");
    expect((await storage.listProjects()).find((s) => s.id === "bad")).toMatchObject({ broken: true, thumbUri: null, coverTitle: "" });
  });

  test("the same cover time over a different clip is a new file (never the old name), and the old one goes", async () => {
    const p = withCover();
    const { fs, storage, thumbnail } = await saved(p);
    await storage.writeCover(p);
    // The clips change places (b 0–6, a 6–10): second 5 is still in b, at its source second 5.
    const swapped = { ...p, clips: [b, a] };
    await storage.saveProject(swapped);
    await storage.writeCover(swapped);
    expect(thumbnail).toHaveBeenCalledTimes(2);
    expect(thumbnail).toHaveBeenLastCalledWith(b.sourceUri, 5000);
    expect(covers(fs)).toEqual([`${dir}/cover-5000-b-b-5000.jpg`]);
    expect((await storage.listProjects())[0].thumbUri).toBe(`${dir}/cover-5000-b-b-5000.jpg`);
    // Another clip under the same second.
    const c = makeClip({ id: "c", sourceDuration: 8 });
    const other = { ...p, clips: [a, c] };
    await storage.saveProject(other);
    await storage.writeCover(other);
    expect(thumbnail).toHaveBeenLastCalledWith(c.sourceUri, 1000);
    expect(covers(fs)).toEqual([`${dir}/cover-5000-c-c-1000.jpg`]);
  });

  test("trimming a clip before the cover time, or replacing the clip's media, gives a new file", async () => {
    const p = withCover();
    const { fs, storage } = await saved(p);
    await storage.writeCover(p);
    // a is cut to its last 3 seconds: second 5 is now b's source second 2.
    const trimmed = { ...p, clips: [{ ...a, trimStart: 1 }, b] };
    await storage.writeCover(trimmed);
    expect(covers(fs)).toEqual([`${dir}/cover-5000-b-b-2000.jpg`]);
    // Replace keeps the clip's id; the picture is another file's.
    const replaced = { ...trimmed, clips: [trimmed.clips[0], { ...b, sourceUri: "file:///doc/projects/id1/media/new one.mov" }] };
    await storage.writeCover(replaced);
    expect(covers(fs)).toEqual([`${dir}/cover-5000-b-new_one-2000.jpg`]);
    // A new failure keeps the file that is there (the list falls back to thumb.jpg, since its name is no longer the cover's).
    const again = { ...replaced, cover: { time: 6, title: "Trip" } };
    await storage.saveProject(again);
    fs.copy = jest.fn(async () => { throw new Error("disk full"); });
    await storage.writeCover(again);
    expect(covers(fs)).toEqual([`${dir}/cover-5000-b-new_one-2000.jpg`]);
    expect((await storage.listProjects())[0].thumbUri).toBe(`${dir}/thumb.jpg`);
  });

  test("duplicateProject copies the cover file", async () => {
    const p = withCover();
    const { fs, storage } = await saved(p);
    for (const c of p.clips) fs.files.set(c.sourceUri, "V");
    await storage.writeCover(p);
    const copy = await storage.duplicateProject("id1");
    expect(covers(fs, `file:///doc/projects/${copy.id}`)).toEqual([`file:///doc/projects/${copy.id}/cover-5000-b-b-1000.jpg`]);
    expect((await storage.listProjects()).find((s) => s.id === copy.id)).toMatchObject({ thumbUri: `file:///doc/projects/${copy.id}/cover-5000-b-b-1000.jpg`, coverTitle: "Trip" });
  });
});

test("createProject stores the chosen aspect ratio; without one a new project is Auto", async () => {
  const { fs, storage } = setup();
  fs.files.set("file:///picked/a.mov", "A");
  const chosen = await storage.createProject("Wide", [asset("file:///picked/a.mov")], "21:9");
  expect(chosen.project.aspectRatio).toBe("21:9");
  expect((await storage.loadProject(chosen.project.id)).project.aspectRatio).toBe("21:9");
  const plain = await storage.createProject("Plain", [asset("file:///picked/a.mov")]);
  expect(plain.project.aspectRatio).toBe("auto");
  expect((await storage.loadProject(plain.project.id)).project.aspectRatio).toBe("auto");
});
