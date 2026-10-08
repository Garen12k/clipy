jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-07T10:00:00.000Z" }));
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
  const sound: { listener: unknown } = { listener: null };   // typed where it is read: a factory may name nothing from outside, not even in a type
  return {
    __sound: sound,
    isSoundAvailable: jest.fn(() => true), renderSound: jest.fn(), cancelSoundRender: jest.fn(),
    isNoiseBuild: jest.fn(() => true), isNoiseAvailable: jest.fn(() => true),
    addSoundListener: jest.fn((cb: unknown) => { sound.listener = cb; return { remove() {} }; }),
    SOUND_CANCELLED: "E_SOUND_CANCELLED",
    isSoundCancelled: (e: unknown) => typeof e === "object" && e !== null && (e as { code?: string }).code === "E_SOUND_CANCELLED",
  };
});
import { act, renderHook } from "@testing-library/react-native";
import { cancelSoundRender, isNoiseAvailable, isNoiseBuild, isSoundAvailable, renderSound } from "@/modules/clipy-video";
import { newId } from "@/src/lib/id";
import { setTrackSound } from "@/src/editor/model/ops";
import { neededSounds, soundChain } from "@/src/editor/model/sound";
import { makeAudioTrack, makeClip, makeProject, NO_SOUND, type SoundSettings } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { prepareSounds } from "@/src/export/exportSounds";
import { useToast } from "@/src/ui/Toast";
import { isPreparing, playUri, useSoundFiles } from "../soundFiles";
import { ensureSound, holdSounds, NOISE_NOT_ON_PHONE, noiseRefusal, resetSounds, SOUND_CANCEL_GRACE_MS, SOUND_NOISE_DEADLINE_MS, SOUND_FAILED, SOUND_RENDER_DEADLINE_MS, SOUND_UNAVAILABLE, soundDir, sweepSounds, syncSounds, useSoundRenders } from "../soundRenders";

const disk = (jest.requireMock("@/src/projects/expoFs") as { __files: Set<string> }).__files;
const native = (jest.requireMock("@/modules/clipy-video") as { __sound: { listener: null | ((e: { jobId: string; progress: number }) => void) } }).__sound;
const render = jest.mocked(renderSound);
const deep: SoundSettings = { ...NO_SOUND, voice: "deep" };
const high: SoundSettings = { ...NO_SOUND, voice: "high" };
const SRC = "file:///doc/projects/p1/media/v.m4a";
const DIR = "file:///doc/projects/p1/sound";
const DEEP = "v-v1-deep-s50-p0-flat-l0.m4a", HIGH = "v-v1-high-s50-p0-flat-l0.m4a";
const st = () => useEditorStore.getState();
const files = () => useSoundFiles.getState().files;
const flush = async () => { for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve(); }); };
/** A render that stays open until the test settles it. */
function pending() {
  let ok!: () => void, fail!: (e: unknown) => void;
  render.mockImplementationOnce(() => new Promise((res, rej) => { ok = () => res({ fileUri: "x", seconds: 1, gainDb: 0 }); fail = rej; }));
  return { ok: () => ok(), fail: (e: unknown) => fail(e) };
}
const project = (sound?: SoundSettings) => makeProject({ id: "p1", clips: [makeClip({ id: "a", sourceDuration: 20 })],
  audioTracks: [{ ...makeAudioTrack({ id: "v", sourceDuration: 5, sourceUri: SRC, kind: "voice" }), ...(sound ? { sound } : null) }] });

beforeEach(() => {
  jest.clearAllMocks();
  // Job ids count from 1 in every test.
  let n = 0;
  jest.mocked(newId).mockImplementation(() => `job${++n}`);
  jest.mocked(isSoundAvailable).mockReturnValue(true);
  render.mockReset();
  render.mockImplementation(async () => ({ fileUri: "x", seconds: 1, gainDb: 0 }));
  disk.clear();
  resetSounds();
  st().reset();
  // The store's own functions again: a test below spies on `show`, and zustand carries the spy into every later state.
  useToast.setState(useToast.getInitialState(), true);
});

test("soundDir is the project's own folder", () => expect(soundDir("p1")).toBe(DIR));

