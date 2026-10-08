import { act, renderHook } from "@testing-library/react-native";
jest.mock("@/modules/clipy-video", () => ({
  isNativeAvailable: () => true,
  exportTimeline: jest.fn(async () => "job1"),
  addExportListener: jest.fn(() => ({ remove() {} })),
  cancelExport: jest.fn(),
  toExportOverlay: jest.requireActual("@/modules/clipy-video").toExportOverlay,
  toExportClip: jest.requireActual("@/modules/clipy-video").toExportClip,
  toExportEffect: jest.requireActual("@/modules/clipy-video").toExportEffect,
  toExportLayer: jest.requireActual("@/modules/clipy-video").toExportLayer,
  toExportAudioTrack: jest.requireActual("@/modules/clipy-video").toExportAudioTrack,
  isSoundAvailable: jest.fn(() => true),
  isCutoutAvailable: jest.fn(() => true),
  isCutoutCancelled: jest.requireActual("@/modules/clipy-video").isCutoutCancelled,
}));
jest.mock("@/src/editor/soundRenders", () => ({ ensureSound: jest.fn(async (_p: string, uri: string) => `${uri}.copy`) }));
jest.mock("@/src/editor/cutoutRenders", () => ({
  cutoutDir: (id: string) => `file:///doc/projects/${id}/cutout`,
  ensureCutout: jest.fn(async (_p: string, need: { name: string }) => `file:///doc/projects/p1/cutout/${need.name}`),
  isNoPerson: (m: string) => m.includes("cutout person:"),
}));
jest.mock("@/src/projects/expoFs", () => ({
  expoFs: { cacheDir: "file:///cache/", freeBytes: async () => 1e12, mkdir: async () => {}, list: async () => [] },
}));
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-09T10:00:00.000Z" }));
import { addExportListener, exportTimeline, isCutoutAvailable, toExportClip, toExportLayer } from "@/modules/clipy-video";
import { ensureCutout } from "@/src/editor/cutoutRenders";
import { readFileSync } from "fs";
import { join } from "path";
import { useCutoutFiles } from "@/src/editor/cutoutFiles";
import { makeAudioTrack, makeClip, makeLayer, makeOverlay, makeProject, makeSticker } from "@/src/editor/model/types";
import { CUTOUT_EXPORT } from "../exportCutouts";
import { useExport } from "../useExport";

const DIR = "file:///doc/projects/p1/cutout";
const main = makeClip({ id: "a", sourceDuration: 8, sourceUri: "file:///media/a.mp4", cutout: true });
const other = makeClip({ id: "b", sourceDuration: 6 });
const layer = { ...makeLayer({ id: "L", sourceDuration: 5, sourceUri: "file:///media/l.mp4", start: 1 }), cutout: true as const };
const project = makeProject({ id: "p1", clips: [main, other], layers: [layer] });
const sent = () => jest.mocked(exportTimeline).mock.calls[0][0];

beforeEach(() => { jest.clearAllMocks(); jest.mocked(isCutoutAvailable).mockReturnValue(true); useCutoutFiles.setState({ files: {} }); });

test("clips and layers with Remove background are exported from their copies; the others as they are", async () => {
  const { result } = await renderHook(() => useExport(project, []));
  await act(async () => { await result.current.start(1080); });
  expect(jest.mocked(ensureCutout).mock.calls.map((c) => c[1].name)).toEqual(["a-c1-0-8000.mov", "l-c1-0-5000.mov"]);
  expect(sent().clips).toEqual([{ ...toExportClip(main), sourceUri: `${DIR}/a-c1-0-8000.mov`, opacity: 0.999 }, toExportClip(other)]);
  expect(sent().layers).toEqual([{ ...toExportLayer(layer), sourceUri: `${DIR}/l-c1-0-5000.mov` }]);
});

test("preparing the copies takes the first 30 % of the progress, the video export the rest", async () => {
  let progress: ((f: number) => void) | undefined;
  let finish: (uri: string) => void = () => {};
  jest.mocked(ensureCutout).mockImplementationOnce((_p, need, onProgress) => new Promise<string>((resolve) => { progress = onProgress; finish = () => resolve(`${DIR}/${need.name}`); }));
  const { result } = await renderHook(() => useExport(project, []));
  let started: Promise<void> = Promise.resolve();
  await act(async () => { started = result.current.start(1080); await new Promise((r) => setTimeout(r, 0)); });
  await act(async () => { progress?.(0.5); });
  expect(result.current.state).toMatchObject({ status: "exporting", progress: 0.3 * 0.25 });   // half of the first of two copies
  await act(async () => { finish(""); await started; });
  const emit = jest.mocked(addExportListener).mock.calls[0][0];
  await act(async () => { emit({ jobId: "job1", type: "progress", progress: 0.5 }); });
  expect(result.current.state.progress).toBeCloseTo(0.3 + 0.7 * 0.5, 9);
});

