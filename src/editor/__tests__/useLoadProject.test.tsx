import { act, renderHook, waitFor } from "@testing-library/react-native";
jest.mock("@/src/projects", () => ({ storage: { loadProject: jest.fn() } }));
import { makeProject } from "@/src/editor/model/types";
import { storage } from "@/src/projects";
import { useEditorStore } from "@/src/editor/store";
import { useLoadProject } from "../useLoadProject";

beforeEach(() => useEditorStore.getState().reset());

test("loads the project into the store and reports missing clips", async () => {
  (storage.loadProject as jest.Mock).mockResolvedValueOnce({ project: makeProject({ id: "p1" }), missingClipIds: ["x"] });
  const { result, unmount } = await renderHook(() => useLoadProject("p1"));
  await waitFor(() => expect(result.current.status).toBe("ready"));
  expect(useEditorStore.getState().project?.id).toBe("p1");
  expect(useEditorStore.getState().missingClipIds).toEqual(["x"]);
  await act(() => unmount());
  expect(useEditorStore.getState().project).toBeNull();
});

test("reports a readable error", async () => {
  (storage.loadProject as jest.Mock).mockRejectedValueOnce(new Error("Unsupported project schemaVersion: 2"));
  const { result } = await renderHook(() => useLoadProject("bad"));
  await waitFor(() => expect(result.current.status).toBe("error"));
  expect(result.current.error).toMatch(/schemaVersion/);
});
