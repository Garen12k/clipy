jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-10T10:00:00.000Z" }));
jest.mock("@/src/lib/id", () => ({ newId: jest.fn() }));
jest.mock("@/src/projects", () => ({ storage: { projectDir: (id: string) => `file:///doc/projects/${id}` } }));
jest.mock("@/src/projects/expoFs", () => {
  const files = new Set<string>();
  return { __files: files, expoFs: {
    exists: jest.fn(async (p: string) => files.has(p)), mkdir: jest.fn(async () => {}),
    list: jest.fn(async (dir: string) => [...files].filter((f) => f.startsWith(`${dir}/`)).map((f) => f.slice(dir.length + 1))),
    remove: jest.fn(async (p: string) => { files.delete(p); }),
  } };
});
jest.mock("@/modules/clipy-video", () => {
  // The manager subscribes once for the module's lifetime: the listener is kept here, where clearAllMocks does not reach.
  const box: { listener: unknown } = { listener: null };
  return {
    __box: box,
    isSteadyAvailable: jest.fn(() => true), measureShake: jest.fn(), renderSteady: jest.fn(), cancelSteady: jest.fn(),
    addSteadyListener: jest.fn((cb: unknown) => { box.listener = cb; return { remove() {} }; }),
    STEADY_CANCELLED: "E_STEADY_CANCELLED",
    isSteadyCancelled: (e: unknown) => typeof e === "object" && e !== null && (e as { code?: string }).code === "E_STEADY_CANCELLED",
  };
});
import { act, renderHook } from "@testing-library/react-native";
import { cancelSteady, isSteadyAvailable, measureShake, renderSteady } from "@/modules/clipy-video";
import { setClipStabilize } from "@/src/editor/model/ops";
import { steadyNeed } from "@/src/editor/model/steady";
import { steadyShifts } from "@/src/editor/model/steadyPath";
import { makeClip, makeProject, type Clip } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { STEADY_TOOLS } from "@/src/lib/buildInfo";
import { newId } from "@/src/lib/id";
import { useToast } from "@/src/ui/Toast";
import { takeTurn } from "../renderTurn";
import { knownSteady, shownSteady, steadyFileOf, steadyNeeded, steadyNeedOf, steadyPercent, useSteadyFiles } from "../steadyFiles";
import { ensureSteady, forgetShakes, openSteady, resetSteady, retrySteady, SMOOTH_FAILED, STABILIZE_FAILED, STEADY_SETTLE_MS, steadyDir, syncSteady, useSteadyRenders } from "../steadyRenders";

const disk = (jest.requireMock("@/src/projects/expoFs") as { __files: Set<string> }).__files;
const native = (jest.requireMock("@/modules/clipy-video") as { __box: { listener: null | ((e: { jobId: string; progress: number }) => void) } }).__box;
const measure = jest.mocked(measureShake), render = jest.mocked(renderSteady);
const MEDIA = "file:///doc/projects/p1/media", DIR = "file:///doc/projects/p1/steady";
const base = (extra: Partial<Clip> = {}): Clip => makeClip({ id: "a", sourceDuration: 30, sourceUri: `${MEDIA}/abc.mov`, trimStart: 4.2, trimEnd: 9.7, width: 1080, height: 1920, ...extra });
const steadied = base({ stabilize: "medium" });
const slowed = base({ speed: 0.25, smooth: true });
const NAME = "abc-s1-2-0-2000-12000.mov", SLOW = "abc-s1-0-120-2000-12000.mov";
const SHAKE = { times: [2, 2.1, 2.2, 2.3, 2.4], dx: [0, 0.01, -0.02, 0.01, 0], dy: [0, 0, 0.004, 0, 0], frames: 5, failed: 0 };
const files = () => useSteadyFiles.getState().files;
const st = () => useEditorStore.getState();
const tick = async (n = 200) => { for (let i = 0; i < n; i++) await Promise.resolve(); };
const made = (name: string) => ({ fileUri: `${DIR}/${name}`, seconds: 12, frames: 300 });
const cancelled = () => Object.assign(new Error("Steady cancelled"), { code: "E_STEADY_CANCELLED" });
/** A native call that stays open until the test settles it. */
function pending<T>(mock: jest.Mock, value: T) {
  let ok!: () => void, fail!: (e: unknown) => void;
  mock.mockImplementationOnce(() => new Promise<T>((res, rej) => { ok = () => res(value); fail = rej; }));
  return { ok: () => ok(), fail: (e: unknown) => fail(e) };
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  measure.mockReset(); render.mockReset();
  jest.mocked(isSteadyAvailable).mockReturnValue(true);
  let n = 0;
  jest.mocked(newId).mockImplementation(() => `job-${++n}`);
  disk.clear();
  resetSteady();
  forgetShakes();
  useToast.getState().clear();
  st().reset();
});
afterEach(() => { jest.useRealTimers(); });

