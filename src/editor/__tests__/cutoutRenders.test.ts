jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-09T10:00:00.000Z" }));
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
  const cut: { listener: unknown } = { listener: null };
  return {
    __cut: cut,
    isCutoutAvailable: jest.fn(() => true), renderCutout: jest.fn(), cancelCutout: jest.fn(),
    addCutoutListener: jest.fn((cb: unknown) => { cut.listener = cb; return { remove() {} }; }),
    isNativeAvailable: jest.fn(() => true), isSoundAvailable: jest.fn(() => true), isSpeechAvailable: jest.fn(() => true),
    CUTOUT_CANCELLED: "E_CUTOUT_CANCELLED",
    isCutoutCancelled: (e: unknown) => typeof e === "object" && e !== null && (e as { code?: string }).code === "E_CUTOUT_CANCELLED",
  };
});
import { act, renderHook } from "@testing-library/react-native";
import { addCutoutListener, cancelCutout, isCutoutAvailable, renderCutout } from "@/modules/clipy-video";
import { cutoutDeadlineMs, cutoutNeed, neededCutouts } from "@/src/editor/model/cutout";
import { setClipCutout } from "@/src/editor/model/ops";
import { makeClip, makeLayer, makePhotoClip, makeProject, type Clip } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { BEATS_BACKGROUND_TOOLS } from "@/src/lib/buildInfo";
import { newId } from "@/src/lib/id";
import { useToast } from "@/src/ui/Toast";
import { cutoutFileOf, cutoutNeedOf, cutoutPercent, cutoutsNeeded, knownCopies, shownCutout, useCutoutFiles, type CutoutFile } from "../cutoutFiles";
import { CUTOUT_CANCEL_GRACE_MS, CUTOUT_FAILED, CUTOUT_NO_PERSON, CUTOUT_SETTLE_MS, cutoutDir, ensureCutout, isNoPerson, openCutouts, resetCutouts, retryCutout, syncCutouts, useCutoutRenders } from "../cutoutRenders";

const disk = (jest.requireMock("@/src/projects/expoFs") as { __files: Set<string> }).__files;
const fs = (jest.requireMock("@/src/projects/expoFs") as { expoFs: { exists: jest.Mock; mkdir: jest.Mock; list: jest.Mock; remove: jest.Mock } }).expoFs;
const native = (jest.requireMock("@/modules/clipy-video") as { __cut: { listener: null | ((e: { jobId: string; progress: number }) => void) } }).__cut;
const render = jest.mocked(renderCutout);
const MEDIA = "file:///doc/projects/p1/media";
const DIR = "file:///doc/projects/p1/cutout";
const clip = makeClip({ id: "a", sourceDuration: 30, sourceUri: `${MEDIA}/abc.mov`, trimStart: 4.2, trimEnd: 9.7, cutout: true });
const photo = makePhotoClip({ id: "ph", sourceUri: `${MEDIA}/p.jpg`, cutout: true });
const NAME = "abc-c1-3000-11000.mov", PNG = "p-c1-photo.png";
const files = () => useCutoutFiles.getState().files;
const st = () => useEditorStore.getState();
const tick = async (n = 40) => { for (let i = 0; i < n; i++) await Promise.resolve(); };
const made = (name: string) => ({ fileUri: `${DIR}/${name}`, seconds: 11, frames: 240, person: 0.3 });
const cancelled = () => Object.assign(new Error("Cutout cancelled"), { code: "E_CUTOUT_CANCELLED" });
/** A render that stays open until the test settles it. */
function pending(name: string) {
  let ok!: () => void, fail!: (e: unknown) => void;
  render.mockImplementationOnce(() => new Promise((res, rej) => { ok = () => res(made(name)); fail = rej; }));
  return { ok: () => ok(), fail: (e: unknown) => fail(e) };
}

beforeEach(() => {
  jest.clearAllMocks();
  render.mockReset();
  jest.mocked(isCutoutAvailable).mockReturnValue(true);
  let n = 0;
  jest.mocked(newId).mockImplementation(() => `job-${++n}`);
  disk.clear();
  resetCutouts();
  useToast.getState().clear();
  st().reset();
});

