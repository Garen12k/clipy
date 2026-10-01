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
jest.mock("@/src/lib/id", () => ({ newId: () => "split-right" }));
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { exportTimeline } from "@/modules/clipy-video";
import { setTransition, splitClipAt } from "@/src/editor/model/ops";
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

test("a split, sped-up clip with transitions and a shape sticker maps into one export request", async () => {
  const fast = makeClip({ id: "f", sourceDuration: 8, speed: 2, transitionOut: { type: "slide", duration: 0.6 } });   // 4 s output
  const tail = makeClip({ id: "t", sourceDuration: 4 });
  let p = makeProject({ id: "p2", clips: [fast, tail], overlays: [makeSticker({ id: "st", emoji: null, shape: "star", color: "#FF2D7A", start: 1, end: 3 })] });
  p = splitClipAt(p, 2);                                                       // output 2 s → source 4 s
  p = setTransition(p, "f", { type: "dissolve", duration: 0.5 });
  const { result } = await renderHook(() => useExport(p, []));
  await act(() => result.current.start(1080));
  const req = (exportTimeline as jest.Mock).mock.calls[0][0];
  expect(req.clips).toEqual([
    expect.objectContaining({ sourceUri: fast.sourceUri, trimStart: 0, trimEnd: 4, speed: 2, transition: { type: "dissolve", duration: 0.5 } }),
    expect.objectContaining({ sourceUri: fast.sourceUri, trimStart: 4, trimEnd: 8, speed: 2, transition: { type: "slide", duration: 0.6 } }),
    expect.objectContaining({ sourceUri: tail.sourceUri, speed: 1, transition: { type: "none", duration: 0 } }),
  ]);
  expect(req.overlays).toEqual([expect.objectContaining({ kind: "sticker", emoji: null, shape: "star", color: "#FF2D7A", start: 1, end: 3 })]);
});

test("clears the last exported clip's transition when a trailing clip's source is missing", async () => {
  const { result } = await renderHook(() => useExport(project, [b.sourceUri, c.sourceUri]));
  await act(() => result.current.start(1080));
  expect((exportTimeline as jest.Mock).mock.calls[0][0].clips).toEqual([
    expect.objectContaining({ transition: { type: "none", duration: 0 } }),
  ]);
});
