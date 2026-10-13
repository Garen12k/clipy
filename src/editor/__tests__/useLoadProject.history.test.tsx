import { act, renderHook, waitFor } from "@testing-library/react-native";
import { AppState, type AppStateStatus } from "react-native";
jest.mock("@/src/projects", () => ({ storage: { loadProject: jest.fn(), saveProject: jest.fn(), writeCover: jest.fn(), loadHistory: jest.fn(), saveHistory: jest.fn(), saveWithHistory: jest.fn() } }));
import { storage } from "@/src/projects";
import { lastFlush } from "../flush";
import { forgetHistory } from "../historyKeeper";
import { makeProject, type Project } from "../model/types";
import { useEditorStore } from "../store";
import { useLoadProject } from "../useLoadProject";

const st = () => useEditorStore.getState();
const m = storage as unknown as Record<"loadProject" | "saveProject" | "writeCover" | "loadHistory" | "saveHistory" | "saveWithHistory", jest.Mock>;
const named = (name: string): Project => makeProject({ id: "p1", name });
const rename = (name: string) => (p: Project): Project => ({ ...p, name });
let order: string[];
let onAppState: ((now: AppStateStatus) => void) | null;
let removed: jest.Mock;
let warn: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  forgetHistory(); st().reset();
  order = [];
  m.saveProject.mockImplementation(async () => { order.push("project"); });
  m.saveHistory.mockImplementation(async () => { order.push("history"); return true; });
  m.writeCover.mockImplementation(async () => { order.push("cover"); });
  // The storage's contract for the pair, over the two mocks: the project first; its history only when that save has landed; `kept` never rejects.
  m.saveWithHistory.mockImplementation((p: Project, past: Project[], future: Project[]) => {
    const saved = m.saveProject(p) as Promise<void>;
    return { saved, kept: saved.then(() => m.saveHistory(p, past, future) as Promise<boolean>, () => false) };
  });
  m.loadHistory.mockResolvedValue(null);
  onAppState = null; removed = jest.fn();
  jest.spyOn(AppState, "addEventListener").mockImplementation(((_type: string, handler: (now: AppStateStatus) => void) => { onAppState = handler; return { remove: removed }; }) as never);
  warn = jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { jest.restoreAllMocks(); });

async function open(project = named("Two"), stamp: string | undefined = "stamp-1") {
  m.loadProject.mockResolvedValueOnce({ project, missingSourceUris: [], stamp });
  const hook = await renderHook(() => useLoadProject("p1"));
  await waitFor(() => expect(hook.result.current.status).toBe("ready"));
  return hook;
}

test("opening gives the history back a moment later; the editor is ready before it is read", async () => {
  m.loadHistory.mockResolvedValue({ past: [named("Zero"), named("One")], future: [] });
  await open();
  expect(st().project?.name).toBe("Two");
  expect(m.loadHistory).not.toHaveBeenCalled();                      // ready first, the history after the delay
  await waitFor(() => expect(st().past).toHaveLength(2));
  expect(m.loadHistory).toHaveBeenCalledWith(st().project, "stamp-1");
  expect(st().dirty).toBe(false);
});

test("leaving after an edit: the project, then its history, then the cover — all inside lastFlush", async () => {
  const { unmount } = await open();
  await act(() => st().apply(rename("Edited")));
  const { project, past, future } = st();
  await act(() => unmount());
  await lastFlush;
  expect(order).toEqual(["project", "history", "cover"]);
  expect(m.saveHistory).toHaveBeenCalledWith(project, past, future);
  expect(st().project).toBeNull();
});

test("leaving an untouched project writes nothing but the cover — with or without a restored history", async () => {
  const first = await open();
  await act(() => first.unmount());
  await lastFlush;
  expect(order).toEqual(["cover"]);

  order = [];
  m.loadHistory.mockResolvedValue({ past: [named("Zero")], future: [] });
  const second = await open();
  await waitFor(() => expect(st().past).toHaveLength(1));
  await act(() => second.unmount());
  await lastFlush;
  expect(order).toEqual(["cover"]);
});

test("a step without a change (a drag that moved nothing) still writes: the project is saved though it is not dirty", async () => {
  const { unmount } = await open();
  await act(() => st().beginTransaction());
  expect(st().dirty).toBe(false);
  await act(() => unmount());
  await lastFlush;
  expect(order).toEqual(["project", "history", "cover"]);
});

test("a restored history is written again when only the project changed under it (export settings)", async () => {
  m.loadHistory.mockResolvedValue({ past: [named("Zero")], future: [] });
  const { unmount } = await open();
  await waitFor(() => expect(st().past).toHaveLength(1));
  await act(() => st().setExportSettings({ fps: 60, quality: "high" }));
  await act(() => unmount());
  await lastFlush;
  expect(order).toEqual(["project", "history", "cover"]);
});

