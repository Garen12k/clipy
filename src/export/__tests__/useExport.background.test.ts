import { act, renderHook } from "@testing-library/react-native";
jest.mock("@/modules/clipy-video", () => ({
  isNativeAvailable: () => true,
  exportTimeline: jest.fn(),
  addExportListener: jest.fn(() => ({ remove() {} })),
  cancelExport: jest.fn(),
  toExportOverlay: jest.requireActual("@/modules/clipy-video").toExportOverlay,
  toExportClip: jest.requireActual("@/modules/clipy-video").toExportClip,
  toExportEffect: jest.requireActual("@/modules/clipy-video").toExportEffect,
  toExportLayer: jest.requireActual("@/modules/clipy-video").toExportLayer,
  toExportAudioTrack: jest.requireActual("@/modules/clipy-video").toExportAudioTrack,
  isSoundAvailable: jest.fn(() => true),
  isCutoutAvailable: jest.fn(() => false),
  isSteadyAvailable: jest.fn(() => false),
}));
jest.mock("@/modules/clipy-video/background", () => ({
  EXPORT_INTERRUPTED: "interrupted",
  isBackgroundExportBuild: jest.fn(() => true),
  backgroundExportSupport: jest.fn(() => ({ os: "27.0", continued: true, gpu: false })),
  beginBackgroundExport: jest.fn(async () => ({ grace: true, continued: true, reason: "" })),
  reportBackgroundExport: jest.fn(),
  endBackgroundExport: jest.fn(),
  addBackgroundExportListener: jest.fn(() => ({ remove() {} })),
}));
jest.mock("@/src/editor/soundRenders", () => ({ ensureSound: jest.fn(async (_p: string, uri: string) => `${uri}.copy`) }));
jest.mock("@/src/editor/cutoutRenders", () => ({ cutoutDir: () => "", ensureCutout: jest.fn(), isNoPerson: () => false }));
jest.mock("@/src/projects/expoFs", () => ({ expoFs: { cacheDir: "file:///cache/", freeBytes: async () => 1e12, mkdir: async () => {} } }));
jest.mock("@/src/lib/id", () => ({ newId: () => "run-1" }));
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-10T10:00:00.000Z" }));
jest.mock("../exportAwake", () => ({ useStayAwake: jest.fn() }));
import { AppState, type AppStateStatus } from "react-native";
import { addExportListener, cancelExport, exportTimeline, type ExportEvent } from "@/modules/clipy-video";
import { addBackgroundExportListener, beginBackgroundExport, endBackgroundExport, isBackgroundExportBuild, reportBackgroundExport, type BackgroundExportEvent } from "@/modules/clipy-video/background";
import { ensureSound } from "@/src/editor/soundRenders";
import { makeAudioTrack, makeClip, makeProject, NO_SOUND } from "@/src/editor/model/types";
import { EXPORT_PAUSED, EXPORT_RESTARTED } from "../backgroundExport";
import { useStayAwake } from "../exportAwake";
import { EXPORT_STALL_MS, EXPORT_STUCK, MAX_RESTARTS, useExport } from "../useExport";

const project = makeProject({ id: "p1", name: "Beach day", clips: [makeClip({ id: "a", sourceDuration: 4 })] });
const withSound = makeProject({ id: "p2", name: "Beach day", clips: [makeClip({ id: "a", sourceDuration: 4 })], audioTracks: [makeAudioTrack({ id: "m", sourceUri: "file:///media/m.m4a", sourceDuration: 9, sound: { ...NO_SOUND, voice: "deep" } })] });
const timeline = exportTimeline as jest.Mock;
const build = isBackgroundExportBuild as jest.Mock;
const ended = endBackgroundExport as jest.Mock;