describe("ensureSound", () => {
  test("renders the copy once: the chain's numbers, the source and the named file; a second caller shares the render", async () => {
    const open = pending();
    const a = ensureSound("p1", SRC, deep);
    const b = ensureSound("p1", SRC, deep);
    await flush();
    expect(render).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledWith({ ...soundChain(deep), jobId: "job1", sourceUri: SRC, outputPath: `${DIR}/${DEEP}` });
    open.ok();
    await expect(a).resolves.toBe(`${DIR}/${DEEP}`);
    await expect(b).resolves.toBe(`${DIR}/${DEEP}`);
  });

  test("a file that is there is used as it is", async () => {
    disk.add(`${DIR}/${DEEP}`);
    await expect(ensureSound("p1", SRC, deep)).resolves.toBe(`${DIR}/${DEEP}`);
    expect(render).not.toHaveBeenCalled();
  });

  test("without the engine it fails with the plain sentence, and nothing is rendered", async () => {
    jest.mocked(isSoundAvailable).mockReturnValue(false);
    await expect(ensureSound("p1", SRC, deep)).rejects.toThrow(SOUND_UNAVAILABLE);
    expect(render).not.toHaveBeenCalled();
  });

  test("progress events of its job reach its listener", async () => {
    const open = pending();
    const seen: number[] = [];
    const done = ensureSound("p1", SRC, deep, (f) => seen.push(f));
    await flush();
    native.listener!({ jobId: "job1", progress: 0.4 });
    native.listener!({ jobId: "other", progress: 0.9 });
    expect(seen).toEqual([0.4]);
    open.ok();
    await done;
  });
});

