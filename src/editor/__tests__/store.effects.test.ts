jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { addEffect, deleteEffect, setClipAdjust } from "@/src/editor/model/ops";
import { makeClip, makeEffect, makeOverlay, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "../store";

const p = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 5 })], overlays: [makeOverlay({ id: "o1", start: 0, end: 2 })], effects: [makeEffect({ id: "e1", start: 0, end: 2 })] });
beforeEach(() => { useEditorStore.getState().reset(); useEditorStore.getState().setProject(p); });

test("effect, clip and overlay selection are mutually exclusive", () => {
  const s = useEditorStore.getState();
  s.select("a");
  s.selectEffect("e1");
  expect(useEditorStore.getState()).toMatchObject({ selectedClipId: null, selectedOverlayId: null, selectedEffectId: "e1" });
  s.select("a");
  expect(useEditorStore.getState()).toMatchObject({ selectedClipId: "a", selectedEffectId: null });
  s.selectEffect("e1");
  s.selectOverlay("o1");
  expect(useEditorStore.getState()).toMatchObject({ selectedOverlayId: "o1", selectedEffectId: null });
  s.selectEffect("e1");
  s.selectEffect(null);
  expect(useEditorStore.getState().selectedEffectId).toBeNull();
});

test("deleting the selected effect clears the selection", () => {
  const s = useEditorStore.getState();
  s.selectEffect("e1");
  s.apply((x) => deleteEffect(x, "e1"));
  expect(useEditorStore.getState().selectedEffectId).toBeNull();
});

test("undoing the add of the selected effect clears the selection", () => {
  const s = useEditorStore.getState();
  s.apply((x) => addEffect(x, "glitch", 1, "e2"));
  s.selectEffect("e2");
  s.undo();
  expect(useEditorStore.getState().selectedEffectId).toBeNull();
});

test("one slider drag is one undo step", () => {
  const s = useEditorStore.getState();
  s.beginTransaction();
  for (const v of [0.1, 0.2, 0.3]) s.applyTransient((x) => setClipAdjust(x, "a", { brightness: v }));
  expect(useEditorStore.getState().project!.clips[0].adjust.brightness).toBe(0.3);
  s.undo();
  expect(useEditorStore.getState().project!.clips[0].adjust.brightness).toBe(0);
  expect(useEditorStore.getState().canUndo()).toBe(false);
});