test("the store's helpers: a clip shows its copy only once it is ready, and a clip without a setting has none", () => {
  expect(steadyDir("p1")).toBe(DIR);
  expect(knownSteady({ a: { status: "ready", uri: "u" }, b: { status: "busy", progress: 0.2 }, c: { status: "failed", message: "x" } })).toEqual(["a", "b"]);
  expect(steadyNeedOf({}, base())).toBeNull();
  expect(steadyFileOf({ [NAME]: { status: "ready", uri: "u" } }, base())).toBeUndefined();
  expect(shownSteady({ [NAME]: { status: "busy", progress: 0.5 } }, steadied)).toBeNull();
  expect(steadyPercent({ [NAME]: { status: "busy", progress: 0.417 } }, steadied)).toBe(42);
  expect(shownSteady({ [NAME]: { status: "ready", uri: `${DIR}/${NAME}` } }, steadied)).toBe(`${DIR}/${NAME}`);
  expect(shownSteady({ [NAME]: { status: "ready", uri: `${DIR}/${NAME}` } }, slowed)).toBeNull();          // another setting: another copy
  expect(shownSteady({ [NAME]: { status: "ready", uri: `${DIR}/${NAME}` } }, base({ stabilize: "medium", cutout: true }))).toBeNull();
  const whole = "abc-s1-2-0-0-30000.mov";
  expect(steadyNeedOf({ [whole]: { status: "ready", uri: "u" }, [NAME]: { status: "busy", progress: 0 } }, steadied)?.name).toBe(whole);   // a ready copy comes first
  const p = makeProject({ clips: [steadied, base({ id: "b" }), { ...slowed, id: "c" }] });
  expect(steadyNeeded(p, [], {}).map((n) => n.name)).toEqual([NAME, SLOW]);
  expect(steadyNeeded(p, [`${MEDIA}/abc.mov`], {})).toEqual([]);
});

test("Stabilize: the phone measures, the app works out the corrections, the phone writes — under one job, with one percent", async () => {
  const m = pending(measure, SHAKE), r = pending(render, made(NAME));
  const seen: number[] = [];
  const done = ensureSteady("p1", steadyNeed(steadied, [])!, (f) => seen.push(f));
  await tick();
  expect(measure).toHaveBeenCalledWith({ jobId: "job-1", sourceUri: `${MEDIA}/abc.mov`, from: 2, to: 12, minFrameGap: 0.008, measureSide: 512 });
  expect(render).not.toHaveBeenCalled();
  native.listener?.({ jobId: "job-1", progress: 0.5 });
  m.ok();
  await tick();
  expect(render).toHaveBeenCalledWith({
    jobId: "job-1", sourceUri: `${MEDIA}/abc.mov`, outputPath: `${DIR}/${NAME}`, from: 2, to: 12, maxSide: 1920, minFrameGap: 0.008, grid: 0, zoom: 1.1,
    ...steadyShifts(SHAKE, { radius: 0.5, zoom: 1.1, cutShift: 0.2, scaleX: 1, scaleY: 1 }), bitRate: 7464960, blendFloor: 0.02,
  });
  native.listener?.({ jobId: "job-1", progress: 0.5 });
  native.listener?.({ jobId: "someone-else", progress: 0.9 });
  r.ok();
  await expect(done).resolves.toBe(`${DIR}/${NAME}`);
  expect(seen).toEqual([0.2, 0.7]);                                   // 40 % measuring, 60 % writing
});

test("Smooth slow motion alone: nothing is measured, the grid is sent, the percent is the phone's own", async () => {
  const r = pending(render, made(SLOW));
  const seen: number[] = [];
  const done = ensureSteady("p1", steadyNeed(slowed, [])!, (f) => seen.push(f));
  await tick();
  expect(measure).not.toHaveBeenCalled();
  expect(render.mock.calls[0][0]).toMatchObject({ grid: 120, zoom: 1, times: [], dx: [], dy: [], bitRate: 14929920, outputPath: `${DIR}/${SLOW}` });
  native.listener?.({ jobId: "job-1", progress: 0.5 });
  r.ok();
  await done;
  expect(seen).toEqual([0.5]);
});