describe("syncSounds", () => {
  test("renders what is needed, one at a time, and marks each ready", async () => {
    const first = pending();
    syncSounds("p1", [{ name: DEEP, sourceUri: SRC, sound: deep }, { name: HIGH, sourceUri: SRC, sound: high }]);
    await flush();
    expect(files()[DEEP]).toEqual({ status: "busy" });
    expect(files()[HIGH]).toBeUndefined();
    expect(render).toHaveBeenCalledTimes(1);
    first.ok();
    await flush();
    expect(files()[DEEP]).toEqual({ status: "ready", uri: `${DIR}/${DEEP}` });
    expect(files()[HIGH]).toEqual({ status: "ready", uri: `${DIR}/${HIGH}` });
    expect(render).toHaveBeenCalledTimes(2);
  });

  test("a newer pick cancels a render nobody needs any more, and only the newest is rendered", async () => {
    const first = pending();
    syncSounds("p1", [{ name: DEEP, sourceUri: SRC, sound: deep }]);
    await flush();
    syncSounds("p1", [{ name: HIGH, sourceUri: SRC, sound: high }]);
    expect(cancelSoundRender).toHaveBeenCalledWith("job1");
    first.fail(Object.assign(new Error("Sound cancelled"), { code: "E_SOUND_CANCELLED" }));
    await flush();
    expect(files()[DEEP]).toBeUndefined();
    expect(files()[HIGH]).toEqual({ status: "ready", uri: `${DIR}/${HIGH}` });
    expect(useToast.getState().message).toBeNull();
  });

  test("a failure: marked failed, said once, and not tried again for the same setting", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    render.mockRejectedValueOnce(Object.assign(new Error("sound engine: boom"), { code: "E_SOUND" }));
    syncSounds("p1", [{ name: DEEP, sourceUri: SRC, sound: deep }]);
    await flush();
    expect(files()[DEEP]).toEqual({ status: "failed", message: "sound engine: boom" });
    expect(useToast.getState().message).toBe(SOUND_FAILED);
    expect(warn).toHaveBeenCalledWith("sound render failed", "sound engine: boom");
    syncSounds("p1", [{ name: DEEP, sourceUri: SRC, sound: deep }]);
    await flush();
    expect(render).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  test("nothing is rendered while a slider is held; releasing it renders what is needed then", async () => {
    holdSounds("v");
    syncSounds("p1", [{ name: DEEP, sourceUri: SRC, sound: deep }]);
    syncSounds("p1", [{ name: HIGH, sourceUri: SRC, sound: high }]);
    await flush();
    expect(render).not.toHaveBeenCalled();
    holdSounds(null);
    await flush();
    expect(render).toHaveBeenCalledTimes(1);
    expect(files()[HIGH]).toEqual({ status: "ready", uri: `${DIR}/${HIGH}` });
    expect(files()[DEEP]).toBeUndefined();
  });
});

test("playUri and isPreparing: the copy only once it is ready; everything else is the original", () => {
  const plain = makeAudioTrack({ id: "v", sourceDuration: 5, sourceUri: SRC });
  const changed = { ...plain, sound: deep };
  expect(playUri({}, plain)).toBe(SRC);
  expect(playUri({}, changed)).toBe(SRC);
  expect(playUri({ [DEEP]: { status: "busy" } }, changed)).toBe(SRC);
  expect(playUri({ [DEEP]: { status: "failed", message: "x" } }, changed)).toBe(SRC);
  expect(playUri({ [DEEP]: { status: "ready", uri: `${DIR}/${DEEP}` } }, changed)).toBe(`${DIR}/${DEEP}`);
  expect(playUri({ [DEEP]: { status: "ready", uri: `${DIR}/${DEEP}` } }, plain)).toBe(SRC);
  expect(isPreparing({ [DEEP]: { status: "busy" } }, changed)).toBe(true);
  expect(isPreparing({ [DEEP]: { status: "busy" } }, plain)).toBe(false);
  expect(isPreparing({}, changed)).toBe(false);
  expect(isPreparing({}, null)).toBe(false);
});

test("sweepSounds removes copies no track needs (and leftover part files), never one that is needed now", async () => {
  disk.add(`${DIR}/${DEEP}`); disk.add(`${DIR}/${HIGH}`); disk.add(`${DIR}/part-${HIGH}`); disk.add(`${DIR}/part-${DEEP}`);
  disk.add("file:///doc/projects/p1/media/v.m4a");
  st().setProject(project(deep));
  await sweepSounds("p1");
  expect([...disk].sort()).toEqual(["file:///doc/projects/p1/media/v.m4a", `${DIR}/${DEEP}`, `${DIR}/part-${DEEP}`].sort());
});

describe("useSoundRenders", () => {
  test("renders the copies the open project needs, and again when a setting changes — but not for an edit that changes no setting", async () => {
    st().setProject(project(deep));
    await renderHook(() => useSoundRenders());
    await flush();
    expect(render).toHaveBeenCalledTimes(1);
    expect(files()[DEEP]?.status).toBe("ready");
    await act(async () => { st().apply((p) => ({ ...p, name: "Renamed" })); });
    await flush();
    expect(render).toHaveBeenCalledTimes(1);
    await act(async () => { st().apply((p) => setTrackSound(p, "v", { voice: "high" })); });
    await flush();
    expect(render).toHaveBeenCalledTimes(2);
    expect(files()[HIGH]?.status).toBe("ready");
  });

  test("a project without settings renders nothing; without the engine nothing is rendered either and the settings stay", async () => {
    st().setProject(project());
    const first = await renderHook(() => useSoundRenders());
    await flush();
    expect(render).not.toHaveBeenCalled();
    await first.unmount();
    jest.mocked(isSoundAvailable).mockReturnValue(false);
    st().setProject(project(deep));
    await renderHook(() => useSoundRenders());
    await flush();
    expect(render).not.toHaveBeenCalled();
    expect(st().project!.audioTracks[0].sound).toEqual(deep);
    expect(neededSounds(st().project!)).toHaveLength(1);
  });

  test("a missing source is not rendered; leaving the editor forgets every file and cancels what is running", async () => {
    st().setProject(project(deep), [SRC]);
    const hook = await renderHook(() => useSoundRenders());
    await flush();
    expect(render).not.toHaveBeenCalled();
    const open = pending();
    await act(async () => { st().setProject(project(deep)); });
    await flush();
    expect(files()[DEEP]).toEqual({ status: "busy" });
    await hook.unmount();
    expect(cancelSoundRender).toHaveBeenCalledWith(expect.stringMatching(/^job/));
    expect(files()).toEqual({});
    open.fail(Object.assign(new Error("Sound cancelled"), { code: "E_SOUND_CANCELLED" }));
    await flush();
    expect(files()).toEqual({});
  });
});

describe("beyond the brief", () => {
  test("a pick that is replaced before its render has begun is never rendered at all", async () => {
    syncSounds("p1", [{ name: DEEP, sourceUri: SRC, sound: deep }]);
    syncSounds("p1", [{ name: HIGH, sourceUri: SRC, sound: high }]);
    await flush();
    expect(render).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledWith(expect.objectContaining({ outputPath: `${DIR}/${HIGH}` }));
    expect(files()).toEqual({ [HIGH]: { status: "ready", uri: `${DIR}/${HIGH}` } });
    expect(useToast.getState().message).toBeNull();
  });

  test("a cancel the native side refuses does not stop the editor from being left", async () => {
    const open = pending();
    syncSounds("p1", [{ name: DEEP, sourceUri: SRC, sound: deep }]);
    await flush();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.mocked(cancelSoundRender).mockImplementationOnce(() => { throw new Error("not linked"); });
    expect(() => resetSounds()).not.toThrow();
    warn.mockRestore();
    expect(files()).toEqual({});
    open.ok();
    await flush();
    expect(files()).toEqual({});   // the answer of a project that is no longer open is dropped
  });

  test("a failure is said once however often the same need is repeated, and a new setting is tried", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const show = jest.spyOn(useToast.getState(), "show");
    render.mockRejectedValueOnce(Object.assign(new Error("sound engine: boom"), { code: "E_SOUND" }));
    st().setProject(project(deep));
    const hook = await renderHook(() => useSoundRenders());
    await flush();
    for (let i = 0; i < 3; i++) { await hook.rerender({}); await act(async () => { st().seek(i + 1); }); }
    await flush();
    expect(show).toHaveBeenCalledTimes(1);
    expect(st().project!.audioTracks[0].sound).toEqual(deep);       // the setting stays
    await act(async () => { st().apply((p) => setTrackSound(p, "v", { voice: "high" })); });
    await flush();
    expect(files()[HIGH]?.status).toBe("ready");
    expect(show).toHaveBeenCalledTimes(1);
    show.mockRestore(); warn.mockRestore();
  });

  test("playback never reaches the manager: playhead ticks write nothing and render nothing", async () => {
    st().setProject(project(deep));
    await renderHook(() => useSoundRenders());
    await flush();
    const before = useSoundFiles.getState();
    for (const t of [0.1, 0.2, 0.3]) await act(async () => { st().seek(t); });
    await flush();
    expect(useSoundFiles.getState()).toBe(before);                  // not one store write
    expect(render).toHaveBeenCalledTimes(1);
  });

  test("the sweep runs when a project is opened and never again while it is edited", async () => {
    const fs = (jest.requireMock("@/src/projects/expoFs") as { expoFs: { list: jest.Mock } }).expoFs;
    disk.add(`${DIR}/${DEEP}`); disk.add(`${DIR}/${HIGH}`);
    st().setProject(project(deep));
    await renderHook(() => useSoundRenders());
    await flush();
    expect(fs.list).toHaveBeenCalledTimes(1);
    expect([...disk]).toEqual([`${DIR}/${DEEP}`]);
    disk.add(`${DIR}/${HIGH}`);
    await act(async () => { st().apply((p) => setTrackSound(p, "v", { voice: null })); });   // DEEP is an orphan now: Undo must find it
    await flush();
    expect(fs.list).toHaveBeenCalledTimes(1);
    expect([...disk].sort()).toEqual([`${DIR}/${DEEP}`, `${DIR}/${HIGH}`].sort());
  });
});

