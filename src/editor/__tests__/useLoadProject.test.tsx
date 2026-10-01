import { act, renderHook, waitFor } from "@testing-library/react-native";
jest.mock("@/src/projects", () => ({ storage: { loadProject: jest.fn(), saveProject: jest.fn() } }));
import { setAspectRatio } from "@/src/editor/model/ops";
import { makeProject } from "@/src/editor/model/types";
import { storage } from "@/src/projects";
import { useEditorStore } from "@/src/editor/store";
import { lastFlush } from "../flush";
import { useLoadProject } from "../useLoadProject";

beforeEach(() => { jest.clearAllMocks(); useEditorStore.getState().reset(); });

test("loads the project into the store and reports missing source files", async () => {
  (storage.loadProject as jest.Mock).mockResolvedValueOnce({ project: makeProject({ id: "p1" }), missingSourceUris: ["file:///media/x.mp4"] });
  const { result, unmount } = await renderHook(() => useLoadProject("p1"));
  await waitFor(() => expect(result.current.status).toBe("ready"));
  expect(useEditorStore.getState().project?.id).toBe("p1");
  expect(useEditorStore.getState().missingSourceUris).toEqual(["file:///media/x.mp4"]);
  await act(() => unmount());
  expect(useEditorStore.getState().project).toBeNull();
  expect(storage.saveProject).not.toHaveBeenCalled(); // nothing dirty, nothing to flush
});

test("flushes unsaved edits on unmount before resetting the store", async () => {
  (storage.loadProject as jest.Mock).mockResolvedValueOnce({ project: makeProject({ id: "p1" }), missingSourceUris: [] });
  (storage.saveProject as jest.Mock).mockResolvedValueOnce(undefined);
  const { result, unmount } = await renderHook(() => useLoadProject("p1"));
  await waitFor(() => expect(result.current.status).toBe("ready"));
  await act(() => useEditorStore.getState().apply((p) => setAspectRatio(p, "1:1")));
  await act(() => unmount());
  expect(storage.saveProject).toHaveBeenCalledTimes(1);
  expect(storage.saveProject).toHaveBeenCalledWith(expect.objectContaining({ id: "p1", aspectRatio: "1:1" }));
  expect(useEditorStore.getState().project).toBeNull();
  await expect(lastFlush).resolves.toBeUndefined();
});

test("reports a readable error", async () => {
  (storage.loadProject as jest.Mock).mockRejectedValueOnce(new Error("Unsupported project schemaVersion: 2"));
  const { result } = await renderHook(() => useLoadProject("bad"));
  await waitFor(() => expect(result.current.status).toBe("error"));
  expect(result.current.error).toMatch(/schemaVersion/);
});
