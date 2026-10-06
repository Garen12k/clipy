jest.mock("@/src/projects/pickMedia", () => ({ pickMedia: jest.fn() }));
jest.mock("@/src/projects", () => ({ storage: { importMedia: jest.fn() } }));
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@/src/lib/id", () => { let n = 0; return { newId: () => `id${++n}` }; });
import { act, renderHook } from "@testing-library/react-native";
import { addCollage } from "@/src/editor/model/collageOps";
import { LAYER_LIMITS, makeClip, makeLayer, makePhotoClip, makeProject, type CollageLayoutId } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { storage } from "@/src/projects";
import { pickMedia } from "@/src/projects/pickMedia";
import { useToast } from "@/src/ui/Toast";
import { openStrip, useToolStrip } from "../toolStrip";
import { selectionKey } from "../toolbarContext";
import { clipDuration } from "../model/timeline";
import { newLayerStart, useClipMedia } from "../useClipMedia";

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

  test.each([[3, 2], [4, 2], [2.5, 2], [1.9, 1.9]])("a playhead within 2 s of the end (%s of 4 s) starts the layer at %s, so it is visible", async (playhead, start) => {
    state().seek(playhead);
    pick.mockResolvedValueOnce([video]);
    importMedia.mockResolvedValueOnce({ clips: [makeClip({ id: "new", sourceDuration: 3 })], failed: 0 });
    const { result } = await renderHook(() => useClipMedia());
    await act(async () => { await result.current.addOverlay(); });
    expect(state().project!.layers[0]).toMatchObject({ id: "new", start });
  });

  test("a project shorter than 2 s: the layer starts at 0", async () => {
    state().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 1.5 })] }));
    state().seek(1.5);
    pick.mockResolvedValueOnce([video]);
    importMedia.mockResolvedValueOnce({ clips: [makeClip({ id: "new", sourceDuration: 3 })], failed: 0 });
    const { result } = await renderHook(() => useClipMedia());
    await act(async () => { await result.current.addOverlay(); });
    expect(state().project!.layers[0]).toMatchObject({ id: "new", start: 0 });
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

describe("makeCollage", () => {
  const state = () => useEditorStore.getState();
  const shot = (n: number) => ({ uri: `file:///p${n}.jpg`, kind: "photo", durationSec: 0, width: 1080, height: 1920 });
  const film = (n: number, seconds = 3) => ({ uri: `file:///v${n}.mov`, kind: "video", durationSec: seconds, width: 1920, height: 1080 });
  const run = async (layout: CollageLayoutId) => {
    const { result } = await renderHook(() => useClipMedia());
    await act(async () => { await result.current.makeCollage(layout); });
  };

  test("adds one layer per cell at the playhead captured at press time, in one undo step, and selects the first cell", async () => {
    state().seek(1);
    pick.mockImplementationOnce(async () => { state().seek(3); return [shot(1), shot(2)]; });
    importMedia.mockResolvedValueOnce({ clips: [makePhotoClip({ id: "n1" }), makePhotoClip({ id: "n2" })], failed: 0 });
    await run("sideBySide");
    expect(pick).toHaveBeenCalledWith({ limit: 2 });
    expect(state().project!.layers.map((l) => [l.id, l.start, l.collage?.cell, l.collage?.layout])).toEqual([["n1", 1, 0, "sideBySide"], ["n2", 1, 1, "sideBySide"]]);
    expect(new Set(state().project!.layers.map((l) => l.collage!.group)).size).toBe(1);
    expect(state().project!.layers[0].collage!.group.length).toBeGreaterThan(0);
    expect(state().past).toHaveLength(1);
    expect(state().selectedClipId).toBe("n1");
    expect(useToast.getState().message).toBeNull();
  });

  test("refused before the picker opens when the layout needs more layers than are free", async () => {
    state().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 })], layers: Array.from({ length: 6 }, (_, i) => ({ ...makePhotoClip({ id: `l${i}` }), start: 0 })) }));
    await run("grid4");
    expect(pick).not.toHaveBeenCalled();
    expect(useToast.getState().message).toBe("Not enough room: this layout adds 4 layers and there is room for 2.");
  });

  test("refused before anything is copied: too few picked, three videos, a third video on screen", async () => {
    pick.mockResolvedValueOnce([shot(1), shot(2)]);
    await run("row3");
    expect(useToast.getState().message).toBe("This layout needs 3 photos or videos — you picked 2.");
    pick.mockResolvedValueOnce([film(1), film(2), film(3)]);
    await run("row3");
    expect(useToast.getState().message).toBe("A collage can hold 2 videos at most. Pick photos for the other cells.");
    state().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 })], layers: [makeLayer({ id: "o1", sourceDuration: 3 }), makeLayer({ id: "o2", sourceDuration: 3 })] }));
    pick.mockResolvedValueOnce([film(1), shot(2)]);
    await run("stacked");
    expect(useToast.getState().message).toBe("Only two video layers can play at the same time.");
    expect(importMedia).not.toHaveBeenCalled();
    expect(state().past).toHaveLength(0);
  });

  test("a cancelled pick, a partly failed import and a project closed meanwhile add nothing", async () => {
    pick.mockResolvedValueOnce(null);
    await run("sideBySide");
    expect(useToast.getState().message).toBeNull();
    pick.mockResolvedValueOnce([shot(1), shot(2)]);
    importMedia.mockResolvedValueOnce({ clips: [makePhotoClip({ id: "n1" })], failed: 1 });
    await run("sideBySide");
    expect(useToast.getState().message).toBe("Couldn't add those items.");
    expect(state().project!.layers).toHaveLength(0);
    useToast.getState().clear();
    pick.mockResolvedValueOnce([shot(1), shot(2)]);
    importMedia.mockImplementationOnce(async () => { state().reset(); return { clips: [], failed: 2 }; });
    await run("sideBySide");
    expect(useToast.getState().message).toBeNull();
  });

  test("more picked than the layout has cells: only the first ones are imported and used", async () => {
    pick.mockResolvedValueOnce([shot(1), shot(2), shot(3)]);
    importMedia.mockResolvedValueOnce({ clips: [makePhotoClip({ id: "n1" }), makePhotoClip({ id: "n2" })], failed: 0 });
    await run("stacked");
    expect(importMedia).toHaveBeenCalledWith("p1", [shot(1), shot(2)]);
    expect(state().project!.layers.map((l) => l.id)).toEqual(["n1", "n2"]);
  });

  test("a layout that does not exist: nothing happens, the picker does not open", async () => {
    await run("nope" as CollageLayoutId);
    expect(pick).not.toHaveBeenCalled();
    expect(useToast.getState().message).toBeNull();
    expect(state().past).toHaveLength(0);
  });

  test("the imported clips are checked again: a video found too short only after import adds nothing", async () => {
    pick.mockResolvedValueOnce([{ ...film(1), durationSec: 0 }, shot(2)]);
    importMedia.mockResolvedValueOnce({ clips: [makeClip({ id: "n1", sourceDuration: 0.1 }), makePhotoClip({ id: "n2" })], failed: 0 });
    await run("sideBySide");
    expect(useToast.getState().message).toBe("That video is too short.");
    expect(state().project!.layers).toHaveLength(0);
    expect(state().past).toHaveLength(0);
  });

  test("an empty project: nothing happens, the picker does not open", async () => {
    state().setProject(makeProject());
    await run("sideBySide");
    expect(pick).not.toHaveBeenCalled();
  });
});