describe("the queue is never hostage to the native side", () => {
  /** A render the native side never answers. */
  const never = () => render.mockImplementationOnce(() => new Promise(() => {}));
  const pass = async (ms: number) => { await act(async () => { jest.advanceTimersByTime(ms); }); await flush(); };
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { resetSounds(); jest.runOnlyPendingTimers(); jest.useRealTimers(); });

  test("the two waits are named: four seconds for a cancelled render, two minutes for any copy", () => {
    expect(SOUND_CANCEL_GRACE_MS).toBe(4000);
    expect(SOUND_RENDER_DEADLINE_MS).toBe(120000);
  });

  test("a cancelled render that never answers does not block the next pick", async () => {
    never();
    syncSounds("p1", [{ name: DEEP, sourceUri: SRC, sound: deep }]);
    await flush();
    syncSounds("p1", [{ name: HIGH, sourceUri: SRC, sound: high }]);
    await flush();
    expect(cancelSoundRender).toHaveBeenCalledWith("job1");
    expect(render).toHaveBeenCalledTimes(1);                       // it is given a moment to say it stopped
    await pass(SOUND_CANCEL_GRACE_MS - 1);
    expect(render).toHaveBeenCalledTimes(1);
    await pass(1);
    expect(render).toHaveBeenCalledTimes(2);
    expect(render).toHaveBeenLastCalledWith(expect.objectContaining({ outputPath: `${DIR}/${HIGH}` }));
    expect(files()).toEqual({ [HIGH]: { status: "ready", uri: `${DIR}/${HIGH}` } });
    expect(useToast.getState().message).toBeNull();                // a cancel is not a failure
    // Its deadline went with it: nothing more happens to it, however long the native side stays silent.
    jest.mocked(cancelSoundRender).mockClear();
    const after = useSoundFiles.getState();
    await pass(SOUND_RENDER_DEADLINE_MS);
    expect(cancelSoundRender).not.toHaveBeenCalled();
    expect(useSoundFiles.getState()).toBe(after);
  });

  test("a cancelled render that answers late (done, or failed) changes nothing and says nothing", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    for (const late of ["ok", "fail"] as const) {
      const open = pending();
      syncSounds("p1", [{ name: DEEP, sourceUri: SRC, sound: deep }]);
      await flush();
      syncSounds("p1", [{ name: HIGH, sourceUri: SRC, sound: high }]);
      await pass(SOUND_CANCEL_GRACE_MS);
      const before = useSoundFiles.getState();
      expect(before.files).toEqual({ [HIGH]: { status: "ready", uri: `${DIR}/${HIGH}` } });
      if (late === "ok") open.ok(); else open.fail(Object.assign(new Error("sound engine: late"), { code: "E_SOUND" }));
      await flush();
      expect(useSoundFiles.getState()).toBe(before);               // not one write for a job nobody waits for
      expect(useToast.getState().message).toBeNull();
      resetSounds();
    }
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  test("a cancelled render that does say it stopped moves the queue on at once, and its wait is taken down", async () => {
    const open = pending();
    syncSounds("p1", [{ name: DEEP, sourceUri: SRC, sound: deep }]);
    await flush();
    syncSounds("p1", [{ name: HIGH, sourceUri: SRC, sound: high }]);
    open.fail(Object.assign(new Error("Sound cancelled"), { code: "E_SOUND_CANCELLED" }));
    await flush();
    expect(files()).toEqual({ [HIGH]: { status: "ready", uri: `${DIR}/${HIGH}` } });
    const after = useSoundFiles.getState();
    await pass(SOUND_CANCEL_GRACE_MS + SOUND_RENDER_DEADLINE_MS);
    expect(useSoundFiles.getState()).toBe(after);
    expect(cancelSoundRender).toHaveBeenCalledTimes(1);            // the cancel itself: no deadline came after it
  });

  test("a render nobody cancelled that never answers fails after the deadline, is told to stop, and the queue goes on", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    never();
    syncSounds("p1", [{ name: DEEP, sourceUri: SRC, sound: deep }, { name: HIGH, sourceUri: SRC, sound: high }]);
    await flush();
    await pass(SOUND_RENDER_DEADLINE_MS - 1);
    expect(files()).toEqual({ [DEEP]: { status: "busy" } });
    expect(render).toHaveBeenCalledTimes(1);
    await pass(1);
    expect(files()[DEEP]).toEqual({ status: "failed", message: "sound render: no answer after 120 s" });
    expect(cancelSoundRender).toHaveBeenCalledWith("job1");
    expect(useToast.getState().message).toBe(SOUND_FAILED);
    expect(warn).toHaveBeenCalledWith("sound render failed", "sound render: no answer after 120 s");
    expect(files()[HIGH]).toEqual({ status: "ready", uri: `${DIR}/${HIGH}` });
    warn.mockRestore();
  });

  test("the wait of the export ends the same way: ensureSound rejects with a staged sentence", async () => {
    never();
    const asked = ensureSound("p1", SRC, deep);
    const seen = asked.then(() => "done", (e: Error) => e.message);
    await flush();
    await pass(SOUND_RENDER_DEADLINE_MS);
    await expect(seen).resolves.toBe("sound render: no answer after 120 s");
    // Nothing is left behind: the same copy can be asked for again.
    const again = ensureSound("p1", SRC, deep);
    await flush();
    await expect(again).resolves.toBe(`${DIR}/${DEEP}`);
    expect(render).toHaveBeenCalledTimes(2);
  });

  test("a render that answers in time leaves no wait behind: nothing happens when the deadline would have come", async () => {
    syncSounds("p1", [{ name: DEEP, sourceUri: SRC, sound: deep }]);
    await flush();
    expect(files()[DEEP]?.status).toBe("ready");
    const after = useSoundFiles.getState();
    await pass(SOUND_RENDER_DEADLINE_MS);
    expect(cancelSoundRender).not.toHaveBeenCalled();
    expect(useSoundFiles.getState()).toBe(after);
    expect(useToast.getState().message).toBeNull();
  });

  test("leaving the editor while the native side is stuck: the next project starts its renders after the grace", async () => {
    never();
    syncSounds("p1", [{ name: DEEP, sourceUri: SRC, sound: deep }]);
    await flush();
    resetSounds();
    syncSounds("p2", [{ name: HIGH, sourceUri: "file:///doc/projects/p2/media/v.m4a", sound: high }]);
    await pass(SOUND_CANCEL_GRACE_MS);
    expect(files()).toEqual({ [HIGH]: { status: "ready", uri: `file:///doc/projects/p2/sound/${HIGH}` } });
  });
});