/** The phone: where the app is, and telling the hook that it changed. */
let appListeners: ((s: AppStateStatus) => void)[] = [];
const app = (now: AppStateStatus, tell = true) => {
  Object.defineProperty(AppState, "currentState", { configurable: true, get: () => now });
  if (tell) for (const cb of [...appListeners]) cb(now);
};
const emit = (e: ExportEvent) => act(async () => { for (const call of (addExportListener as jest.Mock).mock.calls) (call[0] as (e: ExportEvent) => void)(e); });
const systemSays = (e: BackgroundExportEvent) => act(async () => { for (const call of (addBackgroundExportListener as jest.Mock).mock.calls) (call[0] as (e: BackgroundExportEvent) => void)(e); });
let jobs = 0;
let logged: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  jobs = 0;
  appListeners = [];
  build.mockReturnValue(true);
  timeline.mockImplementation(async () => `job${++jobs}`);
  jest.spyOn(AppState, "addEventListener").mockImplementation(((_: string, cb: (s: AppStateStatus) => void) => {
    appListeners.push(cb);
    return { remove: () => { appListeners = appListeners.filter((l) => l !== cb); } };
  }) as never);
  app("active", false);
  logged = jest.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); app("active", false); });

test("an INTERRUPTED export is not shown as a failure: it starts again by itself, once, from 0, with its one sentence", async () => {
  const { result } = await renderHook(() => useExport(project, []));
  await act(() => result.current.start(1080));
  await emit({ jobId: "job1", type: "progress", progress: 0.6 });
  expect(result.current.state).toEqual({ status: "exporting", progress: 0.6 });
  await emit({ jobId: "job1", type: "error", code: "interrupted", message: "export interrupted: The operation could not be completed [AVFoundationErrorDomain -11847]" });
  expect(timeline).toHaveBeenCalledTimes(2);                                   // started again, without a tap
  expect(timeline.mock.calls[1][0]).toEqual({ ...timeline.mock.calls[0][0], outputPath: expect.any(String) });   // the same request
  expect(result.current.state).toEqual({ status: "exporting", progress: 0, note: EXPORT_RESTARTED });
  expect(EXPORT_RESTARTED).toBe("Clipy was in the background, so the export started again.");
  await emit({ jobId: "job1", type: "progress", progress: 0.9 });               // the old job says nothing any more
  expect(result.current.state.progress).toBe(0);
  await emit({ jobId: "job2", type: "done", fileUri: "file:///cache/out.mp4" });
  expect(result.current.state).toEqual({ status: "done", progress: 1, fileUri: "file:///cache/out.mp4" });
  expect(ended).toHaveBeenCalledTimes(1);                                      // one run for the tap, restarts included
  expect(ended).toHaveBeenCalledWith("run-1", true);
});

test("no restart loop: after MAX_RESTARTS the interruption is the error it is, with its message and Try Again", async () => {
  expect(MAX_RESTARTS).toBe(2);
  const { result } = await renderHook(() => useExport(project, []));
  await act(() => result.current.start(1080));
  await emit({ jobId: "job1", type: "error", code: "interrupted", message: "export interrupted: one" });
  await emit({ jobId: "job2", type: "error", code: "interrupted", message: "export interrupted: two" });
  expect(timeline).toHaveBeenCalledTimes(3);
  expect(result.current.state.status).toBe("exporting");
  await emit({ jobId: "job3", type: "error", code: "interrupted", message: "export interrupted: three" });
  expect(timeline).toHaveBeenCalledTimes(3);
  expect(result.current.state).toEqual({ status: "error", progress: 0, message: "export interrupted: three" });
  expect(ended).toHaveBeenCalledTimes(1);
  expect(ended).toHaveBeenCalledWith("run-1", false);
  // Try Again, then Export: a new export gets its own restarts.
  await act(async () => result.current.reset());
  await act(() => result.current.start(1080));
  await emit({ jobId: "job4", type: "error", code: "interrupted", message: "export interrupted: four" });
  expect(timeline).toHaveBeenCalledTimes(5);
});

