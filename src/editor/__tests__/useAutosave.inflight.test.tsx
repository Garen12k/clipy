// An autosave marks the store saved ONLY for the very project it wrote: an edit made while that save was on its way
// stays unsaved (dirty) and is written by the next run, with no further edit needed.
import { act, renderHook } from "@testing-library/react-native";
import { makeProject, type Project } from "@/src/editor/model/types";
import { setAspectRatio } from "@/src/editor/model/ops";
import { useEditorStore } from "../store";
import { useAutosave } from "../useAutosave";

jest.useFakeTimers();
beforeEach(() => useEditorStore.getState().reset());

function slowSave() {
  const done: (() => void)[] = [];
  const save = jest.fn((_p: Project) => new Promise<void>((r) => { done.push(r); }));
  return { save, done };
}
const store = () => useEditorStore.getState();

test("an edit made while an autosave is on its way stays unsaved, and the next run writes it", async () => {
  const { save, done } = slowSave();
  store().setProject(makeProject());
  await renderHook(() => useAutosave(save));
  await act(() => store().apply((p) => setAspectRatio(p, "1:1")));
  await act(async () => { jest.advanceTimersByTime(500); });
  expect(save).toHaveBeenCalledTimes(1);
  const written = save.mock.calls[0][0];
  expect(written).toBe(store().project);

  await act(() => store().apply((p) => setAspectRatio(p, "16:9")));           // the edit during the save
  const newer = store().project!;
  await act(async () => { done[0](); });
  expect(store().dirty).toBe(true);                                           // the save wrote `written`, not `newer`

  await act(async () => { jest.advanceTimersByTime(500); });                  // no further edit: the debounce alone
  expect(save).toHaveBeenCalledTimes(2);
  expect(save.mock.calls[1][0]).toBe(newer);
  expect(store().dirty).toBe(true);
  await act(async () => { done[1](); });
  expect(store().dirty).toBe(false);
});

test("two autosaves on their way: only the one that wrote the store's project marks it saved", async () => {
  const { save, done } = slowSave();
  store().setProject(makeProject());
  await renderHook(() => useAutosave(save));
  await act(() => store().apply((p) => setAspectRatio(p, "1:1")));
  await act(async () => { jest.advanceTimersByTime(500); });
  await act(() => store().apply((p) => setAspectRatio(p, "16:9")));
  await act(async () => { jest.advanceTimersByTime(500); });
  expect(save).toHaveBeenCalledTimes(2);
  await act(async () => { done[0](); });
  expect(store().dirty).toBe(true);
  await act(async () => { done[1](); });
  expect(store().dirty).toBe(false);
  await act(async () => { jest.advanceTimersByTime(5000); });
  expect(save).toHaveBeenCalledTimes(2);                                      // nothing left to write
});
