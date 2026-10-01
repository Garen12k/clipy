import { act, renderHook } from "@testing-library/react-native";
import { makeProject, type Project } from "@/src/editor/model/types";
import { setAspectRatio } from "@/src/editor/model/ops";
import { useEditorStore } from "../store";
import { useAutosave } from "../useAutosave";

jest.useFakeTimers();
beforeEach(() => useEditorStore.getState().reset());

test("saves once, 500 ms after the last change, then clears dirty", async () => {
  const save = jest.fn(async (_p: Project) => {});
  useEditorStore.getState().setProject(makeProject());
  await renderHook(() => useAutosave(save));
  await act(() => useEditorStore.getState().apply((p) => setAspectRatio(p, "1:1")));
  await act(() => { jest.advanceTimersByTime(300); });
  await act(() => useEditorStore.getState().apply((p) => setAspectRatio(p, "16:9")));
  await act(() => { jest.advanceTimersByTime(499); });
  expect(save).not.toHaveBeenCalled();
  await act(async () => { jest.advanceTimersByTime(1); });
  expect(save).toHaveBeenCalledTimes(1);
  expect(save.mock.calls[0][0].aspectRatio).toBe("16:9");
  expect(useEditorStore.getState().dirty).toBe(false);
});
