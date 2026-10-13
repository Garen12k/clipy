import { makeClip, makeProject, POST_PLATFORMS, type Project } from "../model/types";
import { HISTORY_LIMIT, useEditorStore } from "../store";

const st = () => useEditorStore.getState();
const named = (name: string): Project => makeProject({ id: "p1", name, clips: [makeClip({ id: "a", sourceDuration: 10 })] });
const rename = (name: string) => (p: Project): Project => ({ ...p, name });
beforeEach(() => st().reset());

test("restoreHistory fills both stacks of the project that was loaded, and nothing else", () => {
  const loaded = named("Two");
  st().setProject(loaded);
  st().select("a"); st().seek(3); st().setZoom(90);
  const past = [named("Zero"), named("One")], future = [named("Three")];
  expect(st().canUndo()).toBe(false);
  expect(st().restoreHistory(loaded, past, future)).toBe(true);
  expect(st().past).toEqual(past);
  expect(st().future).toEqual(future);
  expect(st().canUndo()).toBe(true);
  expect(st().canRedo()).toBe(true);
  expect(st().project).toBe(loaded);
  expect(st().dirty).toBe(false);                                   // nothing to save: the project did not change
  expect([st().selectedClipId, st().playhead, st().pixelsPerSecond]).toEqual(["a", 3, 90]);
});

test("refused once anything has happened: another project object, or a stack that is no longer empty", () => {
  const loaded = named("Two");
  st().setProject(loaded);
  st().apply(rename("Edited"));
  expect(st().restoreHistory(loaded, [named("Zero")], [])).toBe(false);
  expect(st().past).toEqual([loaded]);

  st().setProject(loaded);
  st().beginTransaction();                                          // a drag has begun: the project is the same object, the stack is not empty
  expect(st().restoreHistory(loaded, [named("Zero")], [])).toBe(false);
  expect(st().past).toEqual([loaded]);

  st().setProject(loaded);
  st().setExportSettings({ fps: 60, quality: "high" });             // not an undo step, but another project object
  expect(st().restoreHistory(loaded, [named("Zero")], [])).toBe(false);

  st().setProject(loaded);
  expect(st().restoreHistory(named("Two"), [named("Zero")], [])).toBe(false);   // equal is not the same
  expect(st().restoreHistory(loaded, [], [])).toBe(false);
  st().reset();
  expect(st().restoreHistory(loaded, [named("Zero")], [])).toBe(false);          // no project open
  expect(st().past).toEqual([]);
});

test("never more than the limit: the newest undo steps, the nearest redo steps", () => {
  const loaded = named("now");
  st().setProject(loaded);
  const many = (prefix: string) => Array.from({ length: HISTORY_LIMIT + 10 }, (_, i) => named(`${prefix}${i}`));
  st().restoreHistory(loaded, many("p"), many("f"));
  expect(st().past).toHaveLength(HISTORY_LIMIT);
  expect(st().past[0].name).toBe("p10");
  expect(st().future).toHaveLength(HISTORY_LIMIT);
  expect(st().future[0].name).toBe("f0");
});

test("a restored step undoes and redoes like any other; posts and export settings stay live", () => {
  const loaded = named("Two");
  st().setProject(loaded);
  st().restoreHistory(loaded, [named("Zero"), named("One")], [named("Three")]);
  const post = { platform: POST_PLATFORMS[0], url: null, postedAt: "2026-10-13T10:00:00.000Z" };
  st().addPostRecord(post);
  st().setExportSettings({ fps: 60, quality: "high" });
  st().undo();
  expect(st().project).toMatchObject({ name: "One", posts: [post], exportSettings: { fps: 60, quality: "high" } });
  expect(st().dirty).toBe(true);
  expect(st().past.map((p) => p.name)).toEqual(["Zero"]);
  st().undo();
  expect(st().project!.name).toBe("Zero");
  expect(st().canUndo()).toBe(false);
  st().redo(); st().redo(); st().redo();
  expect(st().project).toMatchObject({ name: "Three", posts: [post] });
  expect(st().canRedo()).toBe(false);
});

test("an edit after a restore goes on top of the restored steps and clears redo, as always", () => {
  const loaded = named("Two");
  st().setProject(loaded);
  st().restoreHistory(loaded, [named("Zero"), named("One")], [named("Three")]);
  st().apply(rename("Edited"));
  expect(st().past.map((p) => p.name)).toEqual(["Zero", "One", "Two"]);
  expect(st().future).toEqual([]);
});

test("a restore is ONE change of the store: whoever watches the stacks hears of it once, however many steps came back", () => {
  const loaded = named("Two");
  st().setProject(loaded);
  let heard = 0;
  const off = useEditorStore.subscribe(() => { heard += 1; });
  st().restoreHistory(loaded, Array.from({ length: 30 }, (_, i) => named(`p${i}`)), [named("Three")]);
  off();
  expect(heard).toBe(1);
  heard = 0;
  const offAgain = useEditorStore.subscribe(() => { heard += 1; });
  st().restoreHistory(loaded, [named("Zero")], []);                 // a refusal changes nothing and tells nobody
  offAgain();
  expect(heard).toBe(0);
});
