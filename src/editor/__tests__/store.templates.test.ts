jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@/src/lib/id", () => ({ newId: jest.fn(() => "tpl") }));
import { applyTemplate } from "@/src/editor/model/ops";
import { makeClip, makeOverlay, makeProject } from "@/src/editor/model/types";
import { TEMPLATES } from "@/src/editor/templates";
import { useEditorStore } from "../store";

const p = makeProject({
  clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 4 })],
  overlays: [makeOverlay({ id: "cap", kind: "caption", text: "hi", start: 0, end: 1 })],
});
beforeEach(() => useEditorStore.getState().reset());

test("applying a template is exactly one undo step and undo restores the exact project", () => {
  const s = useEditorStore.getState();
  s.setProject(p);
  s.apply((x) => applyTemplate(x, TEMPLATES.retro, "project", null));
  const after = useEditorStore.getState().project!;
  expect(after).not.toEqual(p);
  expect(useEditorStore.getState().past).toHaveLength(1);
  s.undo();
  expect(useEditorStore.getState().project).toBe(p);
  expect(useEditorStore.getState().past).toHaveLength(0);
  s.redo();
  expect(useEditorStore.getState().project).toBe(after);
});