test("what was measured is remembered for the session: another strength of the same range only writes", async () => {
  measure.mockResolvedValue(SHAKE);
  render.mockImplementation(async (req) => made(req.outputPath.split("/").pop()!));
  await ensureSteady("p1", steadyNeed(steadied, [])!);
  await ensureSteady("p1", steadyNeed(base({ stabilize: "high" }), [])!);
  expect(measure).toHaveBeenCalledTimes(1);
  expect(render.mock.calls.map((c) => c[0].zoom)).toEqual([1.1, 1.15]);
  await ensureSteady("p1", steadyNeed(base({ stabilize: "high", trimStart: 14, trimEnd: 20 }), [])!);       // another range: measured
  expect(measure).toHaveBeenCalledTimes(2);
});

test("a copy on disk needs no phone; a build without the tool says so; two callers share one render", async () => {
  disk.add(`${DIR}/${NAME}`);
  await expect(ensureSteady("p1", steadyNeed(steadied, [])!)).resolves.toBe(`${DIR}/${NAME}`);
  expect(measure).not.toHaveBeenCalled();
  disk.clear();
  jest.mocked(isSteadyAvailable).mockReturnValue(false);
  await expect(ensureSteady("p1", steadyNeed(steadied, [])!)).rejects.toThrow(STEADY_TOOLS);
  jest.mocked(isSteadyAvailable).mockReturnValue(true);
  const r = pending(render, made(SLOW));
  const one = ensureSteady("p1", steadyNeed(slowed, [])!), two = ensureSteady("p1", steadyNeed(slowed, [])!);
  await tick();
  r.ok();
  expect(await one).toBe(await two);
  expect(render).toHaveBeenCalledTimes(1);
});

test("one heavy render at a time with every other kind: it waits its turn, its deadline has not started, and a cancel while waiting never reaches the phone", async () => {
  let free!: () => void;
  const other = takeTurn({ cancelled: false, giveUp: null }, () => new Promise<void>((res) => { free = res; }), () => new Error("x"));
  const waiting = ensureSteady("p1", steadyNeed(slowed, [])!);
  await tick();
  jest.advanceTimersByTime(3600000);                                  // an hour behind a cut-out: no deadline runs while it waits
  await tick();
  expect(render).not.toHaveBeenCalled();
  syncSteady("p1", []);                                               // nobody needs it any more
  await expect(waiting).rejects.toMatchObject({ code: "E_STEADY_CANCELLED" });
  free();
  await other;
  await tick();
  expect(render).not.toHaveBeenCalled();
});

test("a phone that does not answer is given up on, by stage, and told to stop", async () => {
  measure.mockImplementationOnce(() => new Promise(() => {}));
  const done = ensureSteady("p1", steadyNeed(steadied, [])!);
  const seen = expect(done).rejects.toThrow("steady measure: no answer after 160 s");
  await tick();
  jest.advanceTimersByTime(160000);
  await seen;
  expect(cancelSteady).toHaveBeenCalledWith("job-1");
  forgetShakes();
  measure.mockResolvedValueOnce(SHAKE);
  render.mockImplementationOnce(() => new Promise(() => {}));
  const again = ensureSteady("p1", steadyNeed(steadied, [])!);
  const late = expect(again).rejects.toThrow("steady render: no answer after 360 s");
  await tick();
  jest.advanceTimersByTime(360000);
  await late;
});

test("the queue: nothing starts until the project has stood still; then busy, a percent, ready", async () => {
  st().setProject(makeProject({ id: "p1", clips: [slowed] }));
  await openSteady("p1");
  const r = pending(render, made(SLOW));
  syncSteady("p1", steadyNeeded(st().project!, [], files()));
  jest.advanceTimersByTime(STEADY_SETTLE_MS - 1);
  await tick();
  expect(render).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1);
  await tick();
  expect(files()[SLOW]).toEqual({ status: "busy", progress: 0 });
  native.listener?.({ jobId: "job-1", progress: 0.417 });
  expect(files()[SLOW]).toEqual({ status: "busy", progress: 0.42 });
  native.listener?.({ jobId: "job-1", progress: 0.2 });               // never backwards
  expect(files()[SLOW]).toEqual({ status: "busy", progress: 0.42 });
  r.ok();
  await tick();
  expect(files()[SLOW]).toEqual({ status: "ready", uri: `${DIR}/${SLOW}` });
});

