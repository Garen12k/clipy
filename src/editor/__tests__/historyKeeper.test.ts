jest.mock("@/src/projects", () => ({ storage: { loadHistory: jest.fn(), saveHistory: jest.fn(async () => true), saveProject: jest.fn(async () => {}) } }));
import { storage } from "@/src/projects";
import { forgetHistory, HISTORY_READ_DELAY_MS, historyStale, historyTurn, keepHistoryNow, restoreAfterOpen } from "../historyKeeper";
import { makeProject, type Project } from "../model/types";
import { useEditorStore } from "../store";

const st = () => useEditorStore.getState();
const loadHistory = storage.loadHistory as jest.Mock, saveHistory = storage.saveHistory as jest.Mock, saveProject = storage.saveProject as jest.Mock;
const named = (name: string): Project => makeProject({ id: "p1", name });
const rename = (name: string) => (p: Project): Project => ({ ...p, name });
const wait = () => jest.advanceTimersByTimeAsync(HISTORY_READ_DELAY_MS);
let warn: jest.SpyInstance;
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  loadHistory.mockResolvedValue(null); saveHistory.mockResolvedValue(true); saveProject.mockResolvedValue(undefined);
  forgetHistory(); st().reset();
  warn = jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { warn.mockRestore(); jest.useRealTimers(); });

test("the history is read only after the delay, for the project and the stamp of that open, and lights Undo", async () => {
  const opened = named("Two");
  loadHistory.mockResolvedValue({ past: [named("Zero"), named("One")], future: [named("Three")] });
  st().setProject(opened);
  restoreAfterOpen(opened, "stamp-1");
  await jest.advanceTimersByTimeAsync(HISTORY_READ_DELAY_MS - 1);
  expect(loadHistory).not.toHaveBeenCalled();
  await jest.advanceTimersByTimeAsync(1);
  expect(loadHistory).toHaveBeenCalledWith(opened, "stamp-1");
  expect(st().past.map((p) => p.name)).toEqual(["Zero", "One"]);
  expect(st().future.map((p) => p.name)).toEqual(["Three"]);
  expect(st().dirty).toBe(false);
  expect(historyStale(st())).toBe(false);                            // what is on disk is what is in the store
});

test("no stamp (a load that gave none): nothing is read", async () => {
  const opened = named("Two");
  st().setProject(opened);
  restoreAfterOpen(opened, undefined);
  await wait();
  expect(loadHistory).not.toHaveBeenCalled();
});

test("the editor left before the wait is over, or before the answer: nothing is read, nothing is applied", async () => {
  const opened = named("Two");
  st().setProject(opened);
  restoreAfterOpen(opened, "s");
  forgetHistory();
  await wait();
  expect(loadHistory).not.toHaveBeenCalled();

  let answer!: (v: unknown) => void;
  loadHistory.mockReturnValueOnce(new Promise((r) => { answer = r; }));
  restoreAfterOpen(opened, "s");
  await wait();
  forgetHistory();
  answer({ past: [named("Zero")], future: [] });
  await jest.advanceTimersByTimeAsync(0);
  expect(st().past).toEqual([]);
});

test("another project opened meanwhile: the first wait is dropped", async () => {
  const first = named("First"), second = makeProject({ id: "p2", name: "Second" });
  st().setProject(first);
  restoreAfterOpen(first, "s1");
  st().setProject(second);
  restoreAfterOpen(second, "s2");
  await wait();
  expect(loadHistory).toHaveBeenCalledTimes(1);
  expect(loadHistory).toHaveBeenCalledWith(second, "s2");
});

test("an edit made before the history arrives wins: the history is given up", async () => {
  const opened = named("Two");
  loadHistory.mockResolvedValue({ past: [named("Zero")], future: [] });
  st().setProject(opened);
  restoreAfterOpen(opened, "s");
  st().apply(rename("Edited"));
  await wait();
  expect(st().past).toEqual([opened]);
  expect(historyStale(st())).toBe(true);                             // the new session's own step is still to be written
});

test("a read that fails is a warning, never an error", async () => {
  const opened = named("Two");
  loadHistory.mockRejectedValue(new Error("io"));
  st().setProject(opened);
  restoreAfterOpen(opened, "s");
  await wait();
  expect(warn).toHaveBeenCalledWith("history restore failed", expect.any(Error));
  expect(st().past).toEqual([]);
});

test("stale: a project is open, a stack is not empty, and it is not what was last written or restored", async () => {
  expect(historyStale(st())).toBe(false);                            // no project
  const opened = named("Two");
  st().setProject(opened);
  expect(historyStale(st())).toBe(false);                            // nothing to keep
  st().apply(rename("Edited"));
  expect(historyStale(st())).toBe(true);
  await keepHistoryNow();
  expect(historyStale(st())).toBe(false);
  st().undo();
  expect(historyStale(st())).toBe(true);                             // only redo is left: still something to keep
  await keepHistoryNow();
  st().setExportSettings({ fps: 60, quality: "high" });              // not an undo step, but project.json changes: the stamp must follow
  expect(historyStale(st())).toBe(true);
});

test("keepHistoryNow: the project first, then its history; the store is told it is saved", async () => {
  const order: string[] = [];
  saveProject.mockImplementation(async () => { order.push("project"); });
  saveHistory.mockImplementation(async () => { order.push("history"); return true; });
  st().setProject(named("Two"));
  st().apply(rename("Edited"));
  const { project, past, future } = st();
  expect(st().dirty).toBe(true);
  await keepHistoryNow();
  expect(order).toEqual(["project", "history"]);
  expect(saveProject).toHaveBeenCalledWith(project);
  expect(saveHistory).toHaveBeenCalledWith(project, past, future);
  expect(st().dirty).toBe(false);
  await keepHistoryNow();                                            // nothing changed since: nothing is written
  expect(saveProject).toHaveBeenCalledTimes(1);
  expect(saveHistory).toHaveBeenCalledTimes(1);
});

