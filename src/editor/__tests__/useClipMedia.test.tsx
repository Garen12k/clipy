jest.mock("@/src/projects/pickMedia", () => ({ pickMedia: jest.fn() }));
jest.mock("@/src/projects", () => ({ storage: { importMedia: jest.fn() } }));
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { act, renderHook } from "@testing-library/react-native";
import { LAYER_LIMITS, makeClip, makeLayer, makePhotoClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { storage } from "@/src/projects";
import { pickMedia } from "@/src/projects/pickMedia";
import { useToast } from "@/src/ui/Toast";
import { useClipMedia } from "../useClipMedia";

const pick = pickMedia as jest.Mock;
const importMedia = storage.importMedia as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  useToast.getState().clear();
  useEditorStore.getState().reset();
  useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 })] }));
});

test("a second pick while one is open is ignored (add and replace share the lock)", async () => {
  let resolve: (v: unknown) => void = () => {};
  pick.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
  const { result } = await renderHook(() => useClipMedia());
  let first: Promise<void> = Promise.resolve();
  await act(async () => { first = result.current.addMedia(); });
  expect(result.current.busy).toBe(true);
  await act(async () => { await result.current.addMedia(); await result.current.replaceMedia("a"); });
  expect(pick).toHaveBeenCalledTimes(1);
  await act(async () => { resolve(null); await first; });
  expect(result.current.busy).toBe(false);
});

test("a picker error is reported and releases the lock", async () => {
  jest.spyOn(console, "warn").mockImplementation(() => {});
  pick.mockRejectedValueOnce(new Error("boom"));
  const { result } = await renderHook(() => useClipMedia());
  await act(async () => { await result.current.addMedia(); });
  expect(useToast.getState().message).toBe("Couldn't add those items.");
  expect(result.current.busy).toBe(false);
  (console.warn as jest.Mock).mockRestore();
});

test("a closed project gets no toast when nothing could be added", async () => {
  pick.mockResolvedValueOnce([{ uri: "file:///x.mov", kind: "video", durationSec: 3, width: 1080, height: 1920 }]);
  importMedia.mockImplementationOnce(async () => { useEditorStore.getState().reset(); return { clips: [], failed: 1 }; });
  const { result } = await renderHook(() => useClipMedia());
  await act(async () => { await result.current.addMedia(); });
  expect(importMedia).toHaveBeenCalled();
  expect(useToast.getState().message).toBeNull();
});

test("Replace refuses a too-short video before importing it, so no file is copied", async () => {
  pick.mockResolvedValueOnce([{ uri: "file:///short.mov", kind: "video", durationSec: 0.05, width: 1080, height: 1920 }]);
  const { result } = await renderHook(() => useClipMedia());
  await act(async () => { await result.current.replaceMedia("a"); });
  expect(importMedia).not.toHaveBeenCalled();
  expect(useToast.getState().message).toBe("That video is too short.");
  expect(useEditorStore.getState().past).toHaveLength(0);
});