describe("a slider drag", () => {
  const STRONG = "v-v1-deep-s80-p0-flat-l0.m4a", ALMOST = "v-v1-deep-s75-p0-flat-l0.m4a";

  test("holdSounds takes the id of the dragged track; null lets go; leaving the editor lets go too", () => {
    holdSounds("v");
    expect(useSoundFiles.getState()).toMatchObject({ hold: true, holdTrack: "v" });
    holdSounds(null);
    expect(useSoundFiles.getState()).toMatchObject({ hold: false, holdTrack: null });
    const rested = useSoundFiles.getState();
    holdSounds(null);
    expect(useSoundFiles.getState()).toBe(rested);                 // nothing held: no write
    holdSounds("v");
    resetSounds();
    expect(useSoundFiles.getState()).toMatchObject({ hold: false, holdTrack: null });
  });

  test("the release renders the FINAL value, read from the project, not the one the manager was last told", async () => {
    st().setProject(project({ ...deep, strength: 0.7 }));
    holdSounds("v");
    // The frame before the last: this is all the manager has been told when the finger lifts.
    syncSounds("p1", [{ name: ALMOST, sourceUri: SRC, sound: { ...deep, strength: 0.75 } }]);
    st().setProject(project({ ...deep, strength: 0.8 }));
    holdSounds(null);
    await flush();
    expect(render).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledWith(expect.objectContaining({ outputPath: `${DIR}/${STRONG}` }));
    expect(files()).toEqual({ [STRONG]: { status: "ready", uri: `${DIR}/${STRONG}` } });
    expect(cancelSoundRender).not.toHaveBeenCalled();
  });

  test("through the hook: a held drag renders nothing, and one copy (the last value) on release", async () => {
    st().setProject(project(deep));
    await renderHook(() => useSoundRenders());
    await flush();
    expect(render).toHaveBeenCalledTimes(1);
    holdSounds("v");
    await act(async () => { st().beginTransaction(); });
    for (const strength of [0.6, 0.7, 0.75]) await act(async () => { st().applyTransient((p) => setTrackSound(p, "v", { strength })); });
    // The last value and the release in one go: no effect has run in between.
    await act(async () => { st().applyTransient((p) => setTrackSound(p, "v", { strength: 0.8 })); holdSounds(null); });
    await flush();
    expect(render).toHaveBeenCalledTimes(2);
    expect(render).toHaveBeenLastCalledWith(expect.objectContaining({ outputPath: `${DIR}/${STRONG}` }));
    expect(cancelSoundRender).not.toHaveBeenCalled();
  });
});