test("the store's helpers: ready and busy copies are known; a clip shows its copy only once it is ready", () => {
  expect(cutoutDir("p1")).toBe(DIR);
  expect(knownCopies({ a: { status: "ready", uri: "u" }, b: { status: "busy", progress: 0.2 }, c: { status: "failed", message: "x" } })).toEqual(["a", "b"]);
  expect(cutoutFileOf({}, clip)).toBeUndefined();
  expect(shownCutout({ [NAME]: { status: "busy", progress: 0.5 } }, clip)).toBeNull();
  expect(shownCutout({ [NAME]: { status: "ready", uri: `${DIR}/${NAME}` } }, clip)).toBe(`${DIR}/${NAME}`);
  expect(shownCutout({ "abc-c1-0-30000.mov": { status: "ready", uri: `${DIR}/abc-c1-0-30000.mov` } }, clip)).toBe(`${DIR}/abc-c1-0-30000.mov`);   // a larger copy covers it
  expect(shownCutout({ [NAME]: { status: "ready", uri: "u" } }, { ...clip, cutout: undefined })).toBeNull();                                         // the switch is off
  expect(shownCutout({ [NAME]: { status: "ready", uri: "u" } }, { ...clip, reversed: true })).toBeNull();
  expect(isNoPerson("cutout person: no person found")).toBe(true);
  expect(isNoPerson("cutout writer: x")).toBe(false);
});

test("a clip that shows a ready copy keeps it while a smaller copy of the same file is still being rendered", () => {
  const A = "abc-c1-3000-11000.mov", B = "abc-c1-8000-14000.mov";
  const x: Clip = { ...clip, id: "x", trimStart: 9, trimEnd: 10.5 };                 // inside A (ready) and inside B (smaller, busy)
  const y: Clip = { ...clip, id: "y", trimStart: 9.5, trimEnd: 12.5 };               // past A's end: only B serves it
  const both: Record<string, CutoutFile> = { [A]: { status: "ready", uri: `${DIR}/${A}` }, [B]: { status: "busy", progress: 0.3 } };
  expect(cutoutNeed(x, knownCopies(both)).name).toBe(B);                              // the model alone would move it to the busy one
  expect(cutoutNeedOf(both, x)).toEqual({ name: A, sourceUri: `${MEDIA}/abc.mov`, photo: false, from: 3, to: 11 });
  expect(shownCutout(both, x)).toBe(`${DIR}/${A}`);
  expect(cutoutFileOf(both, x)).toBe(both[A]);
  expect(cutoutFileOf(both, y)).toBe(both[B]);
  expect(shownCutout(both, y)).toBeNull();
  expect(cutoutPercent(both, y)).toBe(30);
  expect(cutoutPercent(both, x)).toBeNull();                                          // not busy: no percent
  const p = makeProject({ clips: [x], layers: [{ ...makeLayer({ id: "y", sourceDuration: 30 }), ...y }] });
  expect(cutoutsNeeded(p, [], both).map((n) => n.name)).toEqual([A, B]);              // both stay needed: B is not cancelled, A is what x shows
  expect(cutoutsNeeded(p, [`${MEDIA}/abc.mov`], both)).toEqual([]);                   // a missing file is not rendered
  expect(cutoutsNeeded(makeProject({ clips: [{ ...x, cutout: undefined }, { ...y, reversed: true }] }), [], both)).toEqual([]);
  // Once B is ready too, the smallest ready copy serves (both exist: nothing waits).
  expect(cutoutNeedOf({ ...both, [B]: { status: "ready", uri: `${DIR}/${B}` } }, x).name).toBe(B);
  // A failed copy is not known: the clip's own planned copy is what it waits for, and its failure is found under that name.
  const failed: Record<string, CutoutFile> = { [NAME]: { status: "failed", message: "cutout writer: boom" } };
  expect(cutoutFileOf(failed, clip)).toBe(failed[NAME]);
});