describe("addOverlay", () => {
  const video = { uri: "file:///x.mov", kind: "video", durationSec: 3, width: 1080, height: 1920 };
  const state = () => useEditorStore.getState();
  const twoVideoLayers = () => state().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 })], layers: [makeLayer({ id: "l1", sourceDuration: 3 }), makeLayer({ id: "l2", sourceDuration: 3 })] }));

  test("adds the picked video as a layer at the playhead captured at press time, selected, in one undo step", async () => {
    state().seek(1.5);
    pick.mockImplementationOnce(async () => { useEditorStore.getState().seek(3); return [video]; });
    importMedia.mockResolvedValueOnce({ clips: [makeClip({ id: "new", sourceDuration: 3 })], failed: 0 });
    const { result } = await renderHook(() => useClipMedia());
    await act(async () => { await result.current.addOverlay(); });
    expect(pick).toHaveBeenCalledWith({ multiple: false });
    expect(state().project!.layers).toHaveLength(1);
    expect(state().project!.layers[0]).toMatchObject({ id: "new", kind: "video", start: 1.5, transform: { scale: LAYER_LIMITS.defaultScale, x: 0, y: 0 } });
    expect(state().project!.clips).toHaveLength(1);
    expect(state().selectedClipId).toBe("new");
    expect(state().past).toHaveLength(1);
    expect(useToast.getState().message).toBeNull();
  });

  test("a photo becomes a photo layer", async () => {
    pick.mockResolvedValueOnce([{ uri: "file:///x.jpg", kind: "photo", durationSec: 0, width: 1080, height: 1920 }]);
    importMedia.mockResolvedValueOnce({ clips: [makePhotoClip({ id: "ph" })], failed: 0 });
    const { result } = await renderHook(() => useClipMedia());
    await act(async () => { await result.current.addOverlay(); });
    expect(state().project!.layers[0]).toMatchObject({ id: "ph", kind: "photo", start: 0 });
    expect(state().selectedClipId).toBe("ph");
  });

  test("at the layer limit it toasts without opening the picker", async () => {
    state().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 })], layers: Array.from({ length: LAYER_LIMITS.max }, (_, i) => ({ ...makePhotoClip({ id: `l${i}` }), start: 0 })) }));
    const { result } = await renderHook(() => useClipMedia());
    await act(async () => { await result.current.addOverlay(); });
    expect(pick).not.toHaveBeenCalled();
    expect(useToast.getState().message).toBe("You've reached the layer limit.");
    expect(state().past).toHaveLength(0);
  });

  test("a third video layer at the same time is refused before importing", async () => {
    twoVideoLayers();
    state().seek(1);
    pick.mockResolvedValueOnce([video]);
    const { result } = await renderHook(() => useClipMedia());
    await act(async () => { await result.current.addOverlay(); });
    expect(importMedia).not.toHaveBeenCalled();
    expect(useToast.getState().message).toBe("Only two video layers can play at the same time.");
    expect(state().project!.layers).toHaveLength(2);
    expect(state().past).toHaveLength(0);
  });

  test("the imported clip is checked again: an overlap found only after import still toasts", async () => {
    twoVideoLayers();
    pick.mockResolvedValueOnce([{ ...video, durationSec: 0 }]);
    importMedia.mockResolvedValueOnce({ clips: [makeClip({ id: "new", sourceDuration: 3 })], failed: 0 });
    const { result } = await renderHook(() => useClipMedia());
    await act(async () => { await result.current.addOverlay(); });
    expect(useToast.getState().message).toBe("Only two video layers can play at the same time.");
    expect(state().project!.layers).toHaveLength(2);
  });

  test("a failed import toasts; a cancelled pick and a project without clips do nothing", async () => {
    pick.mockResolvedValueOnce([video]);
    importMedia.mockResolvedValueOnce({ clips: [], failed: 1 });
    const { result } = await renderHook(() => useClipMedia());
    await act(async () => { await result.current.addOverlay(); });
    expect(useToast.getState().message).toBe("Couldn't add that item.");
    useToast.getState().clear();
    pick.mockResolvedValueOnce(null);
    await act(async () => { await result.current.addOverlay(); });
    expect(state().past).toHaveLength(0);
    await act(async () => { state().setProject(makeProject()); });
    pick.mockClear();
    await act(async () => { await result.current.addOverlay(); });
    expect(pick).not.toHaveBeenCalled();
    expect(useToast.getState().message).toBeNull();
  });

  test("the project closed while importing: nothing is added and nothing is said", async () => {
    pick.mockResolvedValueOnce([video]);
    importMedia.mockImplementationOnce(async () => { useEditorStore.getState().reset(); return { clips: [makeClip({ id: "new", sourceDuration: 3 })], failed: 0 }; });
    const { result } = await renderHook(() => useClipMedia());
    await act(async () => { await result.current.addOverlay(); });
    expect(state().project).toBeNull();
    expect(useToast.getState().message).toBeNull();
  });

  test("shares the busy lock with add and replace", async () => {
    let resolve: (v: unknown) => void = () => {};
    pick.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    const { result } = await renderHook(() => useClipMedia());
    let first: Promise<void> = Promise.resolve();
    await act(async () => { first = result.current.addOverlay(); });
    expect(result.current.busy).toBe(true);
    await act(async () => { await result.current.addOverlay(); await result.current.addMedia(); });
    expect(pick).toHaveBeenCalledTimes(1);
    await act(async () => { resolve(null); await first; });
    expect(result.current.busy).toBe(false);
  });
});

describe("Replace on a layer", () => {
  const bigVideo = { uri: "file:///n.mov", kind: "video", durationSec: 9, width: 1920, height: 1080 };

  test("swaps the layer's media in one undo step and keeps it selected", async () => {
    useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 })], layers: [makeLayer({ id: "L", sourceDuration: 3, start: 1 })] }));
    pick.mockResolvedValueOnce([bigVideo]);
    importMedia.mockResolvedValueOnce({ clips: [makeClip({ id: "imp", sourceDuration: 9, sourceUri: "file:///p/imp.mov", width: 1920, height: 1080 })], failed: 0 });
    const { result } = await renderHook(() => useClipMedia());
    await act(async () => { await result.current.replaceMedia("L"); });
    const s = useEditorStore.getState();
    expect(s.project!.layers[0]).toMatchObject({ id: "L", start: 1, sourceUri: "file:///p/imp.mov", sourceDuration: 9 });
    expect(s.selectedClipId).toBe("L");
    expect(s.past).toHaveLength(1);
  });

  test("a photo layer replaced by a video that would be the third video at once is refused with the layer message", async () => {
    useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 })],
      layers: [makeLayer({ id: "l1", sourceDuration: 3 }), makeLayer({ id: "l2", sourceDuration: 3 }), { ...makePhotoClip({ id: "P" }), start: 0 }] }));
    pick.mockResolvedValueOnce([bigVideo]);
    const { result } = await renderHook(() => useClipMedia());
    await act(async () => { await result.current.replaceMedia("P"); });
    expect(importMedia).not.toHaveBeenCalled();
    expect(useToast.getState().message).toBe("Only two video layers can play at the same time.");
    expect(useEditorStore.getState().project!.layers[2].kind).toBe("photo");
  });
});