test("keepHistoryNow writes nothing when there is nothing to keep", async () => {
  await keepHistoryNow();
  st().setProject(named("Two"));
  await keepHistoryNow();
  expect(saveProject).not.toHaveBeenCalled();
  expect(saveHistory).not.toHaveBeenCalled();
});

test("a project save that fails: no history is written, nothing is thrown, and it is tried again next time", async () => {
  saveProject.mockRejectedValueOnce(new Error("disk full"));
  st().setProject(named("Two"));
  st().apply(rename("Edited"));
  await expect(keepHistoryNow()).resolves.toBeUndefined();
  expect(saveHistory).not.toHaveBeenCalled();
  expect(st().dirty).toBe(true);
  expect(warn).toHaveBeenCalledWith("history keep failed", expect.any(Error));
  expect(historyStale(st())).toBe(true);
});

test("a history that was not written stays to be written; an edit made during the save is not marked saved", async () => {
  saveHistory.mockResolvedValueOnce(false);
  st().setProject(named("Two"));
  st().apply(rename("Edited"));
  await keepHistoryNow();
  expect(historyStale(st())).toBe(true);

  let saved!: () => void;
  saveProject.mockReturnValueOnce(new Promise<void>((r) => { saved = r; }));
  const running = keepHistoryNow();
  st().apply(rename("Again"));
  saved();
  await running;
  expect(st().dirty).toBe(true);
  expect(historyStale(st())).toBe(true);
});

// —— Added to the plan's tests: one write at a time ——

test("two calls at once (inactive, then background a moment later): the second waits for the first and then has nothing to write", async () => {
  const order: string[] = [];
  let saved!: () => void;
  saveProject.mockImplementationOnce(() => { order.push("project>"); return new Promise<void>((r) => { saved = () => { order.push("project<"); r(); }; }); });
  saveHistory.mockImplementation(async () => { order.push("history"); return true; });
  st().setProject(named("Two"));
  st().apply(rename("Edited"));
  const first = keepHistoryNow(), second = keepHistoryNow();
  await jest.advanceTimersByTimeAsync(0);
  expect(order).toEqual(["project>"]);                               // the second has started nothing
  saved();
  await Promise.all([first, second]);
  expect(order).toEqual(["project>", "project<", "history"]);
  expect(saveProject).toHaveBeenCalledTimes(1);
});

test("a second call that does have something new is written whole AFTER the first: project, history, project, history", async () => {
  const order: string[] = [];
  let saved!: () => void;
  saveProject.mockImplementationOnce((p: Project) => { order.push(`project ${p.name}`); return new Promise<void>((r) => { saved = r; }); });
  saveProject.mockImplementation(async (p: Project) => { order.push(`project ${p.name}`); });
  saveHistory.mockImplementation(async (p: Project) => { order.push(`history ${p.name}`); return true; });
  st().setProject(named("Two"));
  st().apply(rename("Edited"));
  const first = keepHistoryNow();
  st().apply(rename("Again"));
  const second = keepHistoryNow();
  await jest.advanceTimersByTimeAsync(0);
  expect(order).toEqual(["project Edited"]);
  saved();
  await Promise.all([first, second]);
  expect(order).toEqual(["project Edited", "history Edited", "project Again", "history Again"]);
  expect(st().dirty).toBe(false);
  expect(historyStale(st())).toBe(false);
});

test("historyTurn: a job runs at once when nothing is being written, behind the one that is otherwise — and a job that fails holds nobody up and tells only its own caller", async () => {
  const order: string[] = [];
  let ran = false;
  void historyTurn(async () => { ran = true; });
  expect(ran).toBe(true);                                            // at once, in the same call: the leave's save starts as it always did
  await jest.advanceTimersByTimeAsync(0);
  let open!: () => void;
  const a = historyTurn(() => new Promise<void>((r) => { open = () => { order.push("a"); r(); }; }));
  const b = historyTurn(async () => { order.push("b"); throw new Error("no"); });
  const c = historyTurn(async () => { order.push("c"); });
  await jest.advanceTimersByTimeAsync(0);
  expect(order).toEqual([]);
  open();
  await expect(b).rejects.toThrow("no");
  await expect(Promise.all([a, c])).resolves.toEqual([undefined, undefined]);
  expect(order).toEqual(["a", "b", "c"]);
});

test("the editor left while the write is on its way: the write ends, and is not remembered for the next project", async () => {
  let saved!: () => void;
  saveProject.mockReturnValueOnce(new Promise<void>((r) => { saved = r; }));
  const opened = named("Two");
  st().setProject(opened);
  st().apply(rename("Edited"));
  const { project, past, future } = st();
  const running = keepHistoryNow();
  forgetHistory(); st().reset();
  saved();
  await running;
  expect(saveHistory).toHaveBeenCalledWith(project, past, future);   // what was begun is finished: the file belongs to that project.json
  expect(st().dirty).toBe(false);
  expect(st().project).toBeNull();
  useEditorStore.setState({ project, past, future });                // were the same three ever in the store again, they would be written again
  expect(historyStale(st())).toBe(true);
});

test("the turn is free the moment its job has ended: the next one starts at once", async () => {
  await historyTurn(async () => {});
  let ran = false;
  void historyTurn(async () => { ran = true; });
  expect(ran).toBe(true);
});