test("a real failure is told apart: no code and the app in front the whole time → the error, at once, as it always was", async () => {
  const { result } = await renderHook(() => useExport(project, []));
  await act(() => result.current.start(1080));
  await emit({ jobId: "job1", type: "error", message: "Cannot Decode [AVFoundationErrorDomain -11821]" });
  expect(timeline).toHaveBeenCalledTimes(1);
  expect(result.current.state).toEqual({ status: "error", progress: 0, message: "Cannot Decode [AVFoundationErrorDomain -11821]" });
});

test("interrupted while Clipy is still out of sight: the restart waits until it is in front, and Cancel calls it off", async () => {
  const { result } = await renderHook(() => useExport(project, []));
  await act(() => result.current.start(1080));
  await act(async () => app("background"));
  await emit({ jobId: "job1", type: "error", code: "interrupted", message: "export interrupted: x" });
  expect(timeline).toHaveBeenCalledTimes(1);                                   // nothing is started in the background
  expect(result.current.state).toEqual({ status: "exporting", progress: 0, note: EXPORT_RESTARTED, paused: true });
  await act(async () => app("active"));
  expect(timeline).toHaveBeenCalledTimes(2);
  expect(result.current.state).toEqual({ status: "exporting", progress: 0, note: EXPORT_RESTARTED });

  // again, and this time the person cancels while it waits
  await act(async () => app("background"));
  await emit({ jobId: "job2", type: "error", code: "interrupted", message: "export interrupted: y" });
  await act(async () => result.current.cancel());
  expect(result.current.state).toEqual({ status: "idle", progress: 0 });
  await act(async () => app("active"));
  expect(timeline).toHaveBeenCalledTimes(2);
  expect(ended).toHaveBeenCalledWith("run-1", false);
});

test("a PAUSE is not an end: leaving keeps the status exporting with the sub-state, coming back drops it, the progress stays", async () => {
  const { result } = await renderHook(() => useExport(project, []));
  await act(() => result.current.start(1080));
  await emit({ jobId: "job1", type: "progress", progress: 0.4 });
  await act(async () => app("inactive"));                                      // Control Centre, an alert: not a pause
  expect(result.current.state).toEqual({ status: "exporting", progress: 0.4 });
  await act(async () => app("background"));
  expect(result.current.state).toEqual({ status: "exporting", progress: 0.4, paused: true });
  expect(EXPORT_PAUSED).toBe("Paused while Clipy is in the background");
  await act(async () => app("active"));
  expect(result.current.state).toEqual({ status: "exporting", progress: 0.4 });
  await emit({ jobId: "job1", type: "progress", progress: 0.5 });
  await emit({ jobId: "job1", type: "done", fileUri: "file:///cache/out.mp4" });
  expect(result.current.state.status).toBe("done");
  expect(timeline).toHaveBeenCalledTimes(1);
});

test("progress never runs backwards within one attempt", async () => {
  const { result } = await renderHook(() => useExport(project, []));
  await act(() => result.current.start(1080));
  const seen: number[] = [];
  for (const p of [0.2, 0.5, 0.3, 0.5, 0.49, 0.8]) { await emit({ jobId: "job1", type: "progress", progress: p }); seen.push(result.current.state.progress); }
  expect(seen).toEqual([0.2, 0.5, 0.5, 0.5, 0.5, 0.8]);
});

test("a preparation that fails after Clipy was left is an interruption too: the export starts again and finds the copy", async () => {
  const sound = ensureSound as jest.Mock;
  let failCopy: (e: Error) => void = () => {};
  sound.mockImplementationOnce(() => new Promise<string>((_, reject) => { failCopy = reject; }));
  const { result } = await renderHook(() => useExport(withSound, []));
  let started: Promise<void> = Promise.resolve();
  await act(async () => { started = result.current.start(1080); await Promise.resolve(); });
  await act(async () => app("background"));
  await act(async () => app("active"));
  await act(async () => { failCopy(new Error("sound write: interrupted")); await started; });
  expect(sound).toHaveBeenCalledTimes(2);                                      // asked again by the restart
  expect(timeline).toHaveBeenCalledTimes(1);
  expect(result.current.state.status).toBe("exporting");
  expect(result.current.state.note).toBe(EXPORT_RESTARTED);
});