test("a copy nobody needs any more is cancelled at once and forgotten; a failed one is said once, by what it was for, and can be asked for again", async () => {
  st().setProject(makeProject({ id: "p1", clips: [slowed] }));
  await openSteady("p1");
  const r = pending(render, made(SLOW));
  syncSteady("p1", steadyNeeded(st().project!, [], files()));
  jest.advanceTimersByTime(STEADY_SETTLE_MS);
  await tick();
  syncSteady("p1", []);
  expect(cancelSteady).toHaveBeenCalledWith("job-1");
  r.fail(cancelled());
  await tick();
  expect(files()[SLOW]).toBeUndefined();
  expect(useToast.getState().message ?? null).toBeNull();

  render.mockRejectedValueOnce(new Error("steady writer: boom"));
  syncSteady("p1", steadyNeeded(st().project!, [], files()));
  jest.advanceTimersByTime(STEADY_SETTLE_MS);
  await tick();
  expect(files()[SLOW]).toEqual({ status: "failed", message: "steady writer: boom" });
  expect(useToast.getState().message).toBe(SMOOTH_FAILED);
  expect(STABILIZE_FAILED).toBe("Could not stabilize the clip. It shows as it was.");
  expect(SMOOTH_FAILED).toBe("Could not smooth the slow motion. The clip shows as it was.");
  render.mockResolvedValueOnce(made(SLOW));
  retrySteady(SLOW);
  jest.advanceTimersByTime(STEADY_SETTLE_MS);
  await tick();
  expect(files()[SLOW]).toEqual({ status: "ready", uri: `${DIR}/${SLOW}` });
});

test("opening a project: finished copies that are needed are known as ready; part files, other versions and copies nobody needs are removed", async () => {
  for (const name of [NAME, "abc-s1-3-0-2000-12000.mov", `part-${NAME}`, "abc-s0-2-0-2000-12000.mov", "notes.txt"]) disk.add(`${DIR}/${name}`);
  disk.add(`${MEDIA}/abc.mov`);
  st().setProject(makeProject({ id: "p1", clips: [steadied] }));
  await openSteady("p1");
  expect([...disk].sort()).toEqual([`${MEDIA}/abc.mov`, `${DIR}/${NAME}`].sort());
  expect(files()).toEqual({ [NAME]: { status: "ready", uri: `${DIR}/${NAME}` } });
  expect(measure).not.toHaveBeenCalled();
});

test("without the tool nothing is read, removed or rendered", async () => {
  jest.mocked(isSteadyAvailable).mockReturnValue(false);
  disk.add(`${DIR}/old.mov`);
  st().setProject(makeProject({ id: "p1", clips: [steadied] }));
  const { unmount } = await renderHook(() => useSteadyRenders());
  await act(async () => { jest.advanceTimersByTime(5000); await tick(); });
  expect(disk.has(`${DIR}/old.mov`)).toBe(true);
  expect(measure).not.toHaveBeenCalled();
  await unmount();
});

test("the hook: a tap that switches Stabilize on renders its copy once the project has stood still; a project without settings costs one look at the folder", async () => {
  measure.mockResolvedValue(SHAKE);
  render.mockImplementation(async (req) => made(req.outputPath.split("/").pop()!));
  st().setProject(makeProject({ id: "p1", clips: [base()] }));
  const waits = jest.spyOn(globalThis, "setTimeout");                   // the test library keeps a timer of its own: the queue's waits are counted, not every timer
  const { unmount } = await renderHook(() => useSteadyRenders());
  await act(async () => { jest.advanceTimersByTime(5000); await tick(); });
  expect(measure).not.toHaveBeenCalled();
  expect(waits.mock.calls.filter((c) => c[1] === STEADY_SETTLE_MS)).toEqual([]);
  await act(async () => { st().apply((p) => setClipStabilize(p, "a", "medium")); await tick(); });
  expect(measure).not.toHaveBeenCalled();                             // not before it has stood still
  await act(async () => { jest.advanceTimersByTime(STEADY_SETTLE_MS); await tick(); });
  expect(files()[NAME]).toEqual({ status: "ready", uri: `${DIR}/${NAME}` });
  expect(JSON.stringify(st().project)).not.toContain("steady/");      // a render never writes the project
  await unmount();
  expect(files()).toEqual({});
});