test("a copy that cannot be made stops the export with its reason; Cancel while preparing goes idle and never exports", async () => {
  jest.mocked(ensureCutout).mockRejectedValueOnce(new Error("cutout person: no person found"));
  const first = await renderHook(() => useExport(project, []));
  await act(async () => { await first.result.current.start(1080); });
  expect(first.result.current.state).toEqual({ status: "error", progress: 0, message: CUTOUT_EXPORT.noPerson });
  expect(exportTimeline).not.toHaveBeenCalled();
  jest.clearAllMocks();
  let finish: () => void = () => {};
  jest.mocked(ensureCutout).mockImplementationOnce((_p, need) => new Promise<string>((resolve) => { finish = () => resolve(`${DIR}/${need.name}`); }));
  const second = await renderHook(() => useExport(project, []));
  let started: Promise<void> = Promise.resolve();
  await act(async () => { started = second.result.current.start(1080); await new Promise((r) => setTimeout(r, 0)); });
  await act(async () => { second.result.current.cancel(); });
  expect(second.result.current.state).toEqual({ status: "idle", progress: 0 });
  await act(async () => { finish(); await started; });
  expect(exportTimeline).not.toHaveBeenCalled();
});

test("on a build without the tool nothing is prepared and the clips go out as they are", async () => {
  jest.mocked(isCutoutAvailable).mockReturnValue(false);
  const { result } = await renderHook(() => useExport(project, []));
  await act(async () => { await result.current.start(1080); });
  expect(ensureCutout).not.toHaveBeenCalled();
  expect(sent().clips).toEqual([toExportClip(main), toExportClip(other)]);
});

test("a project without the switch asks for nothing, and its progress is the export's own", async () => {
  const { result } = await renderHook(() => useExport(makeProject({ id: "p1", clips: [other] }), []));
  await act(async () => { await result.current.start(1080); });
  expect(ensureCutout).not.toHaveBeenCalled();
  const emit = jest.mocked(addExportListener).mock.calls[0][0];
  await act(async () => { emit({ jobId: "job1", type: "progress", progress: 0.5 }); });
  expect(result.current.state.progress).toBe(0.5);
});

describe("PROOF: a project without the switch exports exactly as it did before Remove background, on a build that has the tool", () => {
  // The request pinned in useExport.test.ts (written before the sound tools, never edited) — read from that file, so there is
  // one literal — must come out of this build byte for byte, with the same calls in the same order, although the tool is there.
  const source = readFileSync(join(__dirname, "useExport.test.ts"), "utf8");
  const literal = /const PINNED = ("(?:[^"\\]|\\.)*");/.exec(source);
  const a = makeClip({ id: "a", sourceDuration: 4, volume: 1.5, muted: true, speed: 2, filter: "warm", transitionOut: { type: "fade", duration: 0.5 } });
  const b = makeClip({ id: "b", sourceDuration: 6 });
  const c = makeClip({ id: "c", sourceDuration: 5 });
  const pinnedProject = makeProject({
    id: "p1", clips: [a, b, c],
    overlays: [makeOverlay({ id: "o", text: "Hey", fontId: "anton", start: 0, end: 2 }), makeSticker({ id: "s", emoji: "⭐", shape: null, start: 0, end: 2 })],
    audioTracks: [makeAudioTrack({ id: "m", sourceUri: "file:///media/m.m4a", sourceDuration: 9 })],
  });

  test("the pinned request, byte for byte; the folder is not read and no copy is asked for", async () => {
    expect(literal).not.toBeNull();
    const PINNED: string = JSON.parse(literal ? literal[1] : "\"\"");
    const order: string[] = [];
    const fs = jest.requireMock("@/src/projects/expoFs").expoFs;
    const orig = { freeBytes: fs.freeBytes, mkdir: fs.mkdir, list: fs.list };
    fs.freeBytes = async () => { order.push("freeBytes"); return 1e12; };
    fs.mkdir = async (dir: string) => { order.push(`mkdir ${dir}`); };
    fs.list = async (dir: string) => { order.push(`list ${dir}`); return []; };
    jest.mocked(exportTimeline).mockImplementationOnce(async () => { order.push("exportTimeline"); return "job1"; });
    const now = jest.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    try {
      const { result } = await renderHook(() => useExport(pinnedProject, []));
      await act(async () => { await result.current.start(1080); });
      expect(order).toEqual(["freeBytes", "mkdir file:///cache/exports", "exportTimeline"]);
      expect(JSON.stringify(sent())).toBe(PINNED);
      expect(ensureCutout).not.toHaveBeenCalled();
      expect(result.current.state).toEqual({ status: "exporting", progress: 0 });
    } finally { fs.freeBytes = orig.freeBytes; fs.mkdir = orig.mkdir; fs.list = orig.list; now.mockRestore(); }
  });

  test("switching it on for one clip changes that clip's file and opacity in the request, and nothing else", async () => {
    const now = jest.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    try {
      const withLayer = { ...pinnedProject, layers: [makeLayer({ id: "L", sourceDuration: 5, sourceUri: "file:///media/l.mp4", start: 1 })] };
      const first = await renderHook(() => useExport(withLayer, []));
      await act(async () => { await first.result.current.start(1080); });
      const before = sent();
      jest.clearAllMocks();
      const on = { ...withLayer, clips: [a, { ...b, cutout: true as const }, c] };
      const second = await renderHook(() => useExport(on, []));
      await act(async () => { await second.result.current.start(1080); });
      const after = sent();
      expect(after).toEqual({ ...before, clips: [before.clips[0], { ...before.clips[1], sourceUri: `${DIR}/b-c1-0-6000.mov`, opacity: 0.999 }, before.clips[2]] });
      expect(JSON.stringify({ ...after, clips: [] })).toBe(JSON.stringify({ ...before, clips: [] }));
    } finally { now.mockRestore(); }
  });

  test("a clip that plays backwards with the switch still stored goes out as it is, and the progress is the export's own", async () => {
    const back = { ...makeClip({ id: "r", sourceDuration: 6, reversed: true }), cutout: true as const };
    const { result } = await renderHook(() => useExport(makeProject({ id: "p1", clips: [back] }), []));
    await act(async () => { await result.current.start(1080); });
    expect(ensureCutout).not.toHaveBeenCalled();
    expect(sent().clips).toEqual([toExportClip(back)]);
    const emit = jest.mocked(addExportListener).mock.calls[0][0];
    await act(async () => { emit({ jobId: "job1", type: "progress", progress: 0.5 }); });
    expect(result.current.state.progress).toBe(0.5);
  });
});