describe("a failing engine is said once, not once per copy", () => {
  /** Every sentence said from now on (the store's `show` is put back before each test). */
  const said = () => { const out: string[] = []; useToast.setState({ show: (message: string) => { out.push(message); } }); return { out }; };

  test("many copies fail in one go: each is marked failed, one sentence", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    render.mockRejectedValue(Object.assign(new Error("sound engine: boom"), { code: "E_SOUND" }));
    const { out } = said();
    const needed = Array.from({ length: 12 }, (_, i) => ({ name: `t${i}-v1-deep-s50-p0-flat-l0.m4a`, sourceUri: `file:///doc/projects/p1/media/t${i}.m4a`, sound: deep }));
    syncSounds("p1", needed);
    for (let i = 0; i < 12; i++) await flush();
    expect(Object.values(files()).map((f) => f.status)).toEqual(Array(12).fill("failed"));
    expect(out).toEqual([SOUND_FAILED]);
    expect(warn).toHaveBeenCalledTimes(12);                        // the dev log still has every one
    // A new pick that fails is said again: it is a new thing the owner asked for.
    syncSounds("p1", [...needed, { name: HIGH, sourceUri: SRC, sound: high }]);
    await flush();
    expect(out).toEqual([SOUND_FAILED, SOUND_FAILED]);
    // And after the project is opened again.
    resetSounds();
    syncSounds("p1", needed.slice(0, 3));
    for (let i = 0; i < 3; i++) await flush();
    expect(out).toEqual([SOUND_FAILED, SOUND_FAILED, SOUND_FAILED]);
    warn.mockRestore();
  });
});

describe("PROOF: a setting without noise is rendered exactly as before Reduce noise existed", () => {
  // Written before the manager knew Reduce noise and green then; never edited to make a change pass.
  const pass = async (ms: number) => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); jest.advanceTimersByTime(ms); for (let i = 0; i < 8; i++) await Promise.resolve(); }); };
  // The worst case: a build from before Reduce noise, on a phone without the unit.
  beforeEach(() => { jest.mocked(isNoiseBuild).mockReturnValue(false); jest.mocked(isNoiseAvailable).mockReturnValue(false); });
  afterEach(() => { resetSounds(); jest.useRealTimers(); jest.mocked(isNoiseBuild).mockReturnValue(true); jest.mocked(isNoiseAvailable).mockReturnValue(true); });

  test("the same one native call under the same name, and the noise questions are never asked", async () => {
    await expect(ensureSound("p1", SRC, deep)).resolves.toBe("file:///doc/projects/p1/sound/v-v1-deep-s50-p0-flat-l0.m4a");
    expect(render).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledWith({ ...soundChain(deep), jobId: "job1", sourceUri: SRC, outputPath: "file:///doc/projects/p1/sound/v-v1-deep-s50-p0-flat-l0.m4a" });
    expect(render.mock.calls[0][0].noiseWet).toBe(0);
    await expect(ensureSound("p1", SRC, { ...NO_SOUND, level: true })).resolves.toMatch(/-l1\.m4a$/);
    expect(render).toHaveBeenCalledTimes(2);
    expect(isNoiseBuild).not.toHaveBeenCalled();
    expect(isNoiseAvailable).not.toHaveBeenCalled();
    expect(cancelSoundRender).not.toHaveBeenCalled();
  });

  test("through the editor's queue: ready, nothing said", async () => {
    syncSounds("p1", [{ name: DEEP, sourceUri: SRC, sound: deep }, { name: HIGH, sourceUri: SRC, sound: high }]);
    await flush();
    expect(files()).toEqual({ [DEEP]: { status: "ready", uri: `${DIR}/${DEEP}` }, [HIGH]: { status: "ready", uri: `${DIR}/${HIGH}` } });
    expect(useToast.getState().message).toBeNull();
    expect(isNoiseBuild).not.toHaveBeenCalled();
    expect(isNoiseAvailable).not.toHaveBeenCalled();
  });

  test("its deadline is two minutes to the millisecond, with the same sentence", async () => {
    jest.useFakeTimers();
    render.mockReturnValue(new Promise(() => {}));                       // the native side never answers
    const outcome = jest.fn();
    ensureSound("p1", SRC, deep).then(outcome, outcome);
    await pass(119999);
    expect(outcome).not.toHaveBeenCalled();
    expect(cancelSoundRender).not.toHaveBeenCalled();
    await pass(1);
    expect(outcome).toHaveBeenCalledTimes(1);
    expect((outcome.mock.calls[0][0] as Error).message).toBe("sound render: no answer after 120 s");
    expect(cancelSoundRender).toHaveBeenCalledTimes(1);
    expect(cancelSoundRender).toHaveBeenCalledWith("job1");
  });
});