test("the same failure with the app in front the whole time is the error it always was", async () => {
  (ensureSound as jest.Mock).mockRejectedValueOnce(new Error("sound write: no room"));
  const { result } = await renderHook(() => useExport(withSound, []));
  await act(() => result.current.start(1080));
  expect(result.current.state).toEqual({ status: "error", progress: 0, message: "Could not prepare a sound for the export: sound write: no room" });
  expect(timeline).not.toHaveBeenCalled();
});

test("back in front and the render does not move: after EXPORT_STALL_MS it is cancelled and started again; one step forward ends the watch", async () => {
  jest.useFakeTimers();
  const { result } = await renderHook(() => useExport(project, []));
  await act(() => result.current.start(1080));
  await emit({ jobId: "job1", type: "progress", progress: 0.3 });
  await act(async () => app("background"));
  await act(async () => app("active"));
  await emit({ jobId: "job1", type: "progress", progress: 0.3 });               // the native timer repeats the same number
  await act(async () => { jest.advanceTimersByTime(EXPORT_STALL_MS - 1); });
  expect(cancelExport).not.toHaveBeenCalled();
  await act(async () => { jest.advanceTimersByTime(1); });
  expect(cancelExport).toHaveBeenCalledWith("job1");
  expect(timeline).toHaveBeenCalledTimes(2);
  expect(result.current.state).toEqual({ status: "exporting", progress: 0, note: EXPORT_RESTARTED });
  await emit({ jobId: "job1", type: "cancelled" });                             // the old job's last word is not this export's
  expect(result.current.state.status).toBe("exporting");
  expect(EXPORT_STUCK.startsWith("export interrupted: ")).toBe(true);

  // the second attempt is left too, and goes on when Clipy is back: nothing is cancelled
  await emit({ jobId: "job2", type: "progress", progress: 0.2 });
  await act(async () => app("background"));
  await act(async () => app("active"));
  await emit({ jobId: "job2", type: "progress", progress: 0.21 });
  await act(async () => { jest.advanceTimersByTime(EXPORT_STALL_MS * 3); });
  expect(cancelExport).toHaveBeenCalledTimes(1);
  expect(timeline).toHaveBeenCalledTimes(2);
});

test("the phone is asked to keep Clipy alive at the tap, hears the ring's progress, and is told the end exactly once on every way out", async () => {
  const outs: [string, (r: ReturnType<typeof useExport>) => Promise<void>, boolean][] = [
    ["done", async () => { await emit({ jobId: "job1", type: "done", fileUri: "file:///x.mp4" }); }, true],
    ["error", async () => { await emit({ jobId: "job1", type: "error", message: "broken" }); }, false],
    ["cancelled", async () => { await emit({ jobId: "job1", type: "cancelled" }); }, false],
  ];
  for (const [, out, success] of outs) {
    jest.clearAllMocks(); jobs = 0;
    const h = await renderHook(() => useExport(project, []));
    await act(() => h.result.current.start(1080));
    expect(beginBackgroundExport).toHaveBeenCalledTimes(1);
    expect(beginBackgroundExport).toHaveBeenCalledWith("run-1", "Exporting Beach day", "1080p");
    await emit({ jobId: "job1", type: "progress", progress: 0.5 });
    expect(reportBackgroundExport).toHaveBeenLastCalledWith("run-1", 0.5);
    await out(h.result.current);
    expect(ended).toHaveBeenCalledTimes(1);
    expect(ended).toHaveBeenCalledWith("run-1", success);
    await act(async () => h.result.current.reset());
    await h.unmount();
    expect(ended).toHaveBeenCalledTimes(1);                                    // not said twice
  }
  // the screen goes away in the middle
  jest.clearAllMocks(); jobs = 0;
  const h = await renderHook(() => useExport(project, []));
  await act(() => h.result.current.start(1080));
  await h.unmount();
  expect(ended).toHaveBeenCalledTimes(1);
  expect(ended).toHaveBeenCalledWith("run-1", false);
});