test("a project save that fails on leave writes no history", async () => {
  m.saveProject.mockRejectedValueOnce(new Error("disk full"));
  const { unmount } = await open();
  await act(() => st().apply(rename("Edited")));
  await act(() => unmount());
  await expect(lastFlush).resolves.toBeUndefined();
  expect(m.saveHistory).not.toHaveBeenCalled();
  expect(warn).toHaveBeenCalledWith("flush save failed", expect.any(Error));
});

test("the app stops being active: the project and its history are written; coming back writes nothing", async () => {
  const { unmount } = await open();
  expect(onAppState).not.toBeNull();
  await act(() => st().apply(rename("Edited")));
  await act(async () => { onAppState!("active"); });
  expect(order).toEqual([]);
  await act(async () => { onAppState!("inactive"); });
  await waitFor(() => expect(order).toEqual(["project", "history"]));
  await act(async () => { onAppState!("background"); });               // nothing changed since: nothing more
  expect(order).toEqual(["project", "history"]);
  await act(() => unmount());
  await lastFlush;
  expect(removed).toHaveBeenCalledTimes(1);
  expect(order).toEqual(["project", "history", "cover"]);              // already written: the leave adds only the cover
});

test("leaving cancels a history that has not arrived yet", async () => {
  m.loadHistory.mockResolvedValue({ past: [named("Zero")], future: [] });
  const { unmount } = await open();
  await act(() => unmount());
  await new Promise((r) => setTimeout(r, 500));
  expect(m.loadHistory).not.toHaveBeenCalled();
  expect(st().past).toEqual([]);
});

// —— Added to the plan's tests ——

test("a history that answers late, for a project that is no longer the open one, lands nowhere", async () => {
  let answer!: (v: unknown) => void;
  m.loadHistory.mockReturnValueOnce(new Promise((r) => { answer = r; }));
  const first = await open(named("First"), "stamp-a");
  await waitFor(() => expect(m.loadHistory).toHaveBeenCalledTimes(1));   // A's history is being read
  await act(() => first.unmount());
  await lastFlush;

  const second = makeProject({ id: "p2", name: "Second" });
  m.loadProject.mockResolvedValueOnce({ project: second, missingSourceUris: [], stamp: "stamp-b" });
  const hook = await renderHook(() => useLoadProject("p2"));
  await waitFor(() => expect(hook.result.current.status).toBe("ready"));
  await act(async () => { answer({ past: [named("Zero")], future: [named("Three")] }); });
  await waitFor(() => expect(m.loadHistory).toHaveBeenCalledTimes(2));   // B's own read (nothing kept)
  expect(m.loadHistory).toHaveBeenLastCalledWith(st().project, "stamp-b");
  expect(st().project?.id).toBe("p2");
  expect([st().past, st().future]).toEqual([[], []]);
  await act(() => hook.unmount());
  await lastFlush;
  expect(m.saveHistory).not.toHaveBeenCalled();                          // and nothing of A is ever written beside B
});

test("the same route given another project id: the first one's answer is dropped too", async () => {
  let answer!: (v: unknown) => void;
  m.loadHistory.mockReturnValueOnce(new Promise((r) => { answer = r; }));
  m.loadProject.mockResolvedValueOnce({ project: named("First"), missingSourceUris: [], stamp: "stamp-a" });
  const hook = await renderHook(({ id }: { id: string }) => useLoadProject(id), { initialProps: { id: "p1" } });
  await waitFor(() => expect(m.loadHistory).toHaveBeenCalledTimes(1));
  const second = makeProject({ id: "p2", name: "Second" });
  m.loadProject.mockResolvedValueOnce({ project: second, missingSourceUris: [], stamp: "stamp-b" });
  await hook.rerender({ id: "p2" });
  await waitFor(() => expect(st().project).toBe(second));
  await act(async () => { answer({ past: [named("Zero")], future: [] }); });
  expect(st().past).toEqual([]);
  await act(() => hook.unmount());
});

test("Undo lights up in ONE render when the history lands — not one per step", async () => {
  m.loadHistory.mockResolvedValue({ past: Array.from({ length: 30 }, (_, i) => named(`p${i}`)), future: [named("Three")] });
  await open();
  let renders = 0;
  // TransportRow's own two selectors.
  const bar = await renderHook(() => { renders += 1; return [useEditorStore((s) => s.past.length > 0), useEditorStore((s) => s.future.length > 0)]; });
  expect(bar.result.current).toEqual([false, false]);
  const before = renders;
  await waitFor(() => expect(bar.result.current).toEqual([true, true]));
  expect(renders - before).toBe(1);
  expect(st().past).toHaveLength(30);
});

