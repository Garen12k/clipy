import { memoryFs } from "../fs";
import { makeQuickEdit } from "../quickEditFlow";
import { makeStorage, type PickedAsset } from "../storage";
import type { UserStyle } from "../userStyles";

function setup() {
  const fs = memoryFs();
  let n = 0;
  const storage = makeStorage(fs, { thumbnail: async () => { fs.files.set("file:///tmp/t.jpg", "JPEG"); return "file:///tmp/t.jpg"; }, newId: () => `id${++n}`, nowIso: () => "2026-10-16T12:00:00.000Z" });
  fs.files.set("file:///bundled/song.mp3", "MP3");
  fs.files.set("file:///doc/styles/media/s1.mp3", "OWN");
  fs.files.set("file:///picked/a.jpg", "A");
  return { fs, storage, deps: { storage, assetUri: jest.fn(async () => "file:///bundled/song.mp3"), newId: () => `id${++n}` } };
}
const photo = (uri: string): PickedAsset => ({ uri, kind: "photo", durationSec: 0, width: 3024, height: 4032, fileName: "IMG.jpg" });
const style = (over: Partial<UserStyle> = {}): UserStyle => ({ id: "s1", name: "Mine", createdAt: "", music: null, filter: "vivid", filterIntensity: 0.5,
  transition: { type: "none", duration: 0 }, title: null, motions: [], motionStrength: 0.5, ...over });
let warn: jest.SpyInstance;
beforeEach(() => { warn = jest.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => warn.mockRestore());

test("own music: the style's file is copied into the new project like a bundled song; no download", async () => {
  const { storage, deps } = setup();
  const s = style({ music: { kind: "own", file: "s1.mp3", title: "mine.mp3", durationSec: 30, beats: [] } });
  const made = await makeQuickEdit(deps, "Project 1", [photo("file:///picked/a.jpg")], { style: s, musicUri: "file:///doc/styles/media/s1.mp3" });
  const { project, missingSourceUris } = await storage.loadProject(made.id);
  expect(deps.assetUri).not.toHaveBeenCalled();
  expect(missingSourceUris).toEqual([]);
  expect(project.audioTracks).toHaveLength(1);
  expect(project.audioTracks[0]).toMatchObject({ title: "mine.mp3", sourceDuration: 30, trimStart: 0, fadeOut: 1 });
  expect(project.audioTracks[0].sourceUri).toMatch(new RegExp(`projects/${made.id}/media/.+\\.mp3$`));
  expect(project.clips[0]).toMatchObject({ filter: "vivid", filterIntensity: 0.5 });
});
test("a bundled song: resolved FIRST through assetUri, as a built-in style's", async () => {
  const { storage, deps } = setup();
  const made = await makeQuickEdit(deps, "Project 1", [photo("file:///picked/a.jpg")], { style: style({ music: { kind: "bundled", trackId: "party-sector" } }), musicUri: null });
  expect(deps.assetUri).toHaveBeenCalledTimes(1);
  expect((await storage.loadProject(made.id)).project.audioTracks[0]).toMatchObject({ title: "Party Sector" });
});
test("no music: a draft without sound", async () => {
  const { storage, deps } = setup();
  const made = await makeQuickEdit(deps, "Project 1", [photo("file:///picked/a.jpg")], { style: style(), musicUri: null });
  expect((await storage.loadProject(made.id)).project.audioTracks).toEqual([]);
  expect(deps.assetUri).not.toHaveBeenCalled();
});
test("own music without its uri: it throws and nothing is created", async () => {
  const { fs, deps } = setup();
  await expect(makeQuickEdit(deps, "P", [photo("file:///picked/a.jpg")], { style: style({ music: { kind: "own", file: "s1.mp3", title: "m", durationSec: 3, beats: [] } }), musicUri: null })).rejects.toThrow("style music missing");
  expect(await fs.list("file:///doc/projects")).toEqual([]);
});
test("a bundled song that is no longer shipped: built as a style without music (the sheet said \"No music.\")", async () => {
  const { storage, deps } = setup();
  const made = await makeQuickEdit(deps, "P", [photo("file:///picked/a.jpg")], { style: style({ music: { kind: "bundled", trackId: "gone" } }), musicUri: null });
  const { project } = await storage.loadProject(made.id);
  expect(project.audioTracks).toEqual([]);
  expect(project.beatMarkers).toEqual([]);
  expect(project.clips[0]).toMatchObject({ filter: "vivid" });
  expect(deps.assetUri).not.toHaveBeenCalled();
});
