import { clipStartTimes, totalDuration } from "@/src/editor/model/timeline";
import { BUNDLED_BEATS } from "@/src/editor/musicBeats";
import { memoryFs } from "../fs";
import { makeQuickEdit } from "../quickEditFlow";
import { makeStorage, type PickedAsset } from "../storage";

function setup() {
  const fs = memoryFs();
  let n = 0;
  const storage = makeStorage(fs, { thumbnail: async () => { fs.files.set("file:///tmp/t.jpg", "JPEG"); return "file:///tmp/t.jpg"; }, newId: () => `id${++n}`, nowIso: () => "2026-10-06T12:00:00.000Z" });
  fs.files.set("file:///bundled/song.mp3", "MP3");
  const deps = { storage, assetUri: jest.fn(async () => "file:///bundled/song.mp3"), newId: () => `id${++n}` };
  const projects = () => fs.list(`${fs.documentDir}projects`);
  return { fs, storage, deps, projects };
}
const photo = (uri: string): PickedAsset => ({ uri, kind: "photo", durationSec: 0, width: 3024, height: 4032, fileName: "IMG.jpg" });
const video = (uri: string, durationSec: number): PickedAsset => ({ uri, kind: "video", durationSec, width: 1920, height: 1080, fileName: "IMG.mov" });
let warn: jest.SpyInstance;
beforeEach(() => { warn = jest.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => warn.mockRestore());

test("a draft: the media in the order picked, the recipe's music copied into the project, cuts on the beat, saved as an ordinary project", async () => {
  const { fs, storage, deps } = setup();
  for (const f of ["a.jpg", "b.mov", "c.jpg"]) fs.files.set(`file:///picked/${f}`, f);
  const made = await makeQuickEdit(deps, "Project 1", [photo("file:///picked/a.jpg"), video("file:///picked/b.mov", 20), photo("file:///picked/c.jpg")], "party");
  expect(made.failed).toBe(0);
  const { project, missingSourceUris } = await storage.loadProject(made.id);
  expect(missingSourceUris).toEqual([]);                                       // every file the draft names is inside the project
  expect(project.name).toBe("Project 1");
  expect(project.aspectRatio).toBe("auto");
  expect(project.clips.map((c) => c.kind)).toEqual(["photo", "video", "photo"]);
  expect(project.audioTracks).toHaveLength(1);
  expect(project.audioTracks[0]).toMatchObject({ title: "Party Sector", sourceDuration: 96.1, kind: "music", start: 0, trimStart: BUNDLED_BEATS["party-sector"]!.first, fadeOut: 1 });
  expect(project.audioTracks[0].sourceUri).toMatch(new RegExp(`projects/${made.id}/media/.+\\.mp3$`));
  expect(project.beatMarkers.length).toBeGreaterThan(5);
  for (const t of [...clipStartTimes(project).slice(1), totalDuration(project)]) expect(project.beatMarkers.some((m) => Math.abs(m - t) <= 0.001)).toBe(true);
  expect(project.overlays).toHaveLength(1);
  expect(project.clips.every((c) => c.filter === "vivid")).toBe(true);
});

test("an item that cannot be read is left out and counted; the draft is made from the rest", async () => {
  const { fs, deps, storage } = setup();
  fs.files.set("file:///picked/a.jpg", "A");
  const made = await makeQuickEdit(deps, "Project 1", [photo("file:///picked/a.jpg"), photo("file:///picked/gone.jpg")], "calm");
  expect(made.failed).toBe(1);
  expect((await storage.loadProject(made.id)).project.clips).toHaveLength(1);
});

test("nothing could be imported: it throws and no project is left behind", async () => {
  const { deps, projects } = setup();
  await expect(makeQuickEdit(deps, "Project 1", [photo("file:///picked/gone.jpg")], "travel")).rejects.toThrow(/Couldn't import any/);
  expect(await projects()).toEqual([]);
  expect(deps.assetUri).not.toHaveBeenCalled();
});

test("the music cannot be copied: the half-made project is deleted and the error passed on", async () => {
  const { fs, deps, projects } = setup();
  fs.files.set("file:///picked/a.jpg", "A");
  deps.assetUri.mockResolvedValueOnce("file:///bundled/missing.mp3");
  await expect(makeQuickEdit(deps, "Project 1", [photo("file:///picked/a.jpg")], "travel")).rejects.toThrow(/ENOENT/);
  expect(await projects()).toEqual([]);
});

test("the draft cannot be saved: the project is deleted as well", async () => {
  const { fs, deps, storage, projects } = setup();
  fs.files.set("file:///picked/a.jpg", "A");
  const save = jest.fn().mockRejectedValue(new Error("disk full"));
  await expect(makeQuickEdit({ ...deps, storage: { ...storage, saveProject: save } }, "Project 1", [photo("file:///picked/a.jpg")], "retro")).rejects.toThrow("disk full");
  expect(save).toHaveBeenCalledTimes(1);
  expect(await projects()).toEqual([]);
});
