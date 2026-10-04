import { makeLayer } from "@/src/editor/model/types";
import { memoryFs } from "../fs";
import { makeStorage } from "../storage";

test("importAudio copies the file into the project's media folder and returns a track", async () => {
  const fs = memoryFs();
  let n = 0;
  const storage = makeStorage(fs, { thumbnail: async () => "x", newId: () => `id${++n}`, nowIso: () => "2026-10-01T10:00:00.000Z" });
  fs.files.set("file:///picked/song.mp3", "MP3");
  await fs.mkdir(`${fs.documentDir}projects/p1/media`);
  const track = await storage.importAudio("p1", { uri: "file:///picked/song.mp3", title: "song.mp3", durationSec: 42.5 });
  expect(track).toEqual({ id: "id1", sourceUri: `${fs.documentDir}projects/p1/media/id1.mp3`, title: "song.mp3", sourceDuration: 42.5, start: 0, trimStart: 0, trimEnd: 42.5, volume: 1, kind: "music", fadeIn: 0, fadeOut: 0 });
  expect(fs.files.get(track.sourceUri)).toBe("MP3");
});

test("loadProject reports a missing audio file", async () => {
  const fs = memoryFs();
  let n = 0;
  const storage = makeStorage(fs, { thumbnail: async () => "x", newId: () => `id${++n}`, nowIso: () => "2026-10-01T10:00:00.000Z" });
  const { project } = await storage.createProject("P", []);
  fs.files.set("file:///picked/song.mp3", "MP3");
  const track = await storage.importAudio(project.id, { uri: "file:///picked/song.mp3", title: "song.mp3", durationSec: 10 });
  await storage.saveProject({ ...project, audioTracks: [track] });
  expect((await storage.loadProject(project.id)).missingSourceUris).toEqual([]);
  fs.files.delete(track.sourceUri);
  expect((await storage.loadProject(project.id)).missingSourceUris).toEqual([track.sourceUri]);
});

test("duplicateProject copies the audio file into the copy's media folder", async () => {
  const fs = memoryFs();
  let n = 0;
  const storage = makeStorage(fs, { thumbnail: async () => "x", newId: () => `id${++n}`, nowIso: () => "2026-10-01T10:00:00.000Z" });
  const { project } = await storage.createProject("P", []);
  fs.files.set("file:///picked/song.mp3", "MP3");
  const track = await storage.importAudio(project.id, { uri: "file:///picked/song.mp3", title: "song.mp3", durationSec: 10 });
  await storage.saveProject({ ...project, audioTracks: [track] });
  const copy = await storage.duplicateProject(project.id);
  const copied = copy.audioTracks[0]!;
  expect(copied.sourceUri).toBe(`${storage.projectDir(copy.id)}/media/${track.id}.mp3`);
  expect(copied.sourceUri).not.toBe(track.sourceUri);
  expect(fs.files.get(copied.sourceUri)).toBe("MP3");
  expect(fs.files.get(track.sourceUri)).toBe("MP3");
});
test("importAudio takes an optional kind", async () => {
  const fs = memoryFs();
  const storage = makeStorage(fs, { thumbnail: async () => "x", newId: () => "id9", nowIso: () => "2026-10-01T10:00:00.000Z" });
  fs.files.set("file:///picked/rec.m4a", "M4A");
  const track = await storage.importAudio("p1", { uri: "file:///picked/rec.m4a", title: "rec.m4a", durationSec: 3 }, "voice");
  expect(track).toMatchObject({ kind: "voice", fadeIn: 0, fadeOut: 0 });
});

test("loadProject reports a missing layer file", async () => {
  const fs = memoryFs();
  let n = 0;
  const storage = makeStorage(fs, { thumbnail: async () => "x", newId: () => `id${++n}`, nowIso: () => "2026-10-01T10:00:00.000Z" });
  const { project } = await storage.createProject("P", []);
  const layer = makeLayer({ id: "L", sourceDuration: 4, sourceUri: `${storage.projectDir(project.id)}/media/L.mp4` });
  fs.files.set(layer.sourceUri, "V");
  await storage.saveProject({ ...project, layers: [layer] });
  expect((await storage.loadProject(project.id)).missingSourceUris).toEqual([]);
  fs.files.delete(layer.sourceUri);
  expect((await storage.loadProject(project.id)).missingSourceUris).toEqual([layer.sourceUri]);
});

test("duplicateProject copies layers and their media", async () => {
  const fs = memoryFs();
  let n = 0;
  const storage = makeStorage(fs, { thumbnail: async () => "x", newId: () => `id${++n}`, nowIso: () => "2026-10-01T10:00:00.000Z" });
  const { project } = await storage.createProject("P", []);
  const layer = makeLayer({ id: "L", sourceDuration: 4, start: 2, sourceUri: `${storage.projectDir(project.id)}/media/L.mp4` });
  fs.files.set(layer.sourceUri, "V");
  await storage.saveProject({ ...project, layers: [layer] });
  const copy = await storage.duplicateProject(project.id);
  expect(copy.layers).toHaveLength(1);
  expect(copy.layers[0]).toMatchObject({ id: "L", start: 2, sourceUri: `${storage.projectDir(copy.id)}/media/L.mp4` });
  expect(fs.files.get(copy.layers[0].sourceUri)).toBe("V");
});
