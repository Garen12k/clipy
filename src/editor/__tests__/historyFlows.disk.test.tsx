// "Is Undo there when the project is opened again?" — the four common flows, and the pairs of saves that meet on the way.
// The REAL hooks (useAutosave + useLoadProject), the real keeper and the real storage, on the fake fs with the phone's move
// (queued, destination removed first). Only the disk is asked at the end: a fresh loadProject and its loadHistory.
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { AppState, type AppStateStatus } from "react-native";
jest.mock("@/src/projects", () => {
  const { memoryFs } = jest.requireActual("@/src/projects/fs");
  const { makeStorage } = jest.requireActual("@/src/projects/storage");
  const mockFs = memoryFs();
  let n = 0;
  return { mockFs, storage: makeStorage(mockFs, { thumbnail: async () => "file:///tmp/t.jpg", newId: () => `id${++n}`, nowIso: () => "2026-10-13T10:00:00.000Z" }) };
});
import { makeProject, type Project } from "@/src/editor/model/types";
import type { memoryFs } from "@/src/projects/fs";
import { stampOf } from "@/src/projects/history";
import type { Storage } from "@/src/projects/storage";
import * as projects from "@/src/projects";
import { useEditorStore } from "@/src/editor/store";
import { lastFlush } from "../flush";
import { forgetHistory, HISTORY_READ_DELAY_MS } from "../historyKeeper";
import { useAutosave } from "../useAutosave";
import { useLoadProject } from "../useLoadProject";

const storage = projects.storage as unknown as Storage;
const fs = (projects as unknown as { mockFs: ReturnType<typeof memoryFs> }).mockFs;
const DIR = `${fs.documentDir}projects/p1`;
const JSON_PATH = `${DIR}/project.json`, HISTORY_PATH = `${DIR}/history.jsonl`;
const AUTOSAVE_MS = 10;
const st = () => useEditorStore.getState();
const save = (p: Project) => storage.saveProject(p);
const rename = (name: string) => (p: Project): Project => ({ ...p, name });
const realMove = fs.move, realWrite = fs.writeText;
const diskName = () => { const t = fs.files.get(JSON_PATH); return t === undefined ? null : (JSON.parse(t) as Project).name; };

let onAppState: ((now: AppStateStatus) => void) | null;
let warn: jest.SpyInstance;
beforeEach(async () => {
  warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  onAppState = null;
  jest.spyOn(AppState, "addEventListener").mockImplementation(((_type: string, handler: (now: AppStateStatus) => void) => { onAppState = handler; return { remove: () => { onAppState = null; } }; }) as never);
  fs.move = realMove; fs.writeText = realWrite;
  fs.files.clear(); fs.dirs.clear();
  forgetHistory(); st().reset();
  await storage.saveProject(makeProject({ id: "p1", name: "Zero" }));
});
afterEach(() => { jest.restoreAllMocks(); });

async function openEditor() {
  const view = await renderHook(() => { useAutosave(save, AUTOSAVE_MS); return useLoadProject("p1"); });
  await waitFor(() => expect(view.result.current.status).toBe("ready"));
  return view;
}
const edit = (name: string) => act(() => st().apply(rename(name)));
/** The autosave has written what the store holds. */
const autosaved = () => waitFor(() => { expect(st().dirty).toBe(false); expect(fs.files.get(JSON_PATH)).toBe(JSON.stringify(st().project)); });
/** The app stops being active and every write that started has ended; then it is active again. */
const away = async (now: AppStateStatus = "inactive") => { await act(async () => { onAppState!(now); }); await idle(); };
const back = () => act(async () => { onAppState!("active"); });
const idle = async () => { await act(async () => { await storage.loadProject("p1").catch(() => {}); for (let i = 0; i < 20; i++) await Promise.resolve(); }); };
const leave = async (view: { unmount: () => void }) => { await act(() => view.unmount()); await lastFlush; await idle(); };
/** The app is ended where it stands (swiped away in the app switcher, or ended by iOS in the background): nothing more is written. */
const killed = async (view: { unmount: () => void }) => {
  await idle();
  const files = new Map(fs.files);
  await act(() => view.unmount());
  await lastFlush; await idle();
  fs.files.clear();
  for (const [k, v] of files) fs.files.set(k, v);
};
/** What the next opening finds on the disk — asked of the storage alone. */
async function reopened() {
  const { project, stamp } = await storage.loadProject("p1");
  const h = await storage.loadHistory(project, stamp, async () => {});
  return { name: project.name, undo: h ? h.past.map((p) => p.name) : [], redo: h ? h.future.map((p) => p.name) : [] };
}
/** The history file belongs to the project file beside it. */
const paired = () => { expect(JSON.parse(fs.files.get(HISTORY_PATH)!.split("\n")[0]).stamp).toBe(stampOf(fs.files.get(JSON_PATH)!)); };
/** The phone's queue is busy (thumbnails): every move waits until `open()`. */
function holdMoves() {
  let open!: () => void;
  const gate = new Promise<void>((r) => { open = r; });
  fs.move = async (from, to) => { await gate; return realMove(from, to); };
  return open;
}

