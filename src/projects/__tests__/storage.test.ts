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
const asset = (uri: string, durationSec = 4): PickedAsset => ({ uri, durationSec, width: 1080, height: 1920, fileName: "clip.mov" });

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
  expect(JSON.parse(fs.files.get(`${fs.documentDir}projects/id1/project.json`)!).schemaVersion).toBe(1);
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
  expect(loaded.missingClipIds).toEqual([]);
  fs.files.delete(project.clips[0].sourceUri);
  expect((await storage.loadProject("id1")).missingClipIds).toEqual([project.clips[0].id]);
});

test("loadProject rejects a wrong schemaVersion with a readable error", async () => {
  const { fs, storage } = setup();
  await fs.mkdir(`${fs.documentDir}projects/x`);
  await fs.writeText(`${fs.documentDir}projects/x/project.json`, JSON.stringify({ schemaVersion: 2 }));
  await expect(storage.loadProject("x")).rejects.toThrow(/schemaVersion/);
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