test("a clip over the limit stops the export before any copy is made", async () => {
  const long = makeClip({ id: "l", sourceDuration: 300, cutout: true });
  const { result } = await renderHook(() => useExport(makeProject({ id: "p1", clips: [main, long] }), []));
  await act(async () => { await result.current.start(1080); });
  expect(result.current.state).toEqual({ status: "error", progress: 0, message: CUTOUT_EXPORT.tooLong });
  expect(ensureCutout).not.toHaveBeenCalled();
  expect(exportTimeline).not.toHaveBeenCalled();
});

test("a clip whose file is missing, and a layer that starts after the end, are neither prepared nor sent", async () => {
  const late = { ...makeLayer({ id: "late", sourceDuration: 5, sourceUri: "file:///media/late.mp4", start: 99 }), cutout: true as const };
  const gone = makeClip({ id: "g", sourceDuration: 3, sourceUri: "file:///media/gone.mp4", cutout: true });
  const { result } = await renderHook(() => useExport(makeProject({ id: "p1", clips: [main, gone], layers: [late] }), ["file:///media/gone.mp4"]));
  await act(async () => { await result.current.start(1080); });
  expect(jest.mocked(ensureCutout).mock.calls.map((c) => c[1].name)).toEqual(["a-c1-0-8000.mov"]);
  expect(sent().clips.map((c) => c.sourceUri)).toEqual([`${DIR}/a-c1-0-8000.mov`]);
  expect(sent().layers).toEqual([]);
});

test("with changed sounds too, the sounds take the first tenth, the copies the next 30 %, the video export the rest", async () => {
  const voiced = { ...makeAudioTrack({ id: "v", sourceUri: "file:///media/v.m4a", sourceDuration: 6, kind: "voice" as const }),
    sound: { voice: "deep" as const, strength: 0.5, pitch: 0, eq: null, level: false } };
  let progress: ((f: number) => void) | undefined;
  let finish: () => void = () => {};
  jest.mocked(ensureCutout).mockImplementationOnce((_p, need, onProgress) => new Promise<string>((resolve) => { progress = onProgress; finish = () => resolve(`${DIR}/${need.name}`); }));
  const { result } = await renderHook(() => useExport(makeProject({ id: "p1", clips: [main], audioTracks: [voiced] }), []));
  let started: Promise<void> = Promise.resolve();
  await act(async () => { started = result.current.start(1080); await new Promise((r) => setTimeout(r, 0)); });
  expect(result.current.state.progress).toBeCloseTo(0.1, 9);
  await act(async () => { progress?.(0.5); });
  expect(result.current.state.progress).toBeCloseTo(0.1 + 0.3 * 0.5, 9);
  await act(async () => { finish(); await started; });
  expect(sent().audioTracks.map((t) => t.sourceUri)).toEqual(["file:///media/v.m4a.copy"]);
  const emit = jest.mocked(addExportListener).mock.calls[0][0];
  await act(async () => { emit({ jobId: "job1", type: "progress", progress: 0.5 }); });
  expect(result.current.state.progress).toBeCloseTo(0.4 + 0.6 * 0.5, 9);
});

test("an export after one with cut-outs, of a project without: the progress is the export's own again", async () => {
  const view = await renderHook(({ p }: { p: typeof project }) => useExport(p, []), { initialProps: { p: project } });
  await act(async () => { await view.result.current.start(1080); });
  await view.rerender({ p: makeProject({ id: "p1", clips: [other] }) });
  await act(async () => { await view.result.current.start(1080); });
  const emit = jest.mocked(addExportListener).mock.calls[0][0];
  await act(async () => { emit({ jobId: "job1", type: "progress", progress: 0.5 }); });
  expect(view.result.current.state.progress).toBe(0.5);
});