describe("flow 1 — edit, back to Home, open again", () => {
  test("left at once, before the autosave: the three steps are there, and Undo / Redo walk them in the opened editor", async () => {
    const view = await openEditor();
    await edit("One"); await edit("Two"); await edit("Three");
    await leave(view);
    paired();
    expect(await reopened()).toEqual({ name: "Three", undo: ["Zero", "One", "Two"], redo: [] });

    const again = await openEditor();
    expect(st().past).toEqual([]);                                     // on screen first…
    await waitFor(() => expect(st().past).toHaveLength(3), { timeout: HISTORY_READ_DELAY_MS + 2000 });   // …the steps a moment later
    await act(() => { st().undo(); st().undo(); st().undo(); });
    expect(st().project!.name).toBe("Zero");
    await act(() => { st().redo(); st().redo(); st().redo(); });
    expect(st().project!.name).toBe("Three");
    await leave(again);
    expect(await reopened()).toEqual({ name: "Three", undo: ["Zero", "One", "Two"], redo: [] });
    expect(warn).not.toHaveBeenCalled();
  });

  test("left after the autosave had already written the project (nothing dirty): the project is written again so that the history is its own", async () => {
    const view = await openEditor();
    await edit("One");
    await autosaved();
    expect(fs.files.has(HISTORY_PATH)).toBe(false);                    // the autosave never writes a history
    await leave(view);
    paired();
    expect(await reopened()).toEqual({ name: "One", undo: ["Zero"], redo: [] });
  });

  test("left while the autosave's move is still waiting in the phone's queue: the project is there, and so is Undo", async () => {
    const view = await openEditor();
    const open = holdMoves();
    await edit("One");
    await waitFor(() => expect(fs.files.has(`${JSON_PATH}.tmp`)).toBe(true));   // the autosave wrote; its move waits
    await edit("Two");
    await act(() => view.unmount());
    await act(async () => { open(); });
    await lastFlush; await idle();
    paired();
    expect(await reopened()).toEqual({ name: "Two", undo: ["Zero", "One"], redo: [] });
    expect([...fs.files.keys()].filter((f) => f.endsWith(".tmp"))).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  test("undone steps come back as Redo", async () => {
    const view = await openEditor();
    await edit("One"); await edit("Two");
    await act(() => { st().undo(); });
    await autosaved();
    await leave(view);
    expect(await reopened()).toEqual({ name: "One", undo: ["Zero"], redo: ["Two"] });
  });
});

describe("flow 2 — edit, Export, Done, back", () => {
  test("the export settings changed on the Export screen and autosaved (no step, another project.json): the leave writes both again", async () => {
    const view = await openEditor();
    await edit("One");
    await autosaved();
    await act(() => st().setExportSettings({ fps: 60, quality: "high" }));   // the Export screen; the editor stays mounted under it
    await autosaved();
    await leave(view);
    paired();
    expect(await reopened()).toEqual({ name: "One", undo: ["Zero"], redo: [] });
    expect((JSON.parse(fs.files.get(JSON_PATH)!) as Project).exportSettings.fps).toBe(60);
  });

  test("the share sheet took the app away in between (a history was written), then a setting changed and was autosaved: still there", async () => {
    const view = await openEditor();
    await edit("One");
    await away(); await back();
    paired();
    await act(() => st().setExportSettings({ fps: 60, quality: "high" }));
    await autosaved();
    expect(JSON.parse(fs.files.get(HISTORY_PATH)!.split("\n")[0]).stamp).not.toBe(stampOf(fs.files.get(JSON_PATH)!));   // the autosave made it stale…
    await leave(view);
    paired();                                                                 // …and the leave made it right
    expect(await reopened()).toEqual({ name: "One", undo: ["Zero"], redo: [] });
  });

  test("nothing changed on the Export screen: nothing is rewritten by the leave, and Undo is there", async () => {
    const view = await openEditor();
    await edit("One");
    await away(); await back();
    const before = [fs.files.get(JSON_PATH), fs.files.get(HISTORY_PATH)];
    const writes: string[] = [];
    fs.writeText = (p, t) => { writes.push(p); return realWrite(p, t); };
    await leave(view);
    expect(writes).toEqual([]);
    expect([fs.files.get(JSON_PATH), fs.files.get(HISTORY_PATH)]).toEqual(before);
    expect(await reopened()).toEqual({ name: "One", undo: ["Zero"], redo: [] });
  });
});

describe("flow 3 — edit, background, return, edit more, back", () => {
  test("both sessions' steps are there", async () => {
    const view = await openEditor();
    await edit("One");
    await away("inactive"); await away("background");
    paired();
    await back();
    await edit("Two");
    await autosaved();                                                        // the history on disk is now of an older project.json
    await leave(view);
    paired();
    expect(await reopened()).toEqual({ name: "Two", undo: ["Zero", "One"], redo: [] });
    expect(warn).not.toHaveBeenCalled();
  });

  test("swiped away in the app switcher (the inactive write is the last one): the steps are there", async () => {
    const view = await openEditor();
    await edit("One"); await edit("Two");
    await away("inactive");
    await killed(view);
    paired();
    expect(await reopened()).toEqual({ name: "Two", undo: ["Zero", "One"], redo: [] });
  });

  test("returned, edited more, went to the background again and was ended there: every step is there", async () => {
    const view = await openEditor();
    await edit("One");
    await away(); await back();
    await edit("Two");
    await autosaved();
    await away("inactive"); await away("background");
    await killed(view);
    paired();
    expect(await reopened()).toEqual({ name: "Two", undo: ["Zero", "One"], redo: [] });
  });

  test("a CRASH after an autosave, with no leave and no trip to the background since: the project is whole and the history is dropped (as designed)", async () => {
    const view = await openEditor();
    await edit("One");
    await away(); await back();
    await edit("Two");
    await autosaved();
    await killed(view);
    expect(await reopened()).toEqual({ name: "Two", undo: [], redo: [] });
  });

  test("the app switcher while the autosave's move is still queued (the pair that could once delete project.json): both land, in order", async () => {
    const view = await openEditor();
    const open = holdMoves();
    await edit("One");
    await waitFor(() => expect(fs.files.has(`${JSON_PATH}.tmp`)).toBe(true));   // the autosave wrote; its move waits
    await act(async () => { onAppState!("inactive"); });                        // the keeper's pair joins the chain
    await act(async () => { open(); });
    await idle();
    expect(diskName()).toBe("One");
    paired();
    await killed(view);
    expect(await reopened()).toEqual({ name: "One", undo: ["Zero"], redo: [] });
    expect(warn).not.toHaveBeenCalled();
  });

  test("an edit, the app switcher, another edit and the app switcher again before the first write has ended: written whole one after the other, the last one's on disk", async () => {
    const view = await openEditor();
    const open = holdMoves();
    const log: string[] = [];
    fs.writeText = (p, t) => { log.push(p.endsWith("project.json.tmp") ? `project ${(JSON.parse(t) as Project).name}` : "history"); return realWrite(p, t); };
    await edit("One");
    await act(async () => { onAppState!("inactive"); });
    await edit("Two");
    await act(async () => { onAppState!("inactive"); });
    expect(log).toEqual(["project One"]);                                       // the second waits for the whole of the first
    await act(async () => { open(); });
    await idle();
    expect(log.slice(0, 4)).toEqual(["project One", "history", "project Two", "history"]);
    paired();
    await killed(view);
    expect(await reopened()).toEqual({ name: "Two", undo: ["Zero", "One"], redo: [] });
  });

  test("the editor is left while the app-switcher write is still on its way: the leave's pair lands after it, and the history is the leave's", async () => {
    const view = await openEditor();
    const open = holdMoves();
    await edit("One");
    await act(async () => { onAppState!("inactive"); });
    await edit("Two");
    await act(() => view.unmount());
    await act(async () => { open(); });
    await lastFlush; await idle();
    paired();
    expect(await reopened()).toEqual({ name: "Two", undo: ["Zero", "One"], redo: [] });
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("flow 4 — edit, Post", () => {
  const record = { platform: "youtube" as const, url: null, postedAt: "2026-10-13T10:00:00.000Z" };

  test("the post is recorded in the project and autosaved (no step, another project.json), then back: Undo is there and so is the record", async () => {
    const view = await openEditor();
    await edit("One");
    await autosaved();
    await act(() => st().addPostRecord(record));
    await autosaved();
    await leave(view);
    paired();
    expect(await reopened()).toEqual({ name: "One", undo: ["Zero"], redo: [] });
    expect((JSON.parse(fs.files.get(JSON_PATH)!) as Project).posts).toHaveLength(1);
  });

  test("the trip to the browser to connect (a history is written), the post recorded after it and autosaved, then back: still there", async () => {
    const view = await openEditor();
    await edit("One");
    await away("inactive"); await away("background"); await back();
    await act(() => st().addPostRecord(record));
    await autosaved();
    await leave(view);
    paired();
    expect(await reopened()).toEqual({ name: "One", undo: ["Zero"], redo: [] });
  });

  test("posted, then the app is put away and ended without going back to the editor's Home: there", async () => {
    const view = await openEditor();
    await edit("One");
    await act(() => st().addPostRecord(record));
    await autosaved();
    await away("inactive"); await away("background");
    await killed(view);
    paired();
    expect(await reopened()).toEqual({ name: "One", undo: ["Zero"], redo: [] });
    expect((JSON.parse(fs.files.get(JSON_PATH)!) as Project).posts).toHaveLength(1);
  });
});

describe("what drops it, and what cannot be written", () => {
  test("renamed on Home after leaving: the project is the renamed one, with no steps", async () => {
    const view = await openEditor();
    await edit("One");
    await leave(view);
    await storage.renameProject("p1", "Holiday");
    expect(await reopened()).toEqual({ name: "Holiday", undo: [], redo: [] });
  });

  test("a history that cannot be written on leave: the project is saved all the same, nothing is said, the cover is asked for", async () => {
    const view = await openEditor();
    await edit("One");
    fs.writeText = (p, t) => (p.endsWith("history.jsonl.tmp") ? Promise.reject(new Error("disk full")) : realWrite(p, t));
    const cover = jest.spyOn(storage, "writeCover");
    await leave(view);
    expect(diskName()).toBe("One");
    expect(cover).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls.map((c) => c[0])).toEqual(["history save failed"]);
    expect(await reopened()).toEqual({ name: "One", undo: [], redo: [] });
  });

  test("the project deleted on Home the moment the editor is left: the leave's pair writes nothing back", async () => {
    const view = await openEditor();
    const open = holdMoves();
    await edit("One");
    await act(() => view.unmount());
    const gone = storage.deleteProject("p1");
    await act(async () => { open(); });
    await lastFlush; await gone;
    await act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); });
    expect([...fs.files.keys(), ...fs.dirs].filter((p) => p.startsWith(DIR))).toEqual([]);
  });
});
