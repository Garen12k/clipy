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

test("the still copies crop and background; selection and playhead land on the still even if the user scrubbed meanwhile", async () => {
  const crop = { x: 0.1, y: 0.1, w: 0.5, h: 0.6 };
  const background = { type: "color" as const, color: "#112233" };
  st().setProject(makeProject({ id: "p1", clips: [
    makeClip({ id: "z", sourceDuration: 3 }),
    makeClip({ id: "a", sourceDuration: 4, crop, background, sourceUri: "file:///a.mp4" }),
  ] }));
  st().select("a");
  st().seek(4);   // 1 s into a (z is 3 s)
  thumb.mockImplementationOnce(async () => { st().seek(0); return { uri: "file:///tmp/frame.jpg" }; });
  const { result } = await renderHook(() => useFreezeFrame());
  await act(async () => { await result.current.freeze(); });
  const still = st().project!.clips[2];
  expect(still.kind).toBe("photo");
  expect(still.crop).toEqual(crop);
  expect(still.crop).not.toBe(st().project!.clips[1].crop);
  expect(still.background).toEqual(background);
  expect(still.background).not.toBe(st().project!.clips[1].background);
  expect(st().selectedClipId).toBe(still.id);
  expect(st().playhead).toBe(4);
});

test("one undo returns the single original clip", async () => {
  st().seek(1);
  const { result } = await renderHook(() => useFreezeFrame());
  await act(async () => { await result.current.freeze(); });
  expect(st().project!.clips).toHaveLength(4);
  await act(async () => { st().undo(); });
  expect(st().project!.clips.map((c) => c.id)).toEqual(["a", "b"]);
  expect(st().project!.clips[0]).toMatchObject({ trimStart: 1, trimEnd: 5 });
});

test("a playhead at the clip's edge is refused before any capture or save", async () => {
  st().seek(0);
  const { result } = await renderHook(() => useFreezeFrame());
  await act(async () => { await result.current.freeze(); });
  expect(useToast.getState().message).toBe("Move the playhead away from the clip's edge.");
  expect(thumb).not.toHaveBeenCalled();
  expect(saveStill).not.toHaveBeenCalled();
});

test("freezing a reversed clip splits it reversed-aware and captures the cut frame", async () => {
  st().setProject(makeProject({ id: "p1", clips: [makeClip({ id: "a", sourceDuration: 10, trimStart: 2, trimEnd: 8, reversed: true, sourceUri: "file:///a.mp4" })] }));
  st().select("a");
  st().seek(1);
  const { result } = await renderHook(() => useFreezeFrame());
  await act(async () => { await result.current.freeze(); });
  expect(thumb).toHaveBeenCalledWith("file:///a.mp4", { time: 7000, quality: 1 });
  const [l, , r] = st().project!.clips;
  expect([l.trimStart, l.trimEnd, l.reversed]).toEqual([7, 8, true]);
  expect([r.trimStart, r.trimEnd, r.reversed]).toEqual([2, 7, true]);
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

test("a Replace during capture drops the result silently", async () => {
  let resolve: (v: unknown) => void = () => {};
  thumb.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
  st().seek(1);
  const { result } = await renderHook(() => useFreezeFrame());
  let run: Promise<void> = Promise.resolve();
  await act(async () => { run = result.current.freeze(); });
  await act(async () => {
    st().apply((p) => ({ ...p, clips: p.clips.map((c) => (c.id === "a" ? { ...c, sourceUri: "file:///new.mp4" } : c)) }));
    resolve({ uri: "file:///tmp/f.jpg" });
    await run;
  });
  expect(st().project!.clips.map((c) => c.id)).toEqual(["a", "b"]);
  expect(useToast.getState().message).toBeFalsy();
});