// ── Beyond the brief: the two halves, the long path, and the hold ──────────────────────────────────────────────────────────────
import { setClipSpeed } from "@/src/editor/model/ops";
import { holdSteady, STEADY_LONG_PATH } from "../steadyRenders";

/** A shake long enough that working out its path is given a breath before and after. */
const longShake = () => {
  const n = STEADY_LONG_PATH + 1;
  const times = Array.from({ length: n }, (_, i) => 2 + i / 30);
  return { times, dx: times.map((_, i) => (i % 2 === 0 ? 0.004 : -0.004)), dy: times.map(() => 0), frames: n, failed: 0 };
};

test("a cancel while the phone measures, answered as if nothing had happened: nothing is written, the turn is free, what was measured is kept", async () => {
  const m = pending(measure, SHAKE);
  const done = ensureSteady("p1", steadyNeed(steadied, [])!);
  const seen = expect(done).rejects.toMatchObject({ code: "E_STEADY_CANCELLED" });
  await tick();
  syncSteady("p1", []);
  expect(cancelSteady).toHaveBeenCalledWith("job-1");
  m.ok();                                                             // the phone had finished measuring anyway
  await seen;
  expect(render).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);                               // no grace, no deadline left behind
  render.mockResolvedValueOnce(made(NAME));
  await expect(ensureSteady("p1", steadyNeed(steadied, [])!)).resolves.toBe(`${DIR}/${NAME}`);   // the turn was given on
  expect(measure).toHaveBeenCalledTimes(1);
  expect(render.mock.calls[0][0].jobId).toBe("job-2");
});

test("a cancel the phone never answers, while it measures: the wait ends after the grace and the next copy gets its turn", async () => {
  measure.mockImplementationOnce(() => new Promise(() => {}));
  const done = ensureSteady("p1", steadyNeed(steadied, [])!);
  const seen = expect(done).rejects.toMatchObject({ code: "E_STEADY_CANCELLED" });
  await tick();
  syncSteady("p1", []);
  jest.advanceTimersByTime(4000);
  await seen;
  expect(render).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
  render.mockResolvedValueOnce(made(SLOW));
  await expect(ensureSteady("p1", steadyNeed(slowed, [])!)).resolves.toBe(`${DIR}/${SLOW}`);
});

test("a long path is worked out between two breaths, and a cancel in either is seen before the phone is asked to write", async () => {
  const LONG = longShake();
  measure.mockResolvedValueOnce(LONG);
  const r = pending(render, made(NAME));
  const done = ensureSteady("p1", steadyNeed(steadied, [])!);
  await tick();
  expect(render).not.toHaveBeenCalled();                              // the first breath
  jest.advanceTimersByTime(0);
  await tick();
  expect(render).not.toHaveBeenCalled();                              // the second
  jest.advanceTimersByTime(0);
  await tick();
  expect(render.mock.calls[0][0]).toMatchObject(steadyShifts(LONG, { radius: 0.5, zoom: 1.1, cutShift: 0.2, scaleX: 1, scaleY: 1 }));
  r.ok();
  await done;

  forgetShakes();
  measure.mockResolvedValueOnce(LONG);
  const gone = ensureSteady("p1", steadyNeed(steadied, [])!);
  const seen = expect(gone).rejects.toMatchObject({ code: "E_STEADY_CANCELLED" });
  await tick();
  syncSteady("p1", []);                                               // in the first breath: no native call is open
  jest.advanceTimersByTime(0);
  await seen;
  expect(render).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);

  const last = ensureSteady("p1", steadyNeed(steadied, [])!);        // remembered: straight to the breaths
  const late = expect(last).rejects.toMatchObject({ code: "E_STEADY_CANCELLED" });
  await tick();
  jest.advanceTimersByTime(0);
  await tick();
  syncSteady("p1", []);                                               // in the second
  jest.advanceTimersByTime(0);
  await late;
  expect(render).toHaveBeenCalledTimes(1);
  expect(measure).toHaveBeenCalledTimes(2);
});