describe("Reduce noise in the manager", () => {
  const noisy: SoundSettings = { ...NO_SOUND, noise: 0.5 };
  const COPY = `${DIR}/v-v1-plain-s0-p0-flat-l0-n50.m4a`;
  const pass = async (ms: number) => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); jest.advanceTimersByTime(ms); for (let i = 0; i < 8; i++) await Promise.resolve(); }); };

  beforeEach(() => {
    disk.clear();
    resetSounds();
    render.mockReset();
    jest.mocked(cancelSoundRender).mockClear();
    jest.mocked(isSoundAvailable).mockReturnValue(true);
    jest.mocked(isNoiseBuild).mockReturnValue(true);
    jest.mocked(isNoiseAvailable).mockReturnValue(true);
    jest.mocked(newId).mockReturnValue("job-n");
  });
  afterEach(() => { jest.useRealTimers(); });

  test("noiseRefusal: the build first, then the phone", () => {
    expect(noiseRefusal()).toBeNull();
    jest.mocked(isNoiseAvailable).mockReturnValue(false);
    expect(noiseRefusal()).toBe(NOISE_NOT_ON_PHONE);
    jest.mocked(isNoiseBuild).mockReturnValue(false);
    expect(noiseRefusal()).toBe("Reduce noise and Read aloud need the latest Clipy build. Install it from the newest build link.");
    expect(NOISE_NOT_ON_PHONE).toBe("This iPhone cannot reduce noise.");
  });

  test("a noise setting is rendered with the mix in the request and under its own name", async () => {
    render.mockResolvedValue({ fileUri: COPY, seconds: 5, gainDb: 0 });
    await expect(ensureSound("p1", SRC, noisy)).resolves.toBe(COPY);
    expect(render).toHaveBeenCalledWith({ ...soundChain(noisy), jobId: "job-n", sourceUri: SRC, outputPath: COPY });
    expect(render.mock.calls[0][0].noiseWet).toBe(87.5);
  });

  test("on a build or a phone without it the native side is never asked: an older build would render without the unit under this name", async () => {
    jest.mocked(isNoiseBuild).mockReturnValue(false);
    jest.mocked(isNoiseAvailable).mockReturnValue(false);
    await expect(ensureSound("p1", SRC, noisy)).rejects.toThrow(/latest Clipy build/);
    jest.mocked(isNoiseBuild).mockReturnValue(true);
    await expect(ensureSound("p1", SRC, noisy)).rejects.toThrow(NOISE_NOT_ON_PHONE);
    expect(render).not.toHaveBeenCalled();
    // A setting without noise does not ask the question at all.
    render.mockResolvedValue({ fileUri: "x", seconds: 5, gainDb: 0 });
    await expect(ensureSound("p1", SRC, deep)).resolves.toMatch(/-deep-/);
    expect(render).toHaveBeenCalledTimes(1);
  });

  test("a copy that is already on disk is used without asking anything", async () => {
    disk.add(COPY);
    jest.mocked(isNoiseAvailable).mockReturnValue(false);
    await expect(ensureSound("p1", SRC, noisy)).resolves.toBe(COPY);
    expect(render).not.toHaveBeenCalled();
  });

  test("a render with noise has ten minutes; one without keeps its two", async () => {
    expect(SOUND_NOISE_DEADLINE_MS).toBe(600000);
    jest.useFakeTimers();
    render.mockReturnValue(new Promise(() => {}));                       // the native side never answers
    const slow = ensureSound("p1", SRC, noisy);
    const outcome = jest.fn();
    slow.then(outcome, outcome);
    await pass(SOUND_RENDER_DEADLINE_MS + 1000);
    expect(outcome).not.toHaveBeenCalled();                              // still waiting after the plain deadline
    expect(cancelSoundRender).not.toHaveBeenCalled();
    await pass(SOUND_NOISE_DEADLINE_MS);
    expect(outcome).toHaveBeenCalledTimes(1);
    expect((outcome.mock.calls[0][0] as Error).message).toBe("sound render: no answer after 600 s");
    expect(cancelSoundRender).toHaveBeenCalledWith("job-n");
  });

  test("the lightest strength (0) is ON: refused where it cannot run, ten minutes where it can", async () => {
    const lightest: SoundSettings = { ...NO_SOUND, noise: 0 };
    jest.mocked(isNoiseBuild).mockReturnValue(false);
    await expect(ensureSound("p1", SRC, lightest)).rejects.toThrow(/latest Clipy build/);
    expect(render).not.toHaveBeenCalled();
    jest.mocked(isNoiseBuild).mockReturnValue(true);
    jest.useFakeTimers();
    render.mockReturnValue(new Promise(() => {}));
    const outcome = jest.fn();
    ensureSound("p1", SRC, lightest).then(outcome, outcome);
    await pass(SOUND_RENDER_DEADLINE_MS + 1000);
    expect(render).toHaveBeenCalledWith(expect.objectContaining({ noiseWet: 50, outputPath: `${DIR}/v-v1-plain-s0-p0-flat-l0-n0.m4a` }));
    expect(outcome).not.toHaveBeenCalled();
    await pass(SOUND_NOISE_DEADLINE_MS);
    expect(outcome).toHaveBeenCalledTimes(1);
  });

  test("a cancelled render with noise still waits only the four seconds", async () => {
    jest.useFakeTimers();
    render.mockReturnValue(new Promise(() => {}));
    const outcome = jest.fn();
    ensureSound("p1", SRC, noisy).then(outcome, outcome);
    await pass(1000);
    resetSounds();
    expect(cancelSoundRender).toHaveBeenCalledWith("job-n");
    await pass(SOUND_CANCEL_GRACE_MS - 1);
    expect(outcome).not.toHaveBeenCalled();
    await pass(1);
    expect((outcome.mock.calls[0][0] as { code?: string }).code).toBe("E_SOUND_CANCELLED");
  });

  test("a project that holds a noise setting on such a build: not rendered, failed with the reason, said once, the setting stays and the original plays", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.mocked(isNoiseBuild).mockReturnValue(false);
    jest.mocked(isNoiseAvailable).mockReturnValue(false);
    render.mockResolvedValue({ fileUri: "x", seconds: 5, gainDb: 0 });
    const said: string[] = [];
    useToast.setState({ show: (message: string) => { said.push(message); } });
    st().setProject(project(noisy));
    const before = st().project;
    const name = neededSounds(before!)[0].name;
    const hook = await renderHook(() => useSoundRenders());
    await flush();
    for (let i = 0; i < 3; i++) { await hook.rerender({}); await act(async () => { st().seek(i + 1); }); }
    await flush();
    expect(render).not.toHaveBeenCalled();
    expect(files()).toEqual({ [name]: { status: "failed", message: "Reduce noise and Read aloud need the latest Clipy build. Install it from the newest build link." } });
    expect(said).toEqual([SOUND_FAILED]);
    expect(st().project).toBe(before);                                   // the project is not written
    expect(st().project!.audioTracks[0].sound).toEqual(noisy);
    expect(playUri(files(), st().project!.audioTracks[0])).toBe(SRC);
    // The other copies of the project are still rendered: only the noise one is refused.
    syncSounds("p1", [{ name, sourceUri: SRC, sound: noisy }, { name: HIGH, sourceUri: SRC, sound: high }]);
    await flush();
    expect(files()[HIGH]).toEqual({ status: "ready", uri: `${DIR}/${HIGH}` });
    expect(render).toHaveBeenCalledTimes(1);
    await hook.unmount();
    warn.mockRestore();
  });

  test("the export stops with the plain reason instead of waiting", async () => {
    jest.mocked(isNoiseAvailable).mockReturnValue(false);
    const track = { ...makeAudioTrack({ id: "v", sourceDuration: 5, sourceUri: SRC, kind: "voice" }), sound: noisy };
    await expect(prepareSounds("p1", [track], () => {})).rejects.toThrow("Could not prepare a sound for the export: This iPhone cannot reduce noise.");
    jest.mocked(isNoiseBuild).mockReturnValue(false);
    await expect(prepareSounds("p1", [track], () => {})).rejects.toThrow("Could not prepare a sound for the export: Reduce noise and Read aloud need the latest Clipy build. Install it from the newest build link.");
    expect(render).not.toHaveBeenCalled();
  });
});