test("ensureCutout: a copy on disk is returned without the phone; a missing one is rendered with the numbers of the model", async () => {
  disk.add(`${DIR}/${NAME}`);
  await expect(ensureCutout("p1", cutoutNeed(clip, []))).resolves.toBe(`${DIR}/${NAME}`);
  expect(render).not.toHaveBeenCalled();
  disk.clear();
  render.mockResolvedValueOnce(made(NAME));
  await expect(ensureCutout("p1", cutoutNeed(clip, []))).resolves.toBe(`${DIR}/${NAME}`);
  expect(render).toHaveBeenCalledWith({ jobId: "job-2", sourceUri: `${MEDIA}/abc.mov`, outputPath: `${DIR}/${NAME}`, kind: "video", from: 3, to: 11,
    maxSide: 1920, minFrameGap: 0.03, minPerson: 0.005, alphaQuality: 0.75, bitsPerPixel: 0.1, stillPath: "", stillSeconds: 0 });
});

test("ensureCutout for a photo: both files must be there, and the request names the still movie", async () => {
  disk.add(`${DIR}/${PNG}`);                                        // the PNG alone is not a finished copy
  render.mockResolvedValueOnce(made(PNG));
  await ensureCutout("p1", cutoutNeed(photo, []));
  expect(render).toHaveBeenCalledWith(expect.objectContaining({ kind: "photo", outputPath: `${DIR}/${PNG}`, stillPath: `${DIR}/p-c1-photo.mov`, stillSeconds: 60, maxSide: 2560, from: 0, to: 0 }));
  disk.add(`${DIR}/p-c1-photo.mov`);
  render.mockClear();
  await ensureCutout("p1", cutoutNeed(photo, []));
  expect(render).not.toHaveBeenCalled();
});

test("ensureCutout: two callers share one render; without the tool it says the build sentence; a failure carries the native message", async () => {
  let finish: (v: ReturnType<typeof made>) => void = () => {};
  render.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
  const seen: number[] = [];
  const one = ensureCutout("p1", cutoutNeed(clip, []), (f) => seen.push(f));
  const two = ensureCutout("p1", cutoutNeed(clip, []));
  await tick();
  expect(render).toHaveBeenCalledTimes(1);
  native.listener?.({ jobId: "job-1", progress: 0.4 });
  native.listener?.({ jobId: "other", progress: 0.9 });
  finish(made(NAME));
  await expect(Promise.all([one, two])).resolves.toEqual([`${DIR}/${NAME}`, `${DIR}/${NAME}`]);
  expect(seen).toEqual([0.4]);
  jest.mocked(isCutoutAvailable).mockReturnValue(false);
  jest.mocked(addCutoutListener).mockClear();
  await expect(ensureCutout("p1", cutoutNeed(clip, []))).rejects.toThrow(BEATS_BACKGROUND_TOOLS);
  expect(render).toHaveBeenCalledTimes(1);
  expect(addCutoutListener).not.toHaveBeenCalled();                 // never asked of a build that does not know the event
  jest.mocked(isCutoutAvailable).mockReturnValue(true);
  render.mockRejectedValueOnce(new Error("cutout writer: boom"));
  await expect(ensureCutout("p1", cutoutNeed(clip, []))).rejects.toThrow("cutout writer: boom");
});

