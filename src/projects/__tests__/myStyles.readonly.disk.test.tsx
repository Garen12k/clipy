// Save as Style only READS the project: on the realistic fake files (the phone's queued move, fs.ts) the project's folder is the
// same byte for byte after a style is saved from it, renamed and deleted — and the style is read in the project's turn, so a
// save still queued is in it. A user style whose own song is gone makes nothing (createQuick asks for the file first).
import { act, renderHook } from "@testing-library/react-native";

jest.mock("expo-router", () => ({ router: { push: jest.fn() }, useFocusEffect: jest.fn() }));
jest.mock("@/src/projects", () => {
  const fs = require("@/src/projects/fs").memoryFs();
  let n = 0;
  const storage = require("@/src/projects/storage").makeStorage(fs, { thumbnail: async () => "file:///tmp/t.jpg", newId: () => `id${++n}`, nowIso: () => "2026-10-16T10:00:00.000Z" });
  return { storage, mockFs: fs };
});
jest.mock("@/src/projects/myStyles", () => {
  let n = 0;
  return { myStyles: require("@/src/projects/styleStore").makeStyleStore(require("@/src/projects").mockFs, { newId: () => `style${++n}`, nowIso: () => "2026-10-16T12:00:00.000Z" }) };
});

import { makeAudioTrack, makeClip, makeOverlay, makeProject, type Project } from "@/src/editor/model/types";
import * as projects from "@/src/projects";
import type { memoryFs } from "@/src/projects/fs";
import { myStyles } from "@/src/projects/myStyles";
import { useProjects } from "@/src/projects/useProjects";
import { STYLE_WORDS, useUserStyles } from "@/src/projects/useUserStyles";
import { useToast } from "@/src/ui/Toast";

const fs = (projects as unknown as { mockFs: ReturnType<typeof memoryFs> }).mockFs;
const { storage } = projects;
const DIR = "file:///doc/projects/p1";
const SONG = `${DIR}/media/song.m4a`;
const project = (filter: "vivid" | "mono"): Project => makeProject({ id: "p1", name: "Beach day",
  clips: [makeClip({ id: "c", sourceUri: `${DIR}/media/a.jpg`, sourceDuration: 5, filter, filterIntensity: 0.7 })],
  overlays: [makeOverlay({ id: "t", text: "Sun!", start: 0 })],
  audioTracks: [makeAudioTrack({ id: "m", title: "My song", sourceUri: SONG, sourceDuration: 30 })] });
/** Everything under projects/, as it is now. */
const folder = () => new Map([...fs.files].filter(([k]) => k.startsWith("file:///doc/projects/")));
let warn: jest.SpyInstance;

beforeEach(async () => {
  warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  useToast.getState().clear();
  fs.files.set(SONG, "ID3-song-bytes");
  fs.files.set(`${DIR}/media/a.jpg`, "jpg-bytes");
  fs.files.set(`${DIR}/thumb.jpg`, "thumb");
  await storage.saveProject(project("vivid"));
});
afterEach(() => warn.mockRestore());

test("saving, renaming and deleting a style leaves the project's files byte for byte; a queued save is in the style", async () => {
  const before = folder();
  const { result } = await renderHook(() => useUserStyles());
  let ok = false;
  await act(async () => { ok = await result.current.save("p1", "Summer"); });
  expect(ok).toBe(true);
  expect(folder()).toEqual(before);
  const read = await myStyles.list();
  expect(read.status === "ok" && read.styles[0]).toMatchObject({ name: "Summer", filter: "vivid", music: { kind: "own", file: "style1.m4a", title: "My song" } });
  expect(fs.files.get("file:///doc/styles/media/style1.m4a")).toBe("ID3-song-bytes");
  await act(async () => { await result.current.rename("style1", "Sea"); });
  await act(async () => { await result.current.remove("style1"); });
  expect(result.current.mine).toEqual([]);
  expect(folder()).toEqual(before);
  expect(fs.files.has(SONG)).toBe(true);

  // An edit saved but still on its way: the style is read after it.
  const queued = storage.saveProject(project("mono"));
  await act(async () => { await result.current.save("p1", "Grey"); });
  await queued;
  const again = await myStyles.list();
  expect(again.status === "ok" && again.styles[0]).toMatchObject({ name: "Grey", filter: "mono" });
  await myStyles.remove("style2");
});

test("Quick Edit with a style whose own song is gone: the sentence, and no project made", async () => {
  const { result: styles } = await renderHook(() => useUserStyles());
  await act(async () => { await styles.current.save("p1", "Mine"); });
  const read = await myStyles.list();
  const style = read.status === "ok" ? read.styles[0] : null;
  fs.files.delete(`file:///doc/styles/media/${style!.music!.kind === "own" ? style!.music!.file : ""}`);
  const listed = (await storage.listProjects()).map((p: { id: string }) => p.id);
  const { result } = await renderHook(() => useProjects());
  let id: string | null = "x";
  await act(async () => { id = await result.current.createQuick([{ uri: "file:///a.jpg", kind: "photo", durationSec: 0, width: 3, height: 4 }], style!); });
  expect(id).toBeNull();
  expect(useToast.getState().message).toBe(STYLE_WORDS.musicGone);
  expect((await storage.listProjects()).map((p: { id: string }) => p.id)).toEqual(listed);
  await myStyles.remove(style!.id);
});
