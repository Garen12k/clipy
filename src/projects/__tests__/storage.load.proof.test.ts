// PROOF — written before the path fix and never edited to make a change pass: a project whose folder has not moved loads exactly
// as it did before rebase-on-load existed, and loading writes nothing.
import { migrateProject } from "@/src/editor/model/migrate";
import { memoryFs } from "../fs";
import { makeStorage, type PickedAsset } from "../storage";

const asset = (uri: string): PickedAsset => ({ uri, kind: "video", durationSec: 4, width: 1080, height: 1920, fileName: "clip.mov" });

async function made() {
  const fs = memoryFs();
  let n = 0;
  const storage = makeStorage(fs, { thumbnail: async () => { fs.files.set("file:///tmp/t.jpg", "JPEG"); return "file:///tmp/t.jpg"; }, newId: () => `id${++n}`, nowIso: () => "2026-10-13T10:00:00.000Z" });
  fs.files.set("file:///picked/a.mov", "A"); fs.files.set("file:///picked/b.mov", "B"); fs.files.set("file:///picked/song.m4a", "S");
  const { project } = await storage.createProject("Beach", [asset("file:///picked/a.mov"), asset("file:///picked/b.mov")]);
  const track = await storage.importAudio(project.id, { uri: "file:///picked/song.m4a", title: "song.m4a", durationSec: 3 });
  await storage.saveProject({ ...project, layers: [{ ...project.clips[1], id: "layer", start: 1 }], audioTracks: [track] });
  return { fs, storage, json: "file:///doc/projects/id1/project.json" };
}

test("PROOF: an untouched project loads to exactly what migrate gives, with the references it has today", async () => {
  const { fs, storage, json } = await made();
  const text = fs.files.get(json)!;
  const { project, missingSourceUris } = await storage.loadProject("id1");
  expect(JSON.stringify(project)).toBe(JSON.stringify(migrateProject(JSON.parse(text))));
  expect(project.clips.map((c) => c.sourceUri)).toEqual(["file:///doc/projects/id1/media/id2.mov", "file:///doc/projects/id1/media/id3.mov"]);
  expect(project.layers.map((l) => l.sourceUri)).toEqual(["file:///doc/projects/id1/media/id3.mov"]);
  expect(project.audioTracks.map((a) => a.sourceUri)).toEqual(["file:///doc/projects/id1/media/id4.m4a"]);
  expect(missingSourceUris).toEqual([]);
});

test("PROOF: loading and listing write nothing — project.json keeps its bytes and no file appears, moves or goes", async () => {
  const { fs, storage, json } = await made();
  const before = new Map(fs.files);
  const spies = (["writeText", "copy", "move", "remove", "mkdir"] as const).map((m) => jest.spyOn(fs, m));
  await storage.loadProject("id1");
  await storage.listProjects();
  await storage.loadProject("id1");
  for (const s of spies) expect(s).not.toHaveBeenCalled();
  expect([...fs.files]).toEqual([...before]);
  expect(fs.files.get(json)).toBe(before.get(json));
});