describe("the queue", () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(async () => { resetCutouts(); jest.runOnlyPendingTimers(); await tick(); jest.useRealTimers(); });
  const openProject = async (clips = [clip]) => {
    st().setProject(makeProject({ clips }));
    await openCutouts("p1");
  };
  const needed = () => neededCutouts(st().project!, [], knownCopies(files()));
  const pass = async (ms: number) => { jest.advanceTimersByTime(ms); await tick(); };

  test("nothing is rendered until the project has stood still; then one at a time, with progress, then ready", async () => {
    await openProject([clip, photo]);
    let finish: (v: ReturnType<typeof made>) => void = () => {};
    render.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; })).mockResolvedValueOnce(made(PNG));
    syncCutouts("p1", needed());
    jest.advanceTimersByTime(CUTOUT_SETTLE_MS - 1);
    await tick();
    expect(render).not.toHaveBeenCalled();
    syncCutouts("p1", needed());                                    // the project moved again: the wait starts over
    jest.advanceTimersByTime(CUTOUT_SETTLE_MS - 1);
    await tick();
    expect(render).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    await tick();
    expect(render).toHaveBeenCalledTimes(1);
    expect(files()[NAME]).toEqual({ status: "busy", progress: 0 });
    native.listener?.({ jobId: "job-1", progress: 0.5 });
    expect(files()[NAME]).toEqual({ status: "busy", progress: 0.5 });
    finish(made(NAME));
    await tick();
    expect(files()[NAME]).toEqual({ status: "ready", uri: `${DIR}/${NAME}` });
    expect(render).toHaveBeenCalledTimes(2);                        // then the photo
    await tick();
    expect(files()[PNG]).toEqual({ status: "ready", uri: `${DIR}/${PNG}` });
  });

  test("a copy nobody needs any more is cancelled at once; the grace ends the wait when the phone does not answer", async () => {
    await openProject();
    render.mockReturnValueOnce(new Promise(() => {}));
    syncCutouts("p1", needed());
    jest.advanceTimersByTime(CUTOUT_SETTLE_MS);
    await tick();
    expect(files()[NAME]?.status).toBe("busy");
    syncCutouts("p1", []);                                          // the switch went off
    expect(cancelCutout).toHaveBeenCalledWith("job-1");
    syncCutouts("p1", []);
    expect(cancelCutout).toHaveBeenCalledTimes(1);                  // told to stop once, however often the same is said
    jest.advanceTimersByTime(CUTOUT_CANCEL_GRACE_MS);
    await tick();
    expect(NAME in files()).toBe(false);
    expect(useToast.getState().message).toBeNull();                 // a cancel is not a failure
  });

  test("a failure is said once and stays failed until it is retried; no person has its own sentence", async () => {
    await openProject();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      render.mockRejectedValueOnce(new Error("cutout person: no person found"));
      syncCutouts("p1", needed());
      jest.advanceTimersByTime(CUTOUT_SETTLE_MS);
      await tick();
      expect(files()[NAME]).toEqual({ status: "failed", message: "cutout person: no person found" });
      expect(useToast.getState().message).toBe(CUTOUT_NO_PERSON);
      syncCutouts("p1", needed());
      jest.advanceTimersByTime(CUTOUT_SETTLE_MS);
      await tick();
      expect(render).toHaveBeenCalledTimes(1);                      // not tried again by itself
      render.mockRejectedValueOnce(new Error("cutout writer: boom"));
      retryCutout(NAME);
      jest.advanceTimersByTime(CUTOUT_SETTLE_MS);
      await tick();
      expect(render).toHaveBeenCalledTimes(2);
      expect(useToast.getState().message).toBe(CUTOUT_FAILED);
    } finally { warn.mockRestore(); }
  });

  test("opening a project: copies on disk are ready at once, part files and copies no clip needs are removed, another project's files are left", async () => {
    for (const name of [NAME, "abc-c1-0-2000.mov", "part-abc-c1-5000-9000.mov", PNG, "p-c1-photo.mov", "zzz-c1-photo.png", "zzz-c1-photo.mov"]) disk.add(`${DIR}/${name}`);
    disk.add(`file:///doc/projects/p2/cutout/${NAME}`); disk.add(`${MEDIA}/abc.mov`);
    await openProject([clip, photo]);
    expect(files()).toEqual({ [NAME]: { status: "ready", uri: `${DIR}/${NAME}` }, [PNG]: { status: "ready", uri: `${DIR}/${PNG}` } });
    expect([...disk].sort()).toEqual([`${DIR}/${NAME}`, `${DIR}/${PNG}`, `${DIR}/p-c1-photo.mov`, `file:///doc/projects/p2/cutout/${NAME}`, `${MEDIA}/abc.mov`].sort());
    syncCutouts("p1", needed());
    jest.advanceTimersByTime(CUTOUT_SETTLE_MS);
    await tick();
    expect(render).not.toHaveBeenCalled();
  });

  test("leaving the editor cancels what runs and forgets everything", async () => {
    await openProject();
    render.mockReturnValueOnce(new Promise(() => {}));
    syncCutouts("p1", needed());
    jest.advanceTimersByTime(CUTOUT_SETTLE_MS);
    await tick();
    resetCutouts();
    expect(cancelCutout).toHaveBeenCalledWith("job-1");
    expect(files()).toEqual({});
  });

  test("switching the switch on and off writes only the project; the queue never writes it", async () => {
    await openProject([{ ...clip, cutout: undefined }]);
    const before = st().project!;
    render.mockResolvedValueOnce(made(NAME));
    st().apply((p) => setClipCutout(p, "a", true));
    const on = st().project!;
    syncCutouts("p1", needed());
    jest.advanceTimersByTime(CUTOUT_SETTLE_MS);
    await tick();
    expect(render).toHaveBeenCalledTimes(1);
    expect(st().project).toBe(on);
    expect(before.clips[0].cutout).toBeUndefined();
  });

  // ── beyond the brief ────────────────────────────────────────────────────────────────────────────────────────────────

  test("progress is kept in whole percent: at most a hundred writes per render, never backwards, never a number that is not one", async () => {
    await openProject();
    const open = pending(NAME);
    syncCutouts("p1", needed());
    await pass(CUTOUT_SETTLE_MS);
    let writes = 0;
    const off = useCutoutFiles.subscribe(() => { writes += 1; });
    for (let i = 0; i <= 1000; i++) native.listener?.({ jobId: "job-1", progress: i / 1000 });
    expect(writes).toBe(100);                                       // 1 % … 100 %
    expect(files()[NAME]).toEqual({ status: "busy", progress: 1 });
    for (const odd of [0.2, NaN, Infinity, -3, 7]) native.listener?.({ jobId: "job-1", progress: odd });
    native.listener?.({ jobId: "someone-else", progress: 0.5 });
    expect(writes).toBe(100);
    expect(files()[NAME]).toEqual({ status: "busy", progress: 1 });
    off();
    open.ok();
    await tick();
    expect(files()[NAME]?.status).toBe("ready");
  });

  test("while a render runs and the project is still moving, the next copy waits for the stand-still too", async () => {
    await openProject([clip, photo]);
    const first = pending(NAME);
    render.mockResolvedValue(made(PNG));
    syncCutouts("p1", needed());
    await pass(CUTOUT_SETTLE_MS);
    expect(render).toHaveBeenCalledTimes(1);
    syncCutouts("p1", needed());                                    // the owner is dragging something
    first.ok();
    await tick();
    expect(files()[NAME]?.status).toBe("ready");
    expect(render).toHaveBeenCalledTimes(1);                        // the photo is not started in the middle of the drag
    await pass(CUTOUT_SETTLE_MS - 1);
    expect(render).toHaveBeenCalledTimes(1);
    await pass(1);
    expect(render).toHaveBeenCalledTimes(2);
    expect(files()[PNG]?.status).toBe("ready");
  });

  test("the deadline grows with the copy: a render that never answers fails then, is told to stop, and the queue goes on", async () => {
    await openProject([clip, photo]);
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      render.mockImplementationOnce(() => new Promise(() => {}));
      render.mockResolvedValue(made(PNG));
      const deadline = cutoutDeadlineMs({ photo: false, from: 3, to: 11 });
      expect(deadline).toBe(220000);
      syncCutouts("p1", needed());
      await pass(CUTOUT_SETTLE_MS);
      await pass(deadline - 1);
      expect(files()).toEqual({ [NAME]: { status: "busy", progress: 0 } });
      await pass(1);
      expect(files()[NAME]).toEqual({ status: "failed", message: "cutout render: no answer after 220 s" });
      expect(cancelCutout).toHaveBeenCalledWith("job-1");
      expect(useToast.getState().message).toBe(CUTOUT_FAILED);
      expect(files()[PNG]).toEqual({ status: "ready", uri: `${DIR}/${PNG}` });
    } finally { warn.mockRestore(); }
  });

  test("a cancelled render that answers late (done, or failed) changes nothing and says nothing", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      for (const late of ["ok", "fail"] as const) {
        await openProject();
        const open = pending(NAME);
        syncCutouts("p1", needed());
        await pass(CUTOUT_SETTLE_MS);
        syncCutouts("p1", []);
        await pass(CUTOUT_CANCEL_GRACE_MS);
        const before = useCutoutFiles.getState();
        expect(before.files).toEqual({});
        if (late === "ok") open.ok(); else open.fail(new Error("cutout writer: late"));
        await tick();
        await pass(cutoutDeadlineMs({ photo: false, from: 3, to: 11 }));   // its deadline went with it
        expect(useCutoutFiles.getState()).toBe(before);              // not one write for a job nobody waits for
        expect(useToast.getState().message).toBeNull();
        expect(cancelCutout).toHaveBeenCalledTimes(1);
        jest.mocked(cancelCutout).mockClear();
        resetCutouts();
      }
      expect(warn).not.toHaveBeenCalled();
    } finally { warn.mockRestore(); }
  });

  test("a render that says it was cancelled moves the queue on at once; switched on again it is rendered again", async () => {
    await openProject();
    const open = pending(NAME);
    render.mockResolvedValue(made(NAME));
    syncCutouts("p1", needed());
    await pass(CUTOUT_SETTLE_MS);
    syncCutouts("p1", []);
    syncCutouts("p1", needed());                                    // off and on again before the phone has answered
    open.fail(cancelled());
    await tick();
    await pass(CUTOUT_SETTLE_MS);
    expect(render).toHaveBeenCalledTimes(2);
    expect(files()).toEqual({ [NAME]: { status: "ready", uri: `${DIR}/${NAME}` } });
    expect(useToast.getState().message).toBeNull();
  });

  test("a failed copy that is no longer needed is forgotten, so the switch (off, on) asks for it again", async () => {
    await openProject();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      render.mockRejectedValueOnce(new Error("cutout writer: boom"));
      syncCutouts("p1", needed());
      await pass(CUTOUT_SETTLE_MS);
      expect(files()[NAME]?.status).toBe("failed");
      syncCutouts("p1", []);
      expect(files()).toEqual({});
      render.mockResolvedValueOnce(made(NAME));
      syncCutouts("p1", needed());
      await pass(CUTOUT_SETTLE_MS);
      expect(files()[NAME]?.status).toBe("ready");
    } finally { warn.mockRestore(); }
  });

  test("nothing is rendered before the project's folder has been read, and nothing for a project that is not the open one", async () => {
    st().setProject(makeProject({ clips: [clip] }));
    render.mockResolvedValue(made(NAME));
    syncCutouts("p1", needed());                                    // the editor tells before the folder is read
    await pass(CUTOUT_SETTLE_MS);
    expect(render).not.toHaveBeenCalled();
    disk.add(`${DIR}/${NAME}`);
    await openCutouts("p1");
    await pass(CUTOUT_SETTLE_MS);
    expect(render).not.toHaveBeenCalled();                          // it was there all along
    expect(files()[NAME]?.status).toBe("ready");
    // A folder read for a project that is not open any more removes nothing and registers nothing.
    resetCutouts();
    disk.add(`file:///doc/projects/p9/cutout/${NAME}`);
    await openCutouts("p9");
    expect(disk.has(`file:///doc/projects/p9/cutout/${NAME}`)).toBe(true);
    expect(files()).toEqual({});
  });

  test("the sweep asks the OPEN project before each file goes: a copy that became needed meanwhile stays and is ready", async () => {
    const OTHER = "abc-c1-19000-27000.mov";
    for (const name of ["aaa-c1-0-2000.mov", OTHER]) disk.add(`${DIR}/${name}`);
    st().setProject(makeProject({ clips: [{ ...clip, cutout: undefined }] }));
    // While the first orphan is being removed the owner switches a clip on whose copy is the second orphan.
    fs.remove.mockImplementationOnce(async (p: string) => {
      disk.delete(p);
      st().apply((pr) => ({ ...pr, clips: [{ ...clip, trimStart: 20.2, trimEnd: 25.7 }] }));
    });
    await openCutouts("p1");
    expect([...disk]).toEqual([`${DIR}/${OTHER}`]);
    expect(files()).toEqual({ [OTHER]: { status: "ready", uri: `${DIR}/${OTHER}` } });
  });

  test("without the tool nothing is read, removed or rendered", async () => {
    jest.mocked(isCutoutAvailable).mockReturnValue(false);
    disk.add(`${DIR}/zzz-c1-photo.png`);
    await openProject();
    syncCutouts("p1", needed());
    await pass(CUTOUT_SETTLE_MS);
    expect(fs.list).not.toHaveBeenCalled();
    expect(disk.size).toBe(1);
    expect(render).not.toHaveBeenCalled();
    expect(useToast.getState().message).toBeNull();
    expect(files()).toEqual({});
  });
});