test("the editor is left while the app-inactive write is on its way: the leave asks for its own pair at once — the storage's chain orders them (pinned on the real storage)", async () => {
  const { unmount } = await open();
  await act(() => st().apply(rename("Edited")));
  const { project, past, future } = st();
  let saved!: () => void;
  m.saveProject.mockImplementationOnce(() => { order.push("project>"); return new Promise<void>((r) => { saved = () => { order.push("project<"); r(); }; }); });
  await act(async () => { onAppState!("inactive"); });
  expect(order).toEqual(["project>"]);
  await act(() => unmount());
  expect(m.saveWithHistory).toHaveBeenCalledTimes(2);                   // in the cleanup itself, as the leave's save always was
  expect(m.saveWithHistory).toHaveBeenLastCalledWith(project, past, future);
  await lastFlush;                                                      // the leave's own three, whatever becomes of the other write
  expect(order).toEqual(["project>", "project", "history", "cover"]);
  await act(async () => { saved(); });
  expect(order).toEqual(["project>", "project", "history", "cover", "project<", "history"]);
});

test("leaving asks the storage for the pair in ONE call; a project with no step to keep is saved alone", async () => {
  m.saveWithHistory.mockImplementation(() => { order.push("pair"); return { saved: Promise.resolve(), kept: Promise.resolve(true) }; });
  const first = await open();
  await act(() => st().apply(rename("Edited")));
  await act(() => first.unmount());
  await lastFlush;
  expect(order).toEqual(["pair", "cover"]);

  order = [];
  const second = await open();
  await act(() => st().setExportSettings({ fps: 60, quality: "high" }));   // dirty, but no step
  await act(() => second.unmount());
  await lastFlush;
  expect(order).toEqual(["project", "cover"]);
});

test("an empty text dropped on leave changes what is saved: the history is written again beside THAT project, though the stacks were already kept", async () => {
  const { makeClip, makeOverlay } = jest.requireActual("../model/types") as typeof import("../model/types");
  const { openStrip, closeStrip } = jest.requireActual("../toolStrip") as typeof import("../toolStrip");
  const { unmount } = await open(makeProject({ id: "p1", name: "Two", clips: [makeClip({ id: "a", sourceDuration: 10 })] }));
  await act(() => { st().apply((p) => ({ ...p, overlays: [makeOverlay({ id: "new", text: "" })] })); st().selectOverlay("new"); openStrip("text"); });
  await act(async () => { onAppState!("inactive"); });                  // the app switcher, with the text panel open
  await waitFor(() => expect(order).toEqual(["project", "history"]));
  const { past, future } = st();
  await act(() => unmount());
  await lastFlush;
  closeStrip();
  expect(order).toEqual(["project", "history", "project", "history", "cover"]);
  const written = m.saveHistory.mock.calls[1] as [Project, Project[], Project[]];
  expect(written[0].overlays).toEqual([]);                              // the project that was saved, without the empty text
  expect(written[0]).toBe(m.saveProject.mock.calls[1][0]);
  expect([written[1], written[2]]).toEqual([past, future]);
});

test("a write when the app stops being active changes nothing the editor shows: a recording, the selection, the stacks", async () => {
  const { unmount } = await open(makeProject({ id: "p1", name: "Two" }));
  await act(() => { st().apply(rename("Edited")); st().setRecording(true); st().seek(0); });
  const before = st();
  await act(async () => { onAppState!("inactive"); });
  await waitFor(() => expect(order).toEqual(["project", "history"]));
  const after = st();
  expect(after.recording).toBe(true);
  expect(after.project).toBe(before.project);
  expect(after.past).toBe(before.past);                                 // the same arrays: the message bar is not sent away
  expect(after.future).toBe(before.future);
  expect(after.dirty).toBe(false);
  await act(() => unmount());
});

test("a history write that fails on leave is silent: the cover is still written and the leave ends", async () => {
  m.saveHistory.mockImplementation(async () => { order.push("history"); return false; });
  const { unmount } = await open();
  await act(() => st().apply(rename("Edited")));
  await act(() => unmount());
  await expect(lastFlush).resolves.toBeUndefined();
  expect(order).toEqual(["project", "history", "cover"]);
  expect(warn).not.toHaveBeenCalled();
});

test("a cover that never comes (it waits for a thumbnail) holds no later write up", async () => {
  m.writeCover.mockImplementationOnce(() => { order.push("cover>"); return new Promise<void>(() => {}); });
  const first = await open();
  await act(() => first.unmount());
  await waitFor(() => expect(order).toEqual(["cover>"]));
  const second = await open();
  await act(() => st().apply(rename("Edited")));
  await act(async () => { onAppState!("inactive"); });
  await waitFor(() => expect(order).toEqual(["cover>", "project", "history"]));
  await act(() => second.unmount());
  await lastFlush;
  expect(order).toEqual(["cover>", "project", "history", "cover"]);
});
