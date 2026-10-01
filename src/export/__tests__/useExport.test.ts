import { act, renderHook } from "@testing-library/react-native";
jest.mock("@/modules/clipy-video", () => ({
  isNativeAvailable: () => true,
  exportTimeline: jest.fn(async () => "job1"),
  addExportListener: jest.fn(() => ({ remove() {} })),
  cancelExport: jest.fn(),
  toExportOverlay: jest.requireActual("@/modules/clipy-video").toExportOverlay,
}));
jest.mock("@/src/projects/expoFs", () => ({
  expoFs: { cacheDir: "file:///cache/", freeBytes: async () => 1e12, mkdir: async () => {} },
}));
import { exportTimeline } from "@/modules/clipy-video";
import { makeAudioTrack, makeClip, makeOverlay, makeProject, makeSticker } from "@/src/editor/model/types";
import { useExport } from "../useExport";

const a = makeClip({ id: "a", sourceDuration: 4, volume: 1.5, muted: true, speed: 2, filter: "warm", transitionOut: { type: "fade", duration: 0.5 } });
const b = makeClip({ id: "b", sourceDuration: 6 }); // sourceUri file:///media/b.mp4
const c = makeClip({ id: "c", sourceDuration: 5 }); // sourceUri file:///media/c.mp4
const project = makeProject({
  id: "p1",
  clips: [a, b, c],
  overlays: [
    makeOverlay({ id: "o", text: "Hey", fontId: "anton", start: 0, end: 2 }),
    makeSticker({ id: "s", emoji: "⭐", shape: null, start: 0, end: 2 }),
  ],
  audioTracks: [makeAudioTrack({ id: "m", sourceUri: "file:///media/m.m4a", sourceDuration: 9 })],
});

beforeEach(() => jest.clearAllMocks());

test("exports only clips whose source file is present", async () => {
  const { result } = await renderHook(() => useExport(project, [c.sourceUri]));
  await act(() => result.current.start(1080));
  expect(exportTimeline).toHaveBeenCalledTimes(1);
  expect((exportTimeline as jest.Mock).mock.calls[0][0]).toEqual(
    expect.objectContaining({
      overlays: [
        expect.objectContaining({ kind: "text", text: "Hey", fontPostScriptName: "Anton-Regular", x: 0.5 }),
        expect.objectContaining({ kind: "sticker", emoji: "⭐", shape: null }),
      ],
      audio: expect.objectContaining({ sourceUri: "file:///media/m.m4a", trimEnd: 9, volume: 1 }),
      clips: [
        expect.objectContaining({ volume: 1.5, muted: true, speed: 2, filter: "warm", transition: { type: "fade", duration: 0.5 } }),
        expect.objectContaining({ sourceUri: b.sourceUri }),
      ],
    }),
  );
  expect(result.current.state.status).toBe("exporting");
});

test("errors when every clip's source is missing", async () => {
  const { result } = await renderHook(() => useExport(project, [a.sourceUri, b.sourceUri, c.sourceUri]));
  await act(() => result.current.start(1080));
  expect(exportTimeline).not.toHaveBeenCalled();
  expect(result.current.state.status).toBe("error");
});

test("drops the audio track when its source file is missing", async () => {
  const { result } = await renderHook(() => useExport(project, [c.sourceUri, "file:///media/m.m4a"]));
  await act(() => result.current.start(1080));
  expect(exportTimeline).toHaveBeenCalledTimes(1);
  expect((exportTimeline as jest.Mock).mock.calls[0][0].audio).toBeNull();
});

test("clears the last exported clip's transition when a trailing clip's source is missing", async () => {
  const { result } = await renderHook(() => useExport(project, [b.sourceUri, c.sourceUri]));
  await act(() => result.current.start(1080));
  expect((exportTimeline as jest.Mock).mock.calls[0][0].clips).toEqual([
    expect.objectContaining({ transition: { type: "none", duration: 0 } }),
  ]);
});
