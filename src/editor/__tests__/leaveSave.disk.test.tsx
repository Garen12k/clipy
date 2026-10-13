// The pair that could lose a project: the autosave's move is still waiting in the phone's queue when the editor is
// left and the save-on-leave starts. The real hooks and the real storage, on the fake fs with the phone's move.
import { act, renderHook, waitFor } from "@testing-library/react-native";
jest.mock("@/src/projects", () => {
  const { memoryFs } = jest.requireActual("@/src/projects/fs");
  const { makeStorage } = jest.requireActual("@/src/projects/storage");
  const mockFs = memoryFs();
  let n = 0;
  return { mockFs, storage: makeStorage(mockFs, { thumbnail: async () => "file:///tmp/t.jpg", newId: () => `id${++n}`, nowIso: () => "2026-10-13T10:00:00.000Z" }) };
});
import { setAspectRatio } from "@/src/editor/model/ops";
import { makeProject, type Project } from "@/src/editor/model/types";
import type { memoryFs } from "@/src/projects/fs";
import { storage } from "@/src/projects";
import { useEditorStore } from "@/src/editor/store";
import { lastFlush } from "../flush";
import { useAutosave } from "../useAutosave";
import { useLoadProject } from "../useLoadProject";

const fs = (jest.requireMock("@/src/projects") as { mockFs: ReturnType<typeof memoryFs> }).mockFs;
const JSON_PATH = `${fs.documentDir}projects/p1/project.json`;
const save = (p: Project) => storage.saveProject(p);
const realMove = fs.move;
const onDisk = () => { const t = fs.files.get(JSON_PATH); return t === undefined ? null : (JSON.parse(t) as Project); };

let warn: jest.SpyInstance;
beforeEach(async () => {
  warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  fs.move = realMove;
  fs.files.clear();
  useEditorStore.getState().reset();
  await storage.saveProject(makeProject({ id: "p1" }));
});
afterEach(() => warn.mockRestore());

/** The phone's queue is busy (thumbnails): every move waits until `open()`. */
function holdMoves() {
  let open!: () => void;
  const gate = new Promise<void>((r) => { open = r; });
  fs.move = async (from, to) => { await gate; return realMove(from, to); };
  return open;
}

async function openEditor() {
  const view = await renderHook(() => { useAutosave(save, 10); return useLoadProject("p1"); });
  await waitFor(() => expect(view.result.current.status).toBe("ready"));
  return view;
}

test("leaving while the autosave's move is still waiting: the project is on disk afterwards, with the latest edit", async () => {
  const { unmount } = await openEditor();
  const open = holdMoves();
  await act(() => useEditorStore.getState().apply((p) => setAspectRatio(p, "1:1")));
  await waitFor(() => expect(fs.files.has(`${JSON_PATH}.tmp`)).toBe(true));   // the autosave wrote; its move waits
  expect(useEditorStore.getState().dirty).toBe(true);
  await act(() => unmount());                                                 // the leave saves too
  await act(async () => { open(); });
  await lastFlush;
  expect(onDisk()?.aspectRatio).toBe("1:1");
  expect(warn).not.toHaveBeenCalled();
  expect([...fs.files.keys()].filter((f) => f.includes(".tmp"))).toEqual([]);
});

test("an edit made after the autosave started, then leaving: that later edit is what the disk holds", async () => {
  const { unmount } = await openEditor();
  const open = holdMoves();
  await act(() => useEditorStore.getState().apply((p) => setAspectRatio(p, "1:1")));
  await waitFor(() => expect(fs.files.has(`${JSON_PATH}.tmp`)).toBe(true));
  await act(() => useEditorStore.getState().apply((p) => setAspectRatio(p, "16:9")));
  await act(() => unmount());
  await act(async () => { open(); });
  await lastFlush;
  expect(onDisk()?.aspectRatio).toBe("16:9");
  expect(warn).not.toHaveBeenCalled();
});

test("an edit made while the autosave was on its way is written by the next autosave, with no further edit", async () => {
  const { unmount } = await openEditor();
  const open = holdMoves();
  await act(() => useEditorStore.getState().apply((p) => setAspectRatio(p, "1:1")));
  await waitFor(() => expect(fs.files.has(`${JSON_PATH}.tmp`)).toBe(true));
  await act(() => useEditorStore.getState().apply((p) => setAspectRatio(p, "16:9")));
  await act(async () => { open(); });
  await waitFor(() => expect(onDisk()?.aspectRatio).toBe("16:9"));
  await waitFor(() => expect(useEditorStore.getState().dirty).toBe(false));
  await act(() => unmount());
  await lastFlush;
  expect(onDisk()?.aspectRatio).toBe("16:9");
});
