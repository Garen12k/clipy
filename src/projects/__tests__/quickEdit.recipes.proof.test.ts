jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-06T12:00:00.000Z" }));
import { makeAudioTrack, makeClip, makePhotoClip, makeProject } from "@/src/editor/model/types";
import { BUNDLED_TRACKS } from "@/src/editor/music";
import { BUNDLED_BEATS } from "@/src/editor/musicBeats";
import { memoryFs } from "../fs";
import { QUICK_RECIPE_IDS, QUICK_RECIPES, buildQuickEdit } from "../quickEdit";
import { makeQuickEdit } from "../quickEditFlow";
import { makeStorage, type PickedAsset } from "../storage";

// PROOF — written before user styles existed (docs/superpowers/specs/2026-10-16-my-styles-design.md §4): what each of the six
// built-in styles makes, byte for byte. NEVER edited and NEVER updated (no `-u`) to make a change pass.

const clips = () => [makePhotoClip({ id: "a" }), makeClip({ id: "b", sourceDuration: 10 }), makePhotoClip({ id: "c" }), makeClip({ id: "d", sourceDuration: 1.3 }), makePhotoClip({ id: "e" })];
const photo = (uri: string): PickedAsset => ({ uri, kind: "photo", durationSec: 0, width: 3024, height: 4032, fileName: "IMG.jpg" });
const video = (uri: string, durationSec: number): PickedAsset => ({ uri, kind: "video", durationSec, width: 1920, height: 1080, fileName: "IMG.mov" });

describe.each(QUICK_RECIPE_IDS)("%s", (id) => {
  const recipe = QUICK_RECIPES[id];
  const song = BUNDLED_TRACKS.find((t) => t.id === recipe.trackId)!;

  test("buildQuickEdit: the draft, as JSON", () => {
    const music = makeAudioTrack({ id: "song", sourceDuration: song.durationSec, title: song.title });
    const draft = buildQuickEdit({ recipe, project: makeProject({ aspectRatio: "auto", clips: clips() }), music, beats: BUNDLED_BEATS[song.id]?.beats ?? [], titleId: "title" });
    expect(JSON.stringify(draft)).toMatchSnapshot();
  });

  test("makeQuickEdit: the project.json it writes, and the calls it makes in order", async () => {
    const fs = memoryFs();
    let n = 0;
    const storage = makeStorage(fs, { thumbnail: async () => { fs.files.set("file:///tmp/t.jpg", "JPEG"); return "file:///tmp/t.jpg"; }, newId: () => `id${++n}`, nowIso: () => "2026-10-06T12:00:00.000Z" });
    fs.files.set("file:///bundled/song.mp3", "MP3");
    for (const f of ["a.jpg", "b.mov", "c.jpg"]) fs.files.set(`file:///picked/${f}`, f);
    const order: string[] = [];
    const assetUri = jest.fn(async () => { order.push("assetUri"); return "file:///bundled/song.mp3"; });
    const spied = { ...storage,
      createProject: (...a: Parameters<typeof storage.createProject>) => { order.push("createProject"); return storage.createProject(...a); },
      importAudio: (...a: Parameters<typeof storage.importAudio>) => { order.push("importAudio"); return storage.importAudio(...a); },
      saveProject: (...a: Parameters<typeof storage.saveProject>) => { order.push("saveProject"); return storage.saveProject(...a); } };
    const made = await makeQuickEdit({ storage: spied, assetUri, newId: () => `id${++n}` }, "Project 1", [photo("file:///picked/a.jpg"), video("file:///picked/b.mov", 20), photo("file:///picked/c.jpg")], id);
    expect(order).toEqual(["assetUri", "createProject", "importAudio", "saveProject"]);
    expect(fs.files.get(`file:///doc/projects/${made.id}/project.json`)).toMatchSnapshot();
  });
});