test("the system's own Cancel does what the screen's Cancel does; a task the system merely ended cancels nothing", async () => {
  const { result } = await renderHook(() => useExport(project, []));
  await act(() => result.current.start(1080));
  await systemSays({ runId: "run-1", type: "expired" });
  expect(cancelExport).not.toHaveBeenCalled();
  expect(result.current.state.status).toBe("exporting");
  await systemSays({ runId: "someone-else", type: "cancel" });
  expect(cancelExport).not.toHaveBeenCalled();
  await systemSays({ runId: "run-1", type: "cancel" });
  expect(cancelExport).toHaveBeenCalledTimes(1);
  expect(cancelExport).toHaveBeenCalledWith("job1");
  await emit({ jobId: "job1", type: "cancelled" });
  expect(result.current.state).toEqual({ status: "idle", progress: 0 });
});

test("the phone refusing to keep Clipy alive changes nothing: the export runs", async () => {
  (beginBackgroundExport as jest.Mock).mockResolvedValueOnce(null);
  const { result } = await renderHook(() => useExport(project, []));
  await act(() => result.current.start(1080));
  expect(timeline).toHaveBeenCalledTimes(1);
  await emit({ jobId: "job1", type: "done", fileUri: "file:///x.mp4" });
  expect(result.current.state.status).toBe("done");
});

test("what the phone supports and what then happened are logged: once at the start, once at the end", async () => {
  const { result } = await renderHook(() => useExport(project, []));
  await act(() => result.current.start(1080));
  await act(async () => app("background"));
  await emit({ jobId: "job1", type: "done", fileUri: "file:///x.mp4" });
  const lines = logged.mock.calls.map((c) => `${c[0]} ${c[1]}`);
  expect(lines.filter((l) => l.startsWith("background export: start"))).toHaveLength(1);
  expect(lines.find((l) => l.startsWith("background export: start"))).toContain('"support":{"os":"27.0","continued":true,"gpu":false}');
  const end = lines.filter((l) => l.startsWith("background export: end"));
  expect(end).toHaveLength(1);
  expect(end[0]).toContain('"outcome":"done"');
  expect(end[0]).toContain('"finishedInBackground":true');
  expect(end[0]).toContain('"restarts":0');
});

describe("on a build from before background export, everything is as it was", () => {
  beforeEach(() => build.mockReturnValue(false));

  test("no listener on the app's state, no call to the phone, no log; leaving shows nothing; an error is an error whatever it says", async () => {
    const { result } = await renderHook(() => useExport(project, []));
    expect(appListeners).toHaveLength(0);
    await act(() => result.current.start(1080));
    expect(beginBackgroundExport).not.toHaveBeenCalled();
    expect(addBackgroundExportListener).not.toHaveBeenCalled();
    await emit({ jobId: "job1", type: "progress", progress: 0.5 });
    expect(reportBackgroundExport).not.toHaveBeenCalled();
    app("background");
    expect(result.current.state).toEqual({ status: "exporting", progress: 0.5 });
    await emit({ jobId: "job1", type: "error", code: "interrupted", message: "The operation could not be completed [AVFoundationErrorDomain -11847]" });
    expect(timeline).toHaveBeenCalledTimes(1);
    expect(result.current.state).toEqual({ status: "error", progress: 0, message: "The operation could not be completed [AVFoundationErrorDomain -11847]" });
    expect(endBackgroundExport).not.toHaveBeenCalled();
    expect(logged).not.toHaveBeenCalled();
    expect(useStayAwake).toHaveBeenCalled();                                   // the screen is still kept awake: that needs no new build
  });
});
