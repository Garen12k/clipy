jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { makeClip, makeLayer, makeProject } from "@/src/editor/model/types";
import { deleteClip, setAspectRatio, setClipOpacity } from "@/src/editor/model/ops";
import { HISTORY_LIMIT, useEditorStore } from "../store";

const p = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 4 })] });
beforeEach(() => useEditorStore.getState().reset());

test("apply pushes history, marks dirty, clears redo", () => {
  const s = useEditorStore.getState();
  s.setProject(p);
  s.apply((x) => setAspectRatio(x, "1:1"));
  expect(useEditorStore.getState().project?.aspectRatio).toBe("1:1");
  expect(useEditorStore.getState().past).toHaveLength(1);
  expect(useEditorStore.getState().dirty).toBe(true);
  s.undo();
  expect(useEditorStore.getState().project?.aspectRatio).toBe("9:16");
  expect(useEditorStore.getState().future).toHaveLength(1);
  s.redo();
  expect(useEditorStore.getState().project?.aspectRatio).toBe("1:1");
  s.undo();
  s.apply((x) => setAspectRatio(x, "16:9"));
  expect(useEditorStore.getState().future).toHaveLength(0);
});

test("apply with a no-op does not push history", () => {
  const s = useEditorStore.getState();
  s.setProject(p);
  s.apply((x) => setAspectRatio(x, "9:16"));
  expect(useEditorStore.getState().past).toHaveLength(0);
  expect(useEditorStore.getState().dirty).toBe(false);
});

test("history is capped", () => {
  const s = useEditorStore.getState();
  s.setProject(p);
  for (let i = 0; i < HISTORY_LIMIT + 10; i++) s.apply((x) => setAspectRatio(x, i % 2 ? "1:1" : "16:9"));
  expect(useEditorStore.getState().past).toHaveLength(HISTORY_LIMIT);
});

test("deleting the selected clip clears selection and clamps the playhead", () => {
  const s = useEditorStore.getState();
  s.setProject(p);
  s.select("b");
  s.seek(7);
  s.apply((x) => deleteClip(x, "b"));
  expect(useEditorStore.getState().selectedClipId).toBeNull();
  expect(useEditorStore.getState().playhead).toBe(4);
});

test("a selected layer stays selected through edits and is cleared when the layer goes", () => {
  const s = useEditorStore.getState();
  s.setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 })], layers: [makeLayer({ id: "L", sourceDuration: 2 })] }));
  s.select("L");
  s.apply((x) => setClipOpacity(x, "L", 0.5));
  expect(useEditorStore.getState().selectedClipId).toBe("L");
  s.apply((x) => deleteClip(x, "L"));
  expect(useEditorStore.getState().project!.layers).toHaveLength(0);
  expect(useEditorStore.getState().selectedClipId).toBeNull();
});

test("transactions record one undo step for many transient updates", () => {
  const s = useEditorStore.getState();
  s.setProject(p);
  s.beginTransaction();
  s.applyTransient((x) => setAspectRatio(x, "1:1"));
  s.applyTransient((x) => setAspectRatio(x, "16:9"));
  expect(useEditorStore.getState().past).toHaveLength(1);
  expect(useEditorStore.getState().project?.aspectRatio).toBe("16:9");
  s.undo();
  expect(useEditorStore.getState().project?.aspectRatio).toBe("9:16");
});

test("seek clamps, setZoom clamps", () => {
  const s = useEditorStore.getState();
  s.setProject(p);
  s.seek(-5); expect(useEditorStore.getState().playhead).toBe(0);
  s.seek(99); expect(useEditorStore.getState().playhead).toBe(8);
  s.setZoom(5); expect(useEditorStore.getState().pixelsPerSecond).toBe(20);
  s.setZoom(999); expect(useEditorStore.getState().pixelsPerSecond).toBe(200);
});
