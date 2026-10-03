jest.mock("expo-video-thumbnails", () => ({ getThumbnailAsync: jest.fn() }));
jest.mock("@/src/projects", () => ({ storage: { saveStill: jest.fn() } }));
jest.mock("@/src/lib/id", () => { let n = 0; return { newId: jest.fn(() => `gen-${++n}`) }; });
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { act, renderHook } from "@testing-library/react-native";
import * as VideoThumbnails from "expo-video-thumbnails";
import { makeClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { storage } from "@/src/projects";
import { useToast } from "@/src/ui/Toast";
import { useFreezeFrame } from "../useFreezeFrame";

const thumb = VideoThumbnails.getThumbnailAsync as jest.Mock;
const saveStill = storage.saveStill as jest.Mock;
const st = () => useEditorStore.getState();

beforeEach(() => {
  jest.clearAllMocks();
  useToast.getState().clear();
  st().reset();
  st().setProject(makeProject({ id: "p1", clips: [
    makeClip({ id: "a", sourceDuration: 10, trimStart: 1, trimEnd: 5, speed: 2, sourceUri: "file:///a.mp4", width: 720, height: 1280 }),
    makeClip({ id: "b", sourceDuration: 4 }),
  ] }));   // a: 2 s output
  st().select("a");
  thumb.mockResolvedValue({ uri: "file:///tmp/frame.jpg", width: 720, height: 1280 });
  saveStill.mockResolvedValue({ uri: "file:///p1/media/still.jpg" });
});

test("captures at the playhead in ms, saves the still and inserts it in one undo step", async () => {
  st().seek(1);   // 1 s into a = source 1 + 1*2 = 3 s
  const { result } = await renderHook(() => useFreezeFrame());
  await act(async () => { await result.current.freeze(); });
  expect(thumb).toHaveBeenCalledWith("file:///a.mp4", { time: 3000, quality: 1 });
  expect(saveStill).toHaveBeenCalledWith("p1", "file:///tmp/frame.jpg");
  const clips = st().project!.clips;
  expect(clips).toHaveLength(4);
  expect([clips[0].id, clips[3].id]).toEqual(["a", "b"]);
  expect(clips[1]).toMatchObject({ kind: "photo", sourceUri: "file:///p1/media/still.jpg", width: 720, height: 1280 });
  expect(st().selectedClipId).toBe(clips[1].id);
  expect(st().playhead).toBe(1);
  expect(st().past).toHaveLength(1);
  expect(result.current.busy).toBe(false);
});

test("a reversed clip captures the mirrored source time", async () => {
  st().apply((p) => ({ ...p, clips: p.clips.map((c) => (c.id === "a" ? { ...c, reversed: true } : c)) }));
  const before = st().past.length;
  st().seek(0.5);   // 5 - 0.5*2 = 4 s
  const { result } = await renderHook(() => useFreezeFrame());
  await act(async () => { await result.current.freeze(); });
  expect(thumb).toHaveBeenCalledWith("file:///a.mp4", { time: 4000, quality: 1 });
  expect(st().past.length).toBe(before + 1);
});

test("a capture failure toasts and leaves the project unchanged", async () => {
  jest.spyOn(console, "warn").mockImplementation(() => {});
  thumb.mockRejectedValueOnce(new Error("nope"));
  st().seek(1);
  const project = st().project;
  const { result } = await renderHook(() => useFreezeFrame());
  await act(async () => { await result.current.freeze(); });
  expect(useToast.getState().message).toBe("Couldn't capture that frame");
  expect(st().project).toBe(project);
  expect(result.current.busy).toBe(false);
  (console.warn as jest.Mock).mockRestore();
});

test("a save failure toasts and leaves the project unchanged", async () => {
  jest.spyOn(console, "warn").mockImplementation(() => {});
  saveStill.mockRejectedValueOnce(new Error("disk"));
  st().seek(1);
  const project = st().project;
  const { result } = await renderHook(() => useFreezeFrame());
  await act(async () => { await result.current.freeze(); });
  expect(useToast.getState().message).toBe("Couldn't capture that frame");
  expect(st().project).toBe(project);
  (console.warn as jest.Mock).mockRestore();
});

test("playhead off the selected clip toasts and does nothing", async () => {
  st().seek(3);   // inside b
  const { result } = await renderHook(() => useFreezeFrame());
  await act(async () => { await result.current.freeze(); });
  expect(useToast.getState().message).toBe("Move the playhead onto the clip first.");
  expect(thumb).not.toHaveBeenCalled();
});

test("a project switch while capturing drops the result", async () => {
  let resolve: (v: unknown) => void = () => {};
  thumb.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
  st().seek(1);
  const { result } = await renderHook(() => useFreezeFrame());
  let run: Promise<void> = Promise.resolve();
  await act(async () => { run = result.current.freeze(); });
  expect(result.current.busy).toBe(true);
  await act(async () => { st().setProject(makeProject({ id: "other", clips: [makeClip({ id: "z", sourceDuration: 4 })] })); resolve({ uri: "file:///tmp/f.jpg" }); await run; });
  expect(st().project!.id).toBe("other");
  expect(st().project!.clips).toHaveLength(1);
});

test("a second freeze while one is running is ignored", async () => {
  let resolve: (v: unknown) => void = () => {};
  thumb.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
  st().seek(1);
  const { result } = await renderHook(() => useFreezeFrame());
  let run: Promise<void> = Promise.resolve();
  await act(async () => { run = result.current.freeze(); });
  await act(async () => { await result.current.freeze(); });
  expect(thumb).toHaveBeenCalledTimes(1);
  await act(async () => { resolve({ uri: "file:///tmp/f.jpg" }); await run; });
});
