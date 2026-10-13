jest.mock("@/src/projects", () => ({ storage: { loadHistory: jest.fn(), saveHistory: jest.fn(async () => true), saveProject: jest.fn(async () => {}), saveWithHistory: jest.fn() } }));
import { storage } from "@/src/projects";
import { forgetHistory, HISTORY_READ_DELAY_MS, historyStale, keepHistoryNow, restoreAfterOpen } from "../historyKeeper";
import { makeProject, type Project } from "../model/types";
import { useEditorStore } from "../store";

const st = () => useEditorStore.getState();
const loadHistory = storage.loadHistory as jest.Mock, saveHistory = storage.saveHistory as jest.Mock, saveProject = storage.saveProject as jest.Mock;
const saveWithHistory = storage.saveWithHistory as unknown as jest.Mock;
/** The storage's contract for the pair, over the two mocks: the project first; its history only when that save has landed; `kept` never rejects. */
const pair = (p: Project, past: Project[], future: Project[]) => {
  const saved = saveProject(p) as Promise<void>;
  return { saved, kept: saved.then(() => saveHistory(p, past, future) as Promise<boolean>, () => false) };
};
const named = (name: string): Project => makeProject({ id: "p1", name });
const rename = (name: string) => (p: Project): Project => ({ ...p, name });
const wait = () => jest.advanceTimersByTimeAsync(HISTORY_READ_DELAY_MS);
let warn: jest.SpyInstance;
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  loadHistory.mockResolvedValue(null); saveHistory.mockResolvedValue(true); saveProject.mockResolvedValue(undefined);
  saveWithHistory.mockImplementation(pair);
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

test("a second call that has something new starts its own write at once — the storage's chain puts it behind the first (pinned on the real storage)", async () => {
  let saved!: () => void;
  saveProject.mockReturnValueOnce(new Promise<void>((r) => { saved = r; }));
  st().setProject(named("Two"));
  st().apply(rename("Edited"));
  const first = keepHistoryNow();
  st().apply(rename("Again"));
  const again = st();
  const second = keepHistoryNow();
  expect(saveWithHistory).toHaveBeenCalledTimes(2);                  // asked in the very call: the keeper has no queue of its own
  expect(saveWithHistory).toHaveBeenLastCalledWith(again.project, again.past, again.future);
  saved();
  await Promise.all([first, second]);
  expect(st().dirty).toBe(false);
  expect(historyStale(st())).toBe(false);
});

test("the pair is asked of the storage in ONE call — the keeper never saves the project and the history as two steps of its own", async () => {
  saveWithHistory.mockImplementation(() => ({ saved: Promise.resolve(), kept: Promise.resolve(true) }));
  st().setProject(named("Two"));
  st().apply(rename("Edited"));
  const { project, past, future } = st();
  await keepHistoryNow();
  expect(saveWithHistory).toHaveBeenCalledWith(project, past, future);
  expect(saveProject).not.toHaveBeenCalled();
  expect(saveHistory).not.toHaveBeenCalled();
  expect(st().dirty).toBe(false);
  expect(historyStale(st())).toBe(false);
});

test("the store is told it is saved when the PROJECT is saved — not when the history is done, which may take longer or never come", async () => {
  saveWithHistory.mockImplementation(() => ({ saved: Promise.resolve(), kept: new Promise<boolean>(() => {}) }));
  st().setProject(named("Two"));
  st().apply(rename("Edited"));
  void keepHistoryNow();
  await jest.advanceTimersByTimeAsync(0);
  expect(st().dirty).toBe(false);
  expect(historyStale(st())).toBe(true);                             // not known to be written: the leave writes it again
});

test("a storage that throws outright is a warning too", async () => {
  saveWithHistory.mockImplementation(() => { throw new Error("no storage"); });
  st().setProject(named("Two"));
  st().apply(rename("Edited"));
  await expect(keepHistoryNow()).resolves.toBeUndefined();
  expect(warn).toHaveBeenCalledWith("history keep failed", expect.any(Error));
  saveWithHistory.mockImplementation(pair);
  await keepHistoryNow();                                            // and the next call is not held by the failed one
  expect(historyStale(st())).toBe(false);
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