test("a speed drag across 0.5×: every frame starts the wait over, and only the copy for where the finger stopped is rendered", async () => {
  render.mockImplementation(async (req) => made(req.outputPath.split("/").pop()!));
  st().setProject(makeProject({ id: "p1", clips: [base({ speed: 0.6, smooth: true })] }));
  const { unmount } = await renderHook(() => useSteadyRenders());
  await act(async () => { jest.advanceTimersByTime(STEADY_SETTLE_MS); await tick(); });
  expect(render.mock.calls.map((c) => c[0].grid)).toEqual([60]);
  await act(async () => { st().beginTransaction(); await tick(); });
  for (const speed of [0.55, 0.5, 0.45, 0.4]) {                       // across 0.5×: the copy's name changes on the way
    await act(async () => { st().applyTransient((p) => setClipSpeed(p, "a", speed)); jest.advanceTimersByTime(STEADY_SETTLE_MS - 1); await tick(); });
  }
  expect(render).toHaveBeenCalledTimes(1);
  await act(async () => { jest.advanceTimersByTime(1); await tick(); });
  expect(render.mock.calls.map((c) => c[0].grid)).toEqual([60, 120]);
  expect(render.mock.calls[1][0].outputPath).toBe(`${DIR}/${SLOW}`);
  await unmount();
});

test("held (a finger resting on a slider): nothing starts however long the project stands still; on release the wait starts and one copy is rendered", async () => {
  render.mockImplementation(async (req) => made(req.outputPath.split("/").pop()!));
  st().setProject(makeProject({ id: "p1", clips: [base({ speed: 0.6, smooth: true })] }));
  const { unmount } = await renderHook(() => useSteadyRenders());
  await act(async () => { jest.advanceTimersByTime(STEADY_SETTLE_MS); await tick(); });
  expect(render).toHaveBeenCalledTimes(1);
  holdSteady(true);
  const waits = jest.spyOn(globalThis, "setTimeout");
  const waited = () => waits.mock.calls.filter((c) => c[1] === STEADY_SETTLE_MS).length;
  await act(async () => { st().beginTransaction(); st().applyTransient((p) => setClipSpeed(p, "a", 0.45)); await tick(); });
  await act(async () => { jest.advanceTimersByTime(60000); await tick(); });
  expect(render).toHaveBeenCalledTimes(1);
  expect(waited()).toBe(0);                                           // not even a wait while it is held
  await act(async () => { st().applyTransient((p) => setClipSpeed(p, "a", 0.7)); jest.advanceTimersByTime(60000); await tick(); });   // back on the copy it has
  await act(async () => { st().applyTransient((p) => setClipSpeed(p, "a", 0.3)); jest.advanceTimersByTime(60000); await tick(); });
  expect(render).toHaveBeenCalledTimes(1);
  expect(waited()).toBe(0);
  holdSteady(false);
  expect(waited()).toBe(1);
  await act(async () => { jest.advanceTimersByTime(STEADY_SETTLE_MS - 1); await tick(); });
  expect(render).toHaveBeenCalledTimes(1);
  await act(async () => { jest.advanceTimersByTime(1); await tick(); });
  expect(render.mock.calls.map((c) => c[0].grid)).toEqual([60, 120]);
  await unmount();
  holdSteady(true);
  resetSteady();                                                      // leaving the editor lets go
  st().setProject(makeProject({ id: "p1", clips: [slowed] }));
  await openSteady("p1");
  syncSteady("p1", steadyNeeded(st().project!, [], files()));
  jest.advanceTimersByTime(STEADY_SETTLE_MS);
  await tick();
  expect(render).toHaveBeenCalledTimes(3);
});

test("a failed copy that is no longer needed is forgotten; the longest measuring is answered whole", async () => {
  useSteadyFiles.setState({ files: { [SLOW]: { status: "failed", message: "x" }, [NAME]: { status: "ready", uri: "u" } } });
  syncSteady("p1", []);
  expect(files()).toEqual({ [NAME]: { status: "ready", uri: "u" } });
  // The longest copy: 7 680 measured frames (the log line must not hand them to one call as arguments).
  const n = 7680, times = Array.from({ length: n }, (_, i) => 2 + i / 128);
  measure.mockResolvedValueOnce({ times, dx: times.map(() => 0), dy: times.map(() => 0), frames: n, failed: 0 });
  render.mockResolvedValueOnce(made(NAME));
  const done = ensureSteady("p1", steadyNeed(steadied, [])!);
  for (let i = 0; i < 3; i++) { await tick(); jest.advanceTimersByTime(0); }
  await expect(done).resolves.toBe(`${DIR}/${NAME}`);
});
