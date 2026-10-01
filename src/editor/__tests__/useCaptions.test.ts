import { act, renderHook, waitFor } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@/src/lib/id", () => { let n = 0; return { newId: () => `c${++n}` }; });
jest.mock("@/modules/clipy-video", () => ({
  isNativeAvailable: () => true,
  transcribe: jest.fn(async (uri: string) => (uri.includes("a") ? [{ text: "Hello", start: 0, end: 0.5 }, { text: "world", start: 0.6, end: 1 }] : [])),
  cancelTranscribe: jest.fn(),
}));
import { makeClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { useCaptions } from "../useCaptions";

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
