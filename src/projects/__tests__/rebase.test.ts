import { makeAudioTrack, makeClip, makeLayer, makeProject, type Project } from "@/src/editor/model/types";
import { memoryFs } from "../fs";
import { rebaseProject, rebaseUri } from "../rebase";
import { makeStorage } from "../storage";

const OLD = "file:///var/mobile/Containers/Data/Application/AAAA-1111/Documents/projects/p1";
const NOW = "file:///var/mobile/Containers/Data/Application/BBBB-2222/Documents/projects/p1";

describe("rebaseUri", () => {
  test("under today's folder: untouched", () => expect(rebaseUri(`${NOW}/media/a.mov`, "p1", NOW)).toBe(`${NOW}/media/a.mov`));
  test("under the same project in another container: the relative part is kept", () => expect(rebaseUri(`${OLD}/media/a.mov`, "p1", NOW)).toBe(`${NOW}/media/a.mov`));
  test("the LAST marker counts", () => expect(rebaseUri("file:///x/projects/p1/y/projects/p1/media/a.mov", "p1", NOW)).toBe(`${NOW}/media/a.mov`));
  test("another project's folder, a file outside, an empty string: left alone", () => {
    for (const uri of ["file:///c/Documents/projects/p2/media/a.mov", "file:///c/tmp/a.mov", "", "media/a.mov"]) expect(rebaseUri(uri, "p1", NOW)).toBe(uri);
  });
  test("an id is text, not a pattern", () => expect(rebaseUri("file:///c/projects/pX1/media/a.mov", "p.1", NOW)).toBe("file:///c/projects/pX1/media/a.mov"));
});

describe("rebaseProject", () => {
  const at = (root: string): Project => ({ ...makeProject({ id: "p1" }),
    clips: [makeClip({ id: "c1", sourceDuration: 4, sourceUri: `${root}/media/c1.mov` }), makeClip({ id: "c2", sourceDuration: 4, sourceUri: `${root}/media/c1.mov` })],
    layers: [makeLayer({ id: "l1", sourceDuration: 4, sourceUri: `${root}/media/l1.mov` })],
    audioTracks: [makeAudioTrack({ id: "a1", sourceUri: `${root}/media/speech-o1-x.caf`, sourceDuration: 2 })] });

  test("nothing moved: THE SAME OBJECT comes back", () => { const p = at(NOW); expect(rebaseProject(p, NOW)).toBe(p); });
  test("a trailing slash on the folder changes nothing", () => { const p = at(NOW); expect(rebaseProject(p, `${NOW}/`)).toBe(p); });
  test("moved: clips, layers and sounds all point at today's folder; everything else is the same", () => {
    const p = at(OLD), r = rebaseProject(p, NOW);
    expect(r).toEqual(at(NOW));
    expect(r.overlays).toBe(p.overlays);
    expect(p.clips[0].sourceUri).toBe(`${OLD}/media/c1.mov`);   // the input is not changed
  });
  test("idempotent", () => { const once = rebaseProject(at(OLD), NOW); expect(rebaseProject(once, NOW)).toBe(once); });
  test("a list with nothing to move keeps its identity", () => {
    const p = { ...at(NOW), clips: at(OLD).clips }, r = rebaseProject(p, NOW);
    expect(r.layers).toBe(p.layers); expect(r.audioTracks).toBe(p.audioTracks); expect(r.clips).not.toBe(p.clips);
  });
});

describe("storage after the container has moved", () => {
  async function moved() {
    const fs = memoryFs();
    let n = 0;
    const storage = makeStorage(fs, { thumbnail: async () => "file:///tmp/t.jpg", newId: () => `n${++n}`, nowIso: () => "2026-10-13T10:00:00.000Z" });
    const was = "file:///old/AAAA/Documents/projects/p1", dir = "file:///doc/projects/p1";
    const project: Project = { ...makeProject({ id: "p1", name: "Beach" }), clips: [makeClip({ id: "c1", sourceDuration: 4, sourceUri: `${was}/media/c1.mov` })], audioTracks: [makeAudioTrack({ id: "a1", sourceUri: `${was}/media/a1.m4a`, sourceDuration: 2 })] };
    fs.files.set(`${dir}/project.json`, JSON.stringify(project));
    fs.files.set(`${dir}/media/c1.mov`, "V"); fs.files.set(`${dir}/media/a1.m4a`, "S");
    return { fs, storage, dir, text: JSON.stringify(project) };
  }
  test("it opens with every file found, and the file on disk is not rewritten", async () => {
    const { fs, storage, dir, text } = await moved();
    const { project, missingSourceUris } = await storage.loadProject("p1");
    expect(project.clips[0].sourceUri).toBe(`${dir}/media/c1.mov`);
    expect(project.audioTracks[0].sourceUri).toBe(`${dir}/media/a1.m4a`);
    expect(missingSourceUris).toEqual([]);
    expect(fs.files.get(`${dir}/project.json`)).toBe(text);
    expect((await storage.listProjects()).map((p) => p.broken)).toEqual([false]);
    expect(fs.files.get(`${dir}/project.json`)).toBe(text);
  });
  test("the next ordinary save writes today's references", async () => {
    const { fs, storage, dir } = await moved();
    await storage.renameProject("p1", "Beach 2");
    expect(JSON.parse(fs.files.get(`${dir}/project.json`)!).clips[0].sourceUri).toBe(`${dir}/media/c1.mov`);
  });
  test("Duplicate works after a move", async () => {
    const { fs, storage } = await moved();
    const copy = await storage.duplicateProject("p1");
    expect(copy.clips[0].sourceUri).toBe(`file:///doc/projects/${copy.id}/media/c1.mov`);
    expect(fs.files.get(copy.clips[0].sourceUri)).toBe("V");
  });
});