test("Replace on a collage cell that is in its place fits the new picture to the cell, in the same undo step", async () => {
  const base = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })] });
  useEditorStore.getState().setProject(addCollage(base, [makePhotoClip({ id: "x1" }), makePhotoClip({ id: "x2" })], "sideBySide", 0, "g"));
  pick.mockResolvedValueOnce([{ uri: "file:///wide.jpg", kind: "photo", durationSec: 0, width: 1920, height: 1080 }]);
  importMedia.mockResolvedValueOnce({ clips: [makePhotoClip({ id: "tmp", width: 1920, height: 1080 })], failed: 0 });
  const { result } = await renderHook(() => useClipMedia());
  await act(async () => { await result.current.replaceMedia("x1"); });
  const s = useEditorStore.getState();
  expect(s.project!.layers[0]).toMatchObject({ id: "x1", width: 1920, height: 1080, crop: { x: 0.420898, y: 0, w: 0.158203, h: 1 }, transform: { scale: 0.5, x: -0.25, y: 0 } });
  expect(s.project!.layers[1].crop).toEqual({ x: 0.25, y: 0, w: 0.5, h: 1 });
  expect(s.past).toHaveLength(1);
});

describe("makeCollage and the open tool", () => {
  const state = () => useEditorStore.getState();
  const shot = (n: number) => ({ uri: `file:///p${n}.jpg`, kind: "photo", durationSec: 0, width: 1080, height: 1920 });
  const setup = () => {
    state().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 })], layers: [{ ...makePhotoClip({ id: "o" }), start: 0 }] }));
    pick.mockResolvedValueOnce([shot(1), shot(2)]);
    importMedia.mockResolvedValueOnce({ clips: [makePhotoClip({ id: "n1" }), makePhotoClip({ id: "n2" })], failed: 0 });
  };
  const run = async () => {
    const { result } = await renderHook(() => useClipMedia());
    await act(async () => { await result.current.makeCollage("sideBySide"); });
  };

  test("the Collage panel still open stays open, now on the new cell", async () => {
    setup();
    state().select("o");
    openStrip("collage");
    await run();
    expect(state().selectedClipId).toBe("n1");
    expect(useToolStrip.getState().open).toEqual({ id: "collage", key: selectionKey(state()) });
  });

  test("another tool opened meanwhile is not re-keyed onto the new cell", async () => {
    setup();
    state().select("o");
    openStrip("collage");
    const { result } = await renderHook(() => useClipMedia());
    pick.mockReset();
    pick.mockImplementationOnce(async () => { openStrip("speed"); return [shot(1), shot(2)]; });
    const keyBefore = useToolStrip.getState().open;
    await act(async () => { await result.current.makeCollage("sideBySide"); });
    const open = useToolStrip.getState().open!;
    expect(open.id).toBe("speed");
    expect(open.key).toBe(keyBefore!.key);
    expect(open.key).not.toBe(selectionKey(state()));
  });

  test("near the end of the project the collage starts where newLayerStart puts it, within the layer rules", async () => {
    state().seek(3.9);
    const expected = newLayerStart(state().project!, 3.9);
    pick.mockResolvedValueOnce([shot(1), shot(2)]);
    importMedia.mockResolvedValueOnce({ clips: [makePhotoClip({ id: "n1" }), makePhotoClip({ id: "n2" })], failed: 0 });
    await run();
    const ls = state().project!.layers;
    expect(expected).toBeCloseTo(2, 5);
    expect(ls.map((l) => l.start)).toEqual([expected, expected]);
    expect(ls.length).toBeLessThanOrEqual(LAYER_LIMITS.max);
    for (const l of ls) expect(clipDuration(l)).toBeGreaterThanOrEqual(LAYER_LIMITS.minDuration);
  });
});
