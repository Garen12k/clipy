import { act, renderHook, waitFor } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@/src/lib/id", () => { let n = 0; return { newId: () => `c${++n}` }; });
jest.mock("@/modules/clipy-video", () => ({
  isNativeAvailable: () => true,
  transcribe: jest.fn(async (uri: string) => (uri.includes("a") ? [{ text: "Hello", start: 0, end: 0.5 }, { text: "world", start: 0.6, end: 1 }] : [])),
  cancelTranscribe: jest.fn(),
}));
import { cancelTranscribe, transcribe } from "@/modules/clipy-video";
import { makeClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { SPEECH_DENIED_MESSAGE, useCaptions } from "../useCaptions";

beforeEach(() => { useEditorStore.getState().reset(); useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceUri: "file:///a.mov", sourceDuration: 2 }), makeClip({ id: "b", sourceUri: "file:///b.mov", sourceDuration: 2 })] })); });

test("transcribes every clip, merges lines, applies captions once, reports skipped clips", async () => {
  const { result } = await renderHook(() => useCaptions());
  await act(() => result.current.run());
  await waitFor(() => expect(result.current.state.status).toBe("done"));
  const caps = useEditorStore.getState().project!.overlays;
  expect(caps).toHaveLength(1);
  expect(caps[0]).toMatchObject({ kind: "caption", text: "Hello world", start: 0, end: 1 });
  expect(result.current.state.skipped).toEqual(["b"]);
  expect(useEditorStore.getState().past).toHaveLength(1);
});

test("a later clip at speed ≠ 1 is offset by its clip start and mapped through its speed", async () => {
  useEditorStore.getState().setProject(makeProject({ clips: [
    makeClip({ id: "a", sourceUri: "file:///a.mov", sourceDuration: 2 }),                          // output 0–2
    makeClip({ id: "b", sourceUri: "file:///b.mov", sourceDuration: 6, trimStart: 1, speed: 2 }),  // output 2–4.5
  ] }));
  jest.mocked(transcribe)
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([{ text: "fast", start: 2, end: 3 }]);                                 // source 2–3 in b
  const { result } = await renderHook(() => useCaptions());
  await act(() => result.current.run());
  expect(result.current.state.status).toBe("done");
  expect(useEditorStore.getState().project!.overlays).toEqual([
    expect.objectContaining({ kind: "caption", text: "fast", start: 2.5, end: 3 }),                // 2 + (2−1)/2, 2 + (3−1)/2
  ]);
});

test("cancelling returns to idle, not an error, and applies nothing", async () => {
  let reject!: (e: unknown) => void;
  jest.mocked(transcribe).mockImplementationOnce(() => new Promise((_, rej) => { reject = rej; }));
  const { result } = await renderHook(() => useCaptions());
  let running!: Promise<void>;
  await act(async () => { running = result.current.run(); });
  expect(result.current.state.status).toBe("running");
  await act(async () => {
    result.current.cancel();
    reject(Object.assign(new Error("Transcription cancelled"), { code: "E_SPEECH_CANCELLED" }));
    await running;
  });
  expect(cancelTranscribe).toHaveBeenCalled();
  expect(result.current.state.status).toBe("idle");
  expect(result.current.state.message).toBeUndefined();
  expect(useEditorStore.getState().project!.overlays).toEqual([]);
  expect(useEditorStore.getState().past).toHaveLength(0);
});

test("permission denied maps to friendly copy and keeps the code", async () => {
  jest.mocked(transcribe).mockRejectedValueOnce(Object.assign(new Error("Speech recognition permission denied"), { code: "E_SPEECH_DENIED" }));
  const { result } = await renderHook(() => useCaptions());
  await act(() => result.current.run());
  expect(result.current.state).toMatchObject({ status: "error", code: "E_SPEECH_DENIED", message: SPEECH_DENIED_MESSAGE });
});
