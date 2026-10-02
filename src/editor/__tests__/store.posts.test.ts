jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-02T10:00:00.000Z" }));
import { renameProject } from "@/src/editor/model/ops";
import { makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";

const rec = { platform: "youtube" as const, url: "https://youtu.be/abc", postedAt: "2026-10-02T10:00:00.000Z" };
beforeEach(() => { useEditorStore.getState().reset(); useEditorStore.getState().setProject(makeProject()); });

test("addPostRecord appends, marks dirty and is not an undo step", () => {
  useEditorStore.getState().addPostRecord(rec);
  const s = useEditorStore.getState();
  expect(s.project!.posts).toEqual([rec]);
  expect(s.dirty).toBe(true);
  expect(s.past).toHaveLength(0);
});

test("post records survive undo and redo", () => {
  const s = useEditorStore.getState();
  s.apply((p) => renameProject(p, "Renamed"));
  s.addPostRecord(rec);
  useEditorStore.getState().undo();
  expect(useEditorStore.getState().project).toMatchObject({ name: "Project 1", posts: [rec] });
  useEditorStore.getState().redo();
  expect(useEditorStore.getState().project).toMatchObject({ name: "Renamed", posts: [rec] });
});

test("no project → no-op", () => {
  useEditorStore.getState().reset();
  expect(() => useEditorStore.getState().addPostRecord(rec)).not.toThrow();
});
