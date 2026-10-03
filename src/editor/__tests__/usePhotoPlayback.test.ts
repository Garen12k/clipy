import { act, renderHook } from "@testing-library/react-native";
import { makeClip, makePhotoClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "../store";
import { photoPlaybackStep, usePhotoPlayback } from "../usePhotoPlayback";

jest.useFakeTimers();

const project = () => makeProject({ clips: [
  makePhotoClip({ id: "p1", seconds: 1 }),
  makePhotoClip({ id: "p2", seconds: 2 }),
  makeClip({ id: "v", sourceDuration: 3 }),
] });

beforeEach(() => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setProject(project());
});

test("photoPlaybackStep moves within a photo, stops at its end into the next clip, and ends the project", () => {
  const p = project();
  expect(photoPlaybackStep(p, 0.2, 0.3)).toEqual({ playhead: 0.5, ended: false });
  expect(photoPlaybackStep(p, 0.9, 0.5)).toEqual({ playhead: 1, ended: false }); // lands on p2's start, no overshoot
  const last = makeProject({ clips: [makeClip({ id: "v", sourceDuration: 3 }), makePhotoClip({ id: "p", seconds: 2 })] });
  expect(photoPlaybackStep(last, 4.8, 0.5)).toEqual({ playhead: 5, ended: true });
});

test("advances the playhead by real elapsed time, not by tick count", async () => {
  useEditorStore.getState().setPlaying(true);
  await renderHook(() => usePhotoPlayback(true));
  await act(() => { jest.advanceTimersByTime(250); });
  expect(useEditorStore.getState().playhead).toBeCloseTo(0.25, 5);
  // A stalled JS thread: 300 ms pass but only one 50 ms tick fires.
  jest.setSystemTime(Date.now() + 250);
  await act(() => { jest.advanceTimersByTime(50); });
  expect(useEditorStore.getState().playhead).toBeCloseTo(0.55, 5);
});

test("stops at the photo's end and moves on to the next clip", async () => {
  useEditorStore.getState().setPlaying(true);
  useEditorStore.getState().seek(0.9);
  await renderHook(() => usePhotoPlayback(true));
  await act(() => { jest.advanceTimersByTime(200); });
  // Ticks at 50 / 100 ms: 0.95, then lands exactly on p2's start (1); ticks at 150 / 200 ms move on through p2.
  expect(useEditorStore.getState().playhead).toBeCloseTo(1.1, 5);
  expect(useEditorStore.getState().isPlaying).toBe(true);
});

test("stops playing at the project's end", async () => {
  useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "v", sourceDuration: 3 }), makePhotoClip({ id: "p", seconds: 2 })] }));
  useEditorStore.getState().seek(4.9);
  useEditorStore.getState().setPlaying(true);
  await renderHook(() => usePhotoPlayback(true));
  await act(() => { jest.advanceTimersByTime(300); });
  expect(useEditorStore.getState().playhead).toBe(5);
  expect(useEditorStore.getState().isPlaying).toBe(false);
});

test("inactive → no timer; deactivating and unmounting clear it", async () => {
  // jest.getTimerCount() also counts the test renderer's own scheduling timers, so watch ours directly.
  const setIntervalSpy = jest.spyOn(global, "setInterval");
  const clearIntervalSpy = jest.spyOn(global, "clearInterval");
  const { rerender, unmount } = await renderHook(({ on }: { on: boolean }) => usePhotoPlayback(on), { initialProps: { on: false } });
  expect(setIntervalSpy).not.toHaveBeenCalled();
  await rerender({ on: true });
  expect(setIntervalSpy).toHaveBeenCalledTimes(1);
  const first = setIntervalSpy.mock.results[0].value;
  await rerender({ on: false });
  expect(clearIntervalSpy).toHaveBeenCalledWith(first);
  await rerender({ on: true });
  const second = setIntervalSpy.mock.results[1].value;
  await unmount();
  expect(clearIntervalSpy).toHaveBeenCalledWith(second);
  expect(setIntervalSpy).toHaveBeenCalledTimes(2);
  setIntervalSpy.mockRestore();
  clearIntervalSpy.mockRestore();
});
