jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { deleteOverlay } from "@/src/editor/model/ops";
import { makeClip, makeOverlay, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "../store";

const p = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 5 })], overlays: [makeOverlay({ id: "o1", start: 0, end: 2 })] });
beforeEach(() => { useEditorStore.getState().reset(); useEditorStore.getState().setProject(p); });

test("clip and overlay selection are mutually exclusive", () => {
  const s = useEditorStore.getState();
  s.select("a");
  s.selectOverlay("o1");
  expect(useEditorStore.getState()).toMatchObject({ selectedClipId: null, selectedOverlayId: "o1" });
  s.select("a");
  expect(useEditorStore.getState()).toMatchObject({ selectedClipId: "a", selectedOverlayId: null });
  s.select(null);
  expect(useEditorStore.getState().selectedOverlayId).toBeNull();
});

test("deleting the selected overlay clears the selection", () => {
  const s = useEditorStore.getState();
  s.selectOverlay("o1");
  s.apply((x) => deleteOverlay(x, "o1"));
  expect(useEditorStore.getState().selectedOverlayId).toBeNull();
});
