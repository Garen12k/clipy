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
    addSoundListener: jest.fn((cb: unknown) => { sound.listener = cb; return { remove() {} }; }),
    SOUND_CANCELLED: "E_SOUND_CANCELLED",
    isSoundCancelled: (e: unknown) => typeof e === "object" && e !== null && (e as { code?: string }).code === "E_SOUND_CANCELLED",
  };
});
import { act, renderHook } from "@testing-library/react-native";
import { cancelSoundRender, isSoundAvailable, renderSound } from "@/modules/clipy-video";
import { newId } from "@/src/lib/id";
import { setTrackSound } from "@/src/editor/model/ops";
import { neededSounds, soundChain } from "@/src/editor/model/sound";
import { makeAudioTrack, makeClip, makeProject, NO_SOUND, type SoundSettings } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { useToast } from "@/src/ui/Toast";
import { isPreparing, playUri, useSoundFiles } from "../soundFiles";
import { ensureSound, holdSounds, resetSounds, SOUND_FAILED, SOUND_UNAVAILABLE, soundDir, sweepSounds, syncSounds, useSoundRenders } from "../soundRenders";

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
  useToast.getState().clear();
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
    holdSounds(true);
    syncSounds("p1", [{ name: DEEP, sourceUri: SRC, sound: deep }]);
    syncSounds("p1", [{ name: HIGH, sourceUri: SRC, sound: high }]);
    await flush();
    expect(render).not.toHaveBeenCalled();
    holdSounds(false);
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
