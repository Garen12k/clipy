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
  isSteadyAvailable: jest.fn(() => true),
  isSteadyCancelled: jest.requireActual("@/modules/clipy-video").isSteadyCancelled,
}));
jest.mock("@/src/editor/soundRenders", () => ({ ensureSound: jest.fn(async (_p: string, uri: string) => `${uri}.copy`) }));
jest.mock("@/src/editor/cutoutRenders", () => ({
  cutoutDir: (id: string) => `file:///doc/projects/${id}/cutout`,
  ensureCutout: jest.fn(async (_p: string, need: { name: string }) => `file:///doc/projects/p1/cutout/${need.name}`),
  isNoPerson: (m: string) => m.includes("cutout person:"),
}));
jest.mock("@/src/editor/steadyRenders", () => ({
  steadyDir: (id: string) => `file:///doc/projects/${id}/steady`,
  ensureSteady: jest.fn(async (_p: string, need: { name: string }) => `file:///doc/projects/p1/steady/${need.name}`),
}));
jest.mock("@/src/projects/expoFs", () => ({
  expoFs: { cacheDir: "file:///cache/", freeBytes: jest.fn(async () => 1e12), mkdir: async () => {}, list: jest.fn(async () => []) },
}));
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-10T10:00:00.000Z" }));
import { addExportListener, exportTimeline, isSteadyAvailable, toExportClip, toExportLayer } from "@/modules/clipy-video";
import { ensureCutout } from "@/src/editor/cutoutRenders";
import { steadyBytes } from "@/src/editor/model/steady";
import { DEFAULT_EXPORT_SETTINGS, makeClip, makeLayer, makeProject } from "@/src/editor/model/types";
import { useCutoutFiles } from "@/src/editor/cutoutFiles";
import { useSteadyFiles } from "@/src/editor/steadyFiles";
import { ensureSteady } from "@/src/editor/steadyRenders";
import { expoFs } from "@/src/projects/expoFs";
import { estimateBytes } from "../estimate";
import { useExport } from "../useExport";

const DIR = "file:///doc/projects/p1/steady";
const steady = makeClip({ id: "a", sourceDuration: 8, sourceUri: "file:///media/a.mp4", width: 1080, height: 1920, stabilize: "medium" });
const plain = makeClip({ id: "b", sourceDuration: 6, sourceUri: "file:///media/b.mp4" });
const oldSlow = makeClip({ id: "s", sourceDuration: 6, sourceUri: "file:///media/s.mp4", speed: 0.5 });                // slowed, no switch: as every old project
const cut = makeClip({ id: "c", sourceDuration: 6, sourceUri: "file:///media/c.mp4", cutout: true });
const layer = makeLayer({ id: "L", sourceDuration: 5, sourceUri: "file:///media/l.mp4", speed: 0.25, smooth: true, start: 1 });
const sent = () => jest.mocked(exportTimeline).mock.calls[0][0];

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(isSteadyAvailable).mockReturnValue(true);
  jest.mocked(expoFs.freeBytes).mockResolvedValue(1e12);
  useSteadyFiles.setState({ files: {} });
  useCutoutFiles.setState({ files: {} });
});

describe("PROOF: a project without the two settings is exported exactly as before (never edited to make a change pass)", () => {
  test("no new call is made, and every clip and layer is what toExportClip / toExportLayer gives", async () => {
    const project = makeProject({ id: "p1", clips: [plain, oldSlow], layers: [makeLayer({ id: "K", sourceDuration: 5, sourceUri: "file:///media/k.mp4", speed: 0.5, start: 1 })] });
    const { result } = await renderHook(() => useExport(project, []));
    await act(async () => { await result.current.start(1080); });
    expect(isSteadyAvailable).not.toHaveBeenCalled();
    expect(ensureSteady).not.toHaveBeenCalled();
    expect(expoFs.list).not.toHaveBeenCalled();
    expect(sent().clips).toEqual(project.clips.map((c) => toExportClip(c)));
    expect(sent().layers).toEqual(project.layers.map((l) => toExportLayer(l)));
    expect(sent().clips[1].sourceUri).toBe("file:///media/s.mp4");
    expect(result.current.state.status).toBe("exporting");
  });

  test("a project with only Remove background is exported as the cut-out batch left it", async () => {
    const project = makeProject({ id: "p1", clips: [cut, plain] });
    const { result } = await renderHook(() => useExport(project, []));
    await act(async () => { await result.current.start(1080); });
    expect(isSteadyAvailable).not.toHaveBeenCalled();
    expect(ensureSteady).not.toHaveBeenCalled();
    expect(sent().clips).toEqual([{ ...toExportClip(cut), sourceUri: "file:///doc/projects/p1/cutout/c-c1-0-6000.mov", opacity: 0.999 }, toExportClip(plain)]);
  });
});

