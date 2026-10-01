import { memoryFs } from "../fs";
import { makeStorage } from "../storage";

test("importAudio copies the file into the project's media folder and returns a track", async () => {
  const fs = memoryFs();
  let n = 0;
  const storage = makeStorage(fs, { thumbnail: async () => "x", newId: () => `id${++n}`, nowIso: () => "2026-10-01T10:00:00.000Z" });
  fs.files.set("file:///picked/song.mp3", "MP3");
  await fs.mkdir(`${fs.documentDir}projects/p1/media`);
  const track = await storage.importAudio("p1", { uri: "file:///picked/song.mp3", title: "song.mp3", durationSec: 42.5 });
  expect(track).toEqual({ id: "id1", sourceUri: `${fs.documentDir}projects/p1/media/id1.mp3`, title: "song.mp3", sourceDuration: 42.5, start: 0, trimStart: 0, trimEnd: 42.5, volume: 1 });
  expect(fs.files.get(track.sourceUri)).toBe("MP3");
});