describe("useCutoutRenders", () => {
  const flush = async () => { for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve(); }); };
  const pass = async (ms: number) => { await act(async () => { jest.advanceTimersByTime(ms); }); await flush(); };
  /** The manager's own timers that were set (the wait for the stand-still, a cancel's grace): React's are not counted. */
  let timers: jest.SpyInstance;
  const waits = () => timers.mock.calls.filter((c) => c[1] === CUTOUT_SETTLE_MS || c[1] === CUTOUT_CANCEL_GRACE_MS).length;
  beforeEach(() => { jest.useFakeTimers(); timers = jest.spyOn(globalThis, "setTimeout"); });
  afterEach(async () => { timers.mockRestore(); resetCutouts(); jest.runOnlyPendingTimers(); await tick(); jest.useRealTimers(); });

  test("a project with no cut-out clip does nothing at all: one look at its folder when it opens, then no listener, no timer, no file call, no write", async () => {
    jest.mocked(addCutoutListener).mockClear();
    st().setProject(makeProject({ clips: [{ ...clip, cutout: undefined }, makeClip({ id: "b", sourceDuration: 10 })] }));
    const before = useCutoutFiles.getState();
    const hook = await renderHook(() => useCutoutRenders());
    await flush();
    expect(fs.list).toHaveBeenCalledTimes(1);
    expect(fs.list).toHaveBeenCalledWith(DIR);
    expect(waits()).toBe(0);
    await act(async () => { st().beginTransaction(); });
    for (let i = 0; i < 60; i++) await act(async () => { st().applyTransient((p) => ({ ...p, clips: p.clips.map((c) => (c.id === "a" ? { ...c, trimEnd: 9.7 + i / 10 } : c)) })); });
    for (const t of [0.1, 0.2, 0.3]) await act(async () => { st().seek(t); });
    await flush();
    await pass(CUTOUT_SETTLE_MS + CUTOUT_CANCEL_GRACE_MS);
    expect(waits()).toBe(0);
    expect(fs.list).toHaveBeenCalledTimes(1);
    for (const call of [fs.exists, fs.mkdir, fs.remove, addCutoutListener, render, cancelCutout]) expect(call).not.toHaveBeenCalled();
    expect(useCutoutFiles.getState()).toBe(before);
    await hook.unmount();
    expect(useCutoutFiles.getState()).toBe(before);
    expect(cancelCutout).not.toHaveBeenCalled();
  });

  test("a trim drag of sixty steps starts no render while it moves, and one — the last range — once it has stood still", async () => {
    st().setProject(makeProject({ clips: [clip] }));
    render.mockImplementation(async (req) => made(req.outputPath.split("/").pop() ?? ""));
    await renderHook(() => useCutoutRenders());
    await flush();
    await pass(CUTOUT_SETTLE_MS);
    expect(render).toHaveBeenCalledTimes(1);
    expect(files()[NAME]?.status).toBe("ready");
    const project = st().project!;
    await act(async () => { st().beginTransaction(); });
    for (let i = 1; i <= 60; i++) {
      await act(async () => { st().applyTransient((p) => ({ ...p, clips: [{ ...p.clips[0], trimEnd: 9.7 + i / 10 }] })); });   // outwards: past the copy after 3 steps
      await pass(16);
      expect(render).toHaveBeenCalledTimes(1);
    }
    expect(st().project!.clips[0].trimEnd).toBeCloseTo(15.7);
    await pass(CUTOUT_SETTLE_MS - 17);
    expect(render).toHaveBeenCalledTimes(1);
    await pass(1);
    expect(render).toHaveBeenCalledTimes(2);
    expect(render).toHaveBeenLastCalledWith(expect.objectContaining({ outputPath: `${DIR}/abc-c1-3000-17000.mov`, from: 3, to: 17 }));
    expect(cancelCutout).not.toHaveBeenCalled();
    expect(Object.keys(files()).sort()).toEqual([NAME, "abc-c1-3000-17000.mov"]);
    expect(shownCutout(files(), st().project!.clips[0])).toBe(`${DIR}/abc-c1-3000-17000.mov`);
    // Trimmed inwards again, and split: the same copy, nothing to render.
    await act(async () => { st().apply((p) => ({ ...p, clips: [{ ...p.clips[0], trimEnd: 8 }, { ...p.clips[0], id: "a2", trimStart: 8, trimEnd: 12 }] })); });
    await pass(CUTOUT_SETTLE_MS);
    expect(render).toHaveBeenCalledTimes(2);
    expect(project.clips[0].trimEnd).toBe(9.7);                     // the queue wrote no project
  });

  test("an edit that changes no copy, and playback, never reach the manager; the switch does", async () => {
    st().setProject(makeProject({ clips: [{ ...clip, cutout: undefined }] }));
    render.mockResolvedValue(made(NAME));
    const hook = await renderHook(() => useCutoutRenders());
    await flush();
    await act(async () => { st().apply((p) => setClipCutout(p, "a", true)); });
    const on = st().project!;
    expect(waits()).toBe(1);
    await pass(CUTOUT_SETTLE_MS);
    expect(render).toHaveBeenCalledTimes(1);
    expect(files()[NAME]?.status).toBe("ready");
    expect(st().project).toBe(on);
    const after = useCutoutFiles.getState();
    await act(async () => { st().apply((p) => ({ ...p, name: "Renamed" })); });
    for (const t of [0.1, 0.2, 0.3]) await act(async () => { st().seek(t); });
    await flush();
    expect(waits()).toBe(1);                                        // nothing waits to be rendered: no new wait
    expect(useCutoutFiles.getState()).toBe(after);
    // Switched off: nothing is removed (Undo finds the copy); switched on again: ready at once, nothing rendered.
    await act(async () => { st().apply((p) => setClipCutout(p, "a", false)); });
    expect("cutout" in st().project!.clips[0]).toBe(false);
    await act(async () => { st().undo(); });
    await pass(CUTOUT_SETTLE_MS);
    expect(render).toHaveBeenCalledTimes(1);
    expect(fs.remove).not.toHaveBeenCalled();
    expect(shownCutout(files(), st().project!.clips[0])).toBe(`${DIR}/${NAME}`);
    await hook.unmount();
    expect(files()).toEqual({});
  });

  test("a missing source is not rendered; a failing phone is said once, not once per copy; without the tool nothing happens", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      st().setProject(makeProject({ clips: [clip, photo] }), [`${MEDIA}/abc.mov`, `${MEDIA}/p.jpg`]);
      const first = await renderHook(() => useCutoutRenders());
      await flush();
      await pass(CUTOUT_SETTLE_MS);
      expect(render).not.toHaveBeenCalled();
      await first.unmount();
      st().reset();
      useToast.setState(useToast.getInitialState(), true);          // the store's own functions again: zustand carries a spy into every later state
      const show = jest.spyOn(useToast.getState(), "show");
      render.mockRejectedValue(new Error("cutout writer: boom"));
      st().setProject(makeProject({ clips: [clip, photo] }));
      timers.mockClear();
      const second = await renderHook(() => useCutoutRenders());
      await flush();
      await pass(CUTOUT_SETTLE_MS);
      expect(render).toHaveBeenCalledTimes(2);
      expect(files()[NAME]?.status).toBe("failed");
      expect(files()[PNG]?.status).toBe("failed");
      expect(show).toHaveBeenCalledTimes(1);
      expect(st().project!.clips[0].cutout).toBe(true);             // the switch stays on
      await second.unmount();
      show.mockRestore();
      st().reset();
      jest.mocked(isCutoutAvailable).mockReturnValue(false);
      render.mockClear();
      fs.list.mockClear();
      timers.mockClear();
      st().setProject(makeProject({ clips: [clip] }));
      await renderHook(() => useCutoutRenders());
      await flush();
      await pass(CUTOUT_SETTLE_MS);
      expect(render).not.toHaveBeenCalled();
      expect(fs.list).not.toHaveBeenCalled();
      expect(waits()).toBe(0);
      expect(st().project!.clips[0].cutout).toBe(true);
    } finally { warn.mockRestore(); }
  });
});
