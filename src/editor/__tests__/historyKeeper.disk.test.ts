// The keeper on the REAL storage (a memory disk): what is written when the app stops being active is what a later open gets back,
// and it gets nothing back whenever project.json is not the very text the history was written beside.
jest.mock("@/src/projects", () => {
  const { memoryFs } = require("@/src/projects/fs");
  const { makeStorage } = require("@/src/projects/storage");
  const fs = memoryFs();
  let n = 0;
  const storage = makeStorage(fs, { thumbnail: async () => { fs.files.set("file:///tmp/t.jpg", "JPEG"); return "file:///tmp/t.jpg"; }, newId: () => `id${++n}`, nowIso: () => "2026-10-13T10:00:00.000Z" });
  return { storage, mockFs: fs };
});
import * as projects from "@/src/projects";
import type { memoryFs } from "@/src/projects/fs";
import { stampOf } from "@/src/projects/history";
import type { Storage } from "@/src/projects/storage";
import { forgetHistory, HISTORY_READ_DELAY_MS, historyStale, keepHistoryNow, restoreAfterOpen } from "../historyKeeper";
import { SCHEMA_VERSION, type Project } from "../model/types";
import { useEditorStore } from "../store";

const storage = projects.storage as unknown as Storage;
const fs = (projects as unknown as { mockFs: ReturnType<typeof memoryFs> }).mockFs;
const st = () => useEditorStore.getState();
const rename = (name: string) => (p: Project): Project => ({ ...p, name });
const jsonOf = (id: string) => `${storage.projectDir(id)}/project.json`;
const historyOf = (id: string) => `${storage.projectDir(id)}/history.jsonl`;
const header = (id: string) => JSON.parse(fs.files.get(historyOf(id))!.split("\n")[0]) as { stamp: string; schemaVersion: number; past: number; future: number };

/** What the load hook does when the editor opens, up to the moment the history has had its chance. */
async function open(id: string): Promise<Project> {
  const { project, stamp } = await storage.loadProject(id);
  st().setProject(project);
  restoreAfterOpen(project, stamp);
  await jest.advanceTimersByTimeAsync(HISTORY_READ_DELAY_MS + 200);
  return project;
}
/** The app stops being active, and is then swiped away. */
async function quit(): Promise<void> {
  await keepHistoryNow();
  forgetHistory(); st().reset();
}
/** A new project with three edits behind it and one undone, kept: on disk "Two", undo [Beach, One], redo [Three]. */
async function kept(): Promise<string> {
  fs.files.set("file:///picked/a.mov", "A");
  const { project } = await storage.createProject("Beach", [{ uri: "file:///picked/a.mov", kind: "video", durationSec: 4, width: 1080, height: 1920, fileName: "clip.mov" }]);
  await open(project.id);
  st().apply(rename("One")); st().apply(rename("Two")); st().apply(rename("Three")); st().undo();
  await quit();
  return project.id;
}
const stacks = () => ({ past: st().past.map((p) => p.name), future: st().future.map((p) => p.name) });

let warn: jest.SpyInstance;
beforeEach(() => { jest.useFakeTimers(); forgetHistory(); st().reset(); warn = jest.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => { warn.mockRestore(); jest.useRealTimers(); });

test("kept when the app stops being active, back after a restart: undo and redo walk the same steps", async () => {
  const id = await kept();
  // The history's stamp is of the text that is on disk — the very string saveProject wrote.
  expect(header(id)).toMatchObject({ stamp: stampOf(fs.files.get(jsonOf(id))!), schemaVersion: SCHEMA_VERSION, past: 2, future: 1 });
  const opened = await open(id);
  expect(opened.name).toBe("Two");
  expect(stacks()).toEqual({ past: ["Beach", "One"], future: ["Three"] });
  expect(st().dirty).toBe(false);
  expect(historyStale(st())).toBe(false);
  st().undo(); st().undo();
  expect(st().project!.name).toBe("Beach");
  st().redo(); st().redo(); st().redo();
  expect(st().project!.name).toBe("Three");
  expect(warn).not.toHaveBeenCalled();
});

test("an untouched reopen writes nothing: the two files are byte for byte what they were", async () => {
  const id = await kept();
  const before = [fs.files.get(jsonOf(id)), fs.files.get(historyOf(id))];
  await open(id);
  await quit();
  expect([fs.files.get(jsonOf(id)), fs.files.get(historyOf(id))]).toEqual(before);
});

test("project.json rewritten since (renamed on Home): the history is dropped whole, and the project is the renamed one", async () => {
  const id = await kept();
  await storage.renameProject(id, "Holiday");
  const opened = await open(id);
  expect(opened.name).toBe("Holiday");
  expect(stacks()).toEqual({ past: [], future: [] });
  expect(fs.files.has(historyOf(id))).toBe(true);                    // dropped, never deleted: the next write replaces it
  expect(warn).not.toHaveBeenCalled();
});

test("project.json rewritten since (an autosave after the last history write, then a kill): dropped", async () => {
  const id = await kept();
  const { project } = await storage.loadProject(id);
  await storage.saveProject({ ...project, name: "Later" });
  await open(id);
  expect(st().project!.name).toBe("Later");
  expect(stacks()).toEqual({ past: [], future: [] });
});

test("a history from another project format (before a migration): dropped", async () => {
  const id = await kept();
  const lines = fs.files.get(historyOf(id))!.split("\n");
  fs.files.set(historyOf(id), [JSON.stringify({ ...JSON.parse(lines[0]), schemaVersion: SCHEMA_VERSION - 1 }), ...lines.slice(1)].join("\n"));
  await open(id);
  expect(st().project!.name).toBe("Two");
  expect(stacks()).toEqual({ past: [], future: [] });
});

test("a dropped history is replaced by the new session's own steps, which then come back", async () => {
  const id = await kept();
  await storage.renameProject(id, "Holiday");
  await open(id);
  st().apply(rename("Sea"));
  await quit();
  expect(header(id)).toMatchObject({ stamp: stampOf(fs.files.get(jsonOf(id))!), past: 1, future: 0 });
  await open(id);
  expect(st().project!.name).toBe("Sea");
  expect(stacks()).toEqual({ past: ["Holiday"], future: [] });
});

test("an edit in the moment before the history arrives: the old history is given up, the edit is the only step, and the project is the edited one", async () => {
  const id = await kept();
  const { project, stamp } = await storage.loadProject(id);
  st().setProject(project);
  restoreAfterOpen(project, stamp);
  st().apply(rename("Quick"));
  await jest.advanceTimersByTimeAsync(HISTORY_READ_DELAY_MS + 200);
  expect(stacks()).toEqual({ past: ["Two"], future: [] });
  await quit();
  await open(id);
  expect(st().project!.name).toBe("Quick");
  expect(stacks()).toEqual({ past: ["Two"], future: [] });
});