test("clips and layers with a setting are exported from their copies — another file, nothing else; the others as they are", async () => {
  const project = makeProject({ id: "p1", clips: [steady, plain, cut], layers: [layer] });
  const { result } = await renderHook(() => useExport(project, []));
  await act(async () => { await result.current.start(1080); });
  expect(jest.mocked(ensureSteady).mock.calls.map((c) => c[1].name)).toEqual(["a-s1-2-0-0-8000.mov", "l-s1-0-120-0-5000.mov"]);
  expect(jest.mocked(ensureCutout).mock.calls.map((c) => c[1].name)).toEqual(["c-c1-0-6000.mov"]);
  expect(sent().clips[0]).toEqual({ ...toExportClip(steady), sourceUri: `${DIR}/a-s1-2-0-0-8000.mov` });
  expect(sent().clips[1]).toEqual(toExportClip(plain));
  expect(sent().clips[2]).toMatchObject({ sourceUri: "file:///doc/projects/p1/cutout/c-c1-0-6000.mov", opacity: 0.999 });
  expect(sent().layers).toEqual([{ ...toExportLayer(layer), sourceUri: `${DIR}/l-s1-0-120-0-5000.mov` }]);
  expect(sent().layers[0].speed).toBe(0.25);                            // the export's own retiming is untouched
});

test("preparing the copies takes 30 % of the progress, before the video export's share", async () => {
  let progress: ((f: number) => void) | undefined;
  let finish: () => void = () => {};
  jest.mocked(ensureSteady).mockImplementationOnce((_p, need, onProgress) => new Promise<string>((resolve) => { progress = onProgress; finish = () => resolve(`${DIR}/${need.name}`); }));
  const project = makeProject({ id: "p1", clips: [steady, plain] });
  const { result } = await renderHook(() => useExport(project, []));
  let started: Promise<void> = Promise.resolve();
  await act(async () => { started = result.current.start(1080); await new Promise((r) => setTimeout(r, 0)); });
  await act(async () => { progress?.(0.5); });
  expect(result.current.state).toMatchObject({ status: "exporting", progress: 0.15 });
  await act(async () => { finish(); await started; });
  const emit = jest.mocked(addExportListener).mock.calls[0][0];
  await act(async () => { emit({ jobId: "job1", type: "progress", progress: 0.5 }); });
  expect(result.current.state.progress).toBeCloseTo(0.3 + 0.7 * 0.5, 9);
});

test("the copies still to be made are counted in the free-space check; on a build without the tool the clips go out as they are", async () => {
  const project = makeProject({ id: "p1", clips: [steady] });
  const video = estimateBytes(8, 1080, DEFAULT_EXPORT_SETTINGS) * 2;
  jest.mocked(expoFs.freeBytes).mockResolvedValue(video + steadyBytes(steady, { level: 2, grid: 0 }) - 1);
  const { result } = await renderHook(() => useExport(project, []));
  await act(async () => { await result.current.start(1080); });
  expect(result.current.state).toMatchObject({ status: "error", message: "Not enough free space on this iPhone for the export." });
  jest.mocked(expoFs.freeBytes).mockResolvedValue(1e12);
  jest.mocked(isSteadyAvailable).mockReturnValue(false);
  await act(async () => { await result.current.start(1080); });
  expect(ensureSteady).not.toHaveBeenCalled();
  expect(sent().clips).toEqual([toExportClip(steady)]);
});

test("a copy that cannot be made stops the export with its reason", async () => {
  jest.mocked(ensureSteady).mockRejectedValueOnce(new Error("steady writer: boom"));
  const { result } = await renderHook(() => useExport(makeProject({ id: "p1", clips: [steady] }), []));
  await act(async () => { await result.current.start(1080); });
  expect(result.current.state).toMatchObject({ status: "error", message: "Could not prepare a clip for the export: steady writer: boom" });
  expect(exportTimeline).not.toHaveBeenCalled();
});
