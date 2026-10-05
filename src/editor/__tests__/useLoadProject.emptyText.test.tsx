import { act, render, waitFor } from "@testing-library/react-native";
jest.mock("@/src/projects", () => ({ storage: { loadProject: jest.fn(), saveProject: jest.fn(async () => {}), writeCover: jest.fn(async () => {}) } }));
import { makeClip, makeOverlay, makeProject, type Project } from "@/src/editor/model/types";
import { storage } from "@/src/projects";
import { useEditorStore } from "@/src/editor/store";
import { lastFlush } from "../flush";
import { closeStrip, openStrip, useStripCloser, useToolStrip } from "../toolStrip";
import { useLoadProject } from "../useLoadProject";

const st = () => useEditorStore.getState();
const project = (overlays: Project["overlays"]) => makeProject({ id: "p1", clips: [makeClip({ id: "a", sourceDuration: 10 })], overlays });
const saved = (): string[] => ((storage.saveProject as jest.Mock).mock.calls[0][0] as Project).overlays.map((o) => o.id);
const covered = (): string[] => ((storage.writeCover as jest.Mock).mock.calls[0][0] as Project).overlays.map((o) => o.id);
/** The editor screen in small: the load hook in the screen, and below it the bottom area with its closer (which closes the open tool when the editor is left). */
let status = "";
function Bar() { useStripCloser(); return null; }
function Screen() { status = useLoadProject("p1").status; return <Bar />; }
const open = async (overlays: Project["overlays"], editing: string | null) => {
  (storage.loadProject as jest.Mock).mockResolvedValueOnce({ project: project(overlays), missingSourceUris: [] });
  const hook = await render(<Screen />);
  await waitFor(() => expect(status).toBe("ready"));
  if (editing) await act(() => { st().selectOverlay(editing); openStrip("text"); });
  return hook;
};

beforeEach(() => { jest.clearAllMocks(); closeStrip(); st().reset(); status = ""; });

test("leaving the editor while an empty text is being edited saves the project without it — even when the autosave had already written it", async () => {
  const { unmount } = await open([makeOverlay({ id: "keep", text: "Hi" }), makeOverlay({ id: "new", text: "" })], "new");
  await act(() => { st().markSaved(); });                      // the autosave wrote the empty text 500 ms after it was added
  await act(() => unmount());
  await lastFlush;
  expect(storage.saveProject).toHaveBeenCalledTimes(1);
  expect(saved()).toEqual(["keep"]);
  expect(covered()).toEqual(["keep"]);
  expect(useToolStrip.getState().open).toBeNull();
  expect(st().project).toBeNull();
});

test("unsaved edits and the empty text being edited: one save, without the text", async () => {
  const { unmount } = await open([makeOverlay({ id: "new", text: "Hi" })], "new");
  await act(() => { st().apply((p) => ({ ...p, overlays: p.overlays.map((o) => (o.id === "new" ? { ...o, text: "  " } : o)) })); });
  await act(() => unmount());
  await lastFlush;
  expect(storage.saveProject).toHaveBeenCalledTimes(1);
  expect(saved()).toEqual([]);
});

test("nothing else is touched on leave: a text with content being edited, an empty text that is not being edited, an empty caption being edited", async () => {
  let hook = await open([makeOverlay({ id: "t", text: "Hi" })], "t");
  await act(() => hook.unmount());
  await lastFlush;
  expect(storage.saveProject).not.toHaveBeenCalled();
  expect(covered()).toEqual(["t"]);

  jest.clearAllMocks();
  hook = await open([makeOverlay({ id: "t", text: "Hi" }), makeOverlay({ id: "old", text: "" })], "t");
  await act(() => hook.unmount());
  await lastFlush;
  expect(storage.saveProject).not.toHaveBeenCalled();
  expect(covered()).toEqual(["t", "old"]);

  jest.clearAllMocks();
  hook = await open([makeOverlay({ id: "old", text: "" })], null);            // selected or not, no text panel is open
  await act(() => { st().selectOverlay("old"); });
  await act(() => hook.unmount());
  await lastFlush;
  expect(storage.saveProject).not.toHaveBeenCalled();

  jest.clearAllMocks();
  hook = await open([makeOverlay({ id: "c", kind: "caption", text: "" })], "c");
  await act(() => hook.unmount());
  await lastFlush;
  expect(storage.saveProject).not.toHaveBeenCalled();
  expect(covered()).toEqual(["c"]);
});
