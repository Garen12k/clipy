jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-09T10:00:00.000Z" }));
jest.mock("@/src/lib/id", () => { let n = 0; return { newId: () => `job-${++n}` }; });
jest.mock("@/src/projects", () => ({ storage: { projectDir: (id: string) => `file:///doc/projects/${id}` } }));
jest.mock("@/src/projects/expoFs", () => {
  const files = new Map<string, string>();
  return { __files: files, expoFs: {
    exists: jest.fn(async (p: string) => files.has(p)), mkdir: jest.fn(async () => {}),
    readText: jest.fn(async (p: string) => { const t = files.get(p); if (t === undefined) throw new Error("no file"); return t; }),
    writeText: jest.fn(async (p: string, text: string) => { files.set(p, text); }),
    list: jest.fn(async (dir: string) => [...files.keys()].filter((f) => f.startsWith(`${dir}/`)).map((f) => f.slice(dir.length + 1))),
    remove: jest.fn(async (p: string) => { files.delete(p); }),
  } };
});
jest.mock("@/modules/clipy-video", () => ({
  isPeaksAvailable: jest.fn(() => true), soundPeaks: jest.fn(), cancelSoundPeaks: jest.fn(),
  PEAKS_CANCELLED: "E_PEAKS_CANCELLED",
  isPeaksCancelled: (e: unknown) => typeof e === "object" && e !== null && (e as { code?: string }).code === "E_PEAKS_CANCELLED",
}));
import { act, renderHook } from "@testing-library/react-native";
import { cancelSoundPeaks, isPeaksAvailable, soundPeaks, type SoundPeaksRequest, type SoundPeaksResult } from "@/modules/clipy-video";
import { moveAudioTrack, setTrackSound, updateAudioTrackById } from "@/src/editor/model/ops";
import { decodePeaks, encodePeaks, peaksFileName, peaksPlan } from "@/src/editor/model/peaks";
import { makeAudioTrack, makeClip, makeProject, NO_SOUND } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { expoFs } from "@/src/projects/expoFs";
import { readyPeaks, usePeaksFiles } from "../peaksFiles";
import { PEAKS_CANCEL_GRACE_MS, PEAKS_DEADLINE_MS, PEAKS_SETTLE_MS, peaksDir, peaksSources, resetPeaks, sweepPeaks, syncPeaks, useWaveforms } from "../soundPeaks";

const disk = (jest.requireMock("@/src/projects/expoFs") as { __files: Map<string, string> }).__files;
const SONG = "file:///doc/projects/p1/media/song.m4a", VOICE = "file:///doc/projects/p1/media/voice.m4a", SFX = "file:///bundle/whoosh.wav";
const project = (id = "p1") => makeProject({ id, clips: [makeClip({ id: "a", sourceDuration: 20 })], audioTracks: [
  makeAudioTrack({ id: "m1", sourceUri: SONG, title: "Song", sourceDuration: 180, start: 0, trimStart: 0, trimEnd: 60 }),
  makeAudioTrack({ id: "v1", kind: "voice", sourceUri: VOICE, title: "Voice", sourceDuration: 6, start: 2 }),
  makeAudioTrack({ id: "m2", sourceUri: SONG, title: "Song", sourceDuration: 180, start: 60, trimStart: 60, trimEnd: 90 }),
] });

/** The native side: every call is kept until the test answers it. */
type Call = { req: SoundPeaksRequest; resolve: (r: SoundPeaksResult) => void; reject: (e: unknown) => void };
let calls: Call[] = [];
const answer = (c: Call, level = 0.5) => c.resolve({ from: c.req.from, to: c.req.to, peaks: Array.from({ length: c.req.count }, () => level) });
/** Lets the loop's awaits run, then the settle wait (two looks), then its awaits again. */
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const settle = async () => { await flush(); await jest.advanceTimersByTimeAsync(PEAKS_SETTLE_MS); await flush(); };

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  jest.mocked(isPeaksAvailable).mockReturnValue(true);
  calls = [];
  jest.mocked(soundPeaks).mockImplementation((req) => new Promise<SoundPeaksResult>((resolve, reject) => { calls.push({ req, resolve, reject }); }));
  disk.clear();
  resetPeaks();
  usePeaksFiles.setState({ files: {} });
  useEditorStore.getState().reset();
  useEditorStore.getState().setProject(project());
  jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => { resetPeaks(); await jest.advanceTimersByTimeAsync(PEAKS_CANCEL_GRACE_MS + PEAKS_SETTLE_MS); await flush(); jest.useRealTimers(); jest.restoreAllMocks(); });

const sources = () => peaksSources(useEditorStore.getState().project!, useEditorStore.getState().missingSourceUris);
const ready = (uri: string) => readyPeaks(usePeaksFiles.getState().files, uri);

describe("which files", () => {
  test("every different file of the sound bars once, with the length the project knows — the ORIGINAL, also for a track with a sound setting", () => {
    expect(sources()).toEqual([{ uri: SONG, duration: 180 }, { uri: VOICE, duration: 6 }]);
    useEditorStore.getState().apply((p) => setTrackSound(p, "v1", { ...NO_SOUND, voice: "deep" }));
    expect(sources()).toEqual([{ uri: SONG, duration: 180 }, { uri: VOICE, duration: 6 }]);
  });
  test("a missing file is left out", () => {
    expect(peaksSources(project(), [SONG])).toEqual([{ uri: VOICE, duration: 6 }]);
  });
});

describe("the queue", () => {
  test("one call at a time, in the plan's order, then the next file; the outline is there when the file's last call has answered", async () => {
    syncPeaks("p1", sources());
    await flush();
    expect(calls).toHaveLength(0);          // not before the editor has stood still
    await settle();
    expect(calls).toHaveLength(1);
    const plan = peaksPlan(180);
    for (let i = 0; i < plan.length; i++) {
      expect(calls).toHaveLength(i + 1);    // never a second before the first has answered
      expect(calls[i].req).toMatchObject({ uri: SONG, ...plan[i] });
      expect(ready(SONG)).toBeNull();
      answer(calls[i], (i + 1) / 10);
      await flush();
    }
    const song = ready(SONG)!;
    expect(song.duration).toBe(180);
    expect(song.levels).toHaveLength(9000);
    expect(song.levels[0]).toBe(Math.round(0.1 * 255));
    expect(song.levels[8999]).toBe(Math.round(0.5 * 255));
    expect(calls).toHaveLength(6);          // the voice-over: one call, at once (nothing has moved since)
    expect(calls[5].req).toMatchObject({ uri: VOICE, from: 0, to: 6, count: 300 });
    answer(calls[5]);
    await flush();
    expect(ready(VOICE)!.levels).toHaveLength(300);
    await settle(); await settle();
    expect(calls).toHaveLength(6);          // a file is fetched once, however many bars use it
    expect(new Set(calls.map((c) => c.req.jobId)).size).toBe(6);
  });

  test("nothing is asked without the function (Expo Go, an older build): no call, no file read, no entry", async () => {
    jest.mocked(isPeaksAvailable).mockReturnValue(false);
    disk.set(`${peaksDir("p1")}/${peaksFileName(VOICE)}`, encodePeaks(VOICE, { duration: 6, levels: new Uint8Array(300), top: 0 }));
    const { unmount } = await renderHook(() => useWaveforms());
    await settle(); await settle();
    expect(soundPeaks).not.toHaveBeenCalled();
    expect(expoFs.readText).not.toHaveBeenCalled();
    expect(expoFs.list).not.toHaveBeenCalled();
    expect(usePeaksFiles.getState().files).toEqual({});
    await unmount();
    expect(cancelSoundPeaks).not.toHaveBeenCalled();
  });

  test("nothing is asked while the editor is in use: a drag, a scrub, a pinch, playback or a recording keeps the wait going", async () => {
    syncPeaks("p1", sources());
    await flush();
    for (let i = 0; i < 4; i++) {   // a bar is being dragged: the project changes between every two looks
      useEditorStore.getState().applyTransient((p) => moveAudioTrack(p, "v1", 3 + i));
      await jest.advanceTimersByTimeAsync(PEAKS_SETTLE_MS); await flush();
    }
    for (let i = 0; i < 3; i++) { useEditorStore.getState().seek(1 + i); await jest.advanceTimersByTimeAsync(PEAKS_SETTLE_MS); await flush(); }
    for (let i = 0; i < 3; i++) { useEditorStore.getState().setZoom(70 + i); await jest.advanceTimersByTimeAsync(PEAKS_SETTLE_MS); await flush(); }
    useEditorStore.getState().setPlaying(true);
    await jest.advanceTimersByTimeAsync(PEAKS_SETTLE_MS * 5); await flush();
    useEditorStore.getState().setPlaying(false);
    useEditorStore.setState({ recording: true });
    await jest.advanceTimersByTimeAsync(PEAKS_SETTLE_MS * 5); await flush();
    expect(calls).toHaveLength(0);
    useEditorStore.setState({ recording: false });
    await settle(); await settle();
    expect(calls).toHaveLength(1);
  });

  test("between two calls of one file: a trim that begins makes the next call wait until it is over", async () => {
    syncPeaks("p1", sources());
    await settle();
    expect(calls).toHaveLength(1);
    useEditorStore.getState().applyTransient((p) => updateAudioTrackById(p, "m1", { trimEnd: 50 }));
    answer(calls[0]);
    await flush();
    expect(calls).toHaveLength(1);
    useEditorStore.getState().applyTransient((p) => updateAudioTrackById(p, "m1", { trimEnd: 40 }));
    await jest.advanceTimersByTimeAsync(PEAKS_SETTLE_MS); await flush();
    expect(calls).toHaveLength(1);
    await settle();
    expect(calls).toHaveLength(2);
  });

  test("a failed file is remembered: it has no outline, the next file goes on, and it is not asked again in the session", async () => {
    syncPeaks("p1", sources());
    await settle();
    calls[0].reject(Object.assign(new Error("peaks source: this file has no sound"), { code: "E_PEAKS" }));
    await flush();
    expect(usePeaksFiles.getState().files[SONG]).toEqual({ status: "failed" });
    expect(ready(SONG)).toBeNull();
    expect(calls).toHaveLength(2);
    expect(calls[1].req.uri).toBe(VOICE);
    answer(calls[1]);
    await flush();
    // Leaving and opening the editor again, and saying again what is drawn: still not asked.
    resetPeaks();
    syncPeaks("p1", sources());
    await settle(); await settle();
    expect(calls).toHaveLength(2);
    expect(usePeaksFiles.getState().files[SONG]).toEqual({ status: "failed" });
  });

  test("a call that throws at once (the function is gone) is a failure too, never an exception", async () => {
    jest.mocked(soundPeaks).mockImplementation(() => { throw new Error("not in this build"); });
    syncPeaks("p1", [{ uri: VOICE, duration: 6 }]);
    await settle();
    expect(usePeaksFiles.getState().files[VOICE]).toEqual({ status: "failed" });
  });

  test("answers that do not fit the plan are a failure", async () => {
    syncPeaks("p1", [{ uri: VOICE, duration: 6 }]);
    await settle();
    calls[0].resolve({ from: 0, to: 6, peaks: [] });
    await flush();
    expect(usePeaksFiles.getState().files[VOICE]).toEqual({ status: "failed" });
  });

  test("a deadline: a call that does not answer is told to stop, the file fails, and the queue goes on", async () => {
    syncPeaks("p1", sources());
    await settle();
    expect(calls).toHaveLength(1);
    await jest.advanceTimersByTimeAsync(PEAKS_DEADLINE_MS - 1);
    expect(usePeaksFiles.getState().files[SONG]).toBeUndefined();
    await jest.advanceTimersByTimeAsync(1); await flush();
    expect(cancelSoundPeaks).toHaveBeenCalledWith(calls[0].req.jobId);
    expect(usePeaksFiles.getState().files[SONG]).toEqual({ status: "failed" });
    await settle();
    expect(calls).toHaveLength(2);
    expect(calls[1].req.uri).toBe(VOICE);
    answer(calls[0]);   // the late answer is dropped
    await flush();
    expect(usePeaksFiles.getState().files[SONG]).toEqual({ status: "failed" });
  });

  test("leaving the editor cancels the call that runs; its answer is nobody's, and nothing more is asked", async () => {
    syncPeaks("p1", sources());
    await settle();
    resetPeaks();
    expect(cancelSoundPeaks).toHaveBeenCalledWith(calls[0].req.jobId);
    calls[0].reject(Object.assign(new Error("Peaks cancelled"), { code: "E_PEAKS_CANCELLED" }));
    await settle(); await settle();
    expect(calls).toHaveLength(1);
    expect(usePeaksFiles.getState().files).toEqual({});   // cancelled is not failed: it is asked again next time
  });

  test("a cancelled call that never answers does not hold the queue: after the grace the next editor's files are asked", async () => {
    syncPeaks("p1", sources());
    await settle();
    resetPeaks();
    syncPeaks("p2", [{ uri: SFX, duration: 1 }]);
    await jest.advanceTimersByTimeAsync(PEAKS_CANCEL_GRACE_MS - 1); await flush();
    expect(calls).toHaveLength(1);                          // still one at a time
    await jest.advanceTimersByTimeAsync(1); await settle();
    expect(calls).toHaveLength(2);
    expect(calls[1].req).toMatchObject({ uri: SFX, from: 0, to: 1, count: 50 });
    answer(calls[0]);                                       // the old call answers after all: dropped
    answer(calls[1]);
    await flush();
    expect(ready(SONG)).toBeNull();
    expect(ready(SFX)!.levels).toHaveLength(50);
  });

  test("leaving while the editor's stand-still is waited for: the wait ends, nothing is asked", async () => {
    syncPeaks("p1", sources());
    await flush();
    resetPeaks();
    await settle(); await settle();
    expect(calls).toHaveLength(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  test("a file no bar uses any more (its bar was deleted) is not waited for: its call is cancelled", async () => {
    syncPeaks("p1", sources());
    await settle();
    syncPeaks("p1", [{ uri: VOICE, duration: 6 }]);
    expect(cancelSoundPeaks).toHaveBeenCalledWith(calls[0].req.jobId);
    calls[0].reject(Object.assign(new Error("Peaks cancelled"), { code: "E_PEAKS_CANCELLED" }));
    await settle();
    expect(usePeaksFiles.getState().files[SONG]).toBeUndefined();
    expect(calls[1].req.uri).toBe(VOICE);
  });

  test("the outlines stay for the session: an editor opened again asks nothing", async () => {
    syncPeaks("p1", [{ uri: VOICE, duration: 6 }]);
    await settle();
    answer(calls[0]);
    await flush();
    resetPeaks();
    disk.clear();
    syncPeaks("p1", [{ uri: VOICE, duration: 6 }]);
    await settle(); await settle();
    expect(calls).toHaveLength(1);
    expect(ready(VOICE)).not.toBeNull();
  });
});

describe("the cache beside the project", () => {
  const path = `${peaksDir("p1")}/${peaksFileName(VOICE)}`;
  test("a fetched outline is written to <project>/peaks/ and read back by the next session without a call or a wait", async () => {
    expect(path).toBe("file:///doc/projects/p1/peaks/voice-p1.json");
    syncPeaks("p1", [{ uri: VOICE, duration: 6 }]);
    await settle();
    calls[0].resolve({ from: 0, to: 6, peaks: Array.from({ length: 300 }, (_, i) => (i % 100) / 100) });
    await flush();
    const first = ready(VOICE)!;
    expect(decodePeaks(disk.get(path), VOICE, 6)!.levels).toEqual(first.levels);
    // A new session: nothing in memory.
    resetPeaks();
    usePeaksFiles.setState({ files: {} });
    syncPeaks("p1", [{ uri: VOICE, duration: 6 }]);
    await flush();
    expect(ready(VOICE)!.levels).toEqual(first.levels);
    expect(ready(VOICE)!.duration).toBe(6);
    await settle();
    expect(calls).toHaveLength(1);
  });
  test("a corrupt or foreign file is ignored: the outline is fetched and the file written again", async () => {
    for (const text of ["{ not json", JSON.stringify({ version: 21, clips: [] }), encodePeaks(SONG, { duration: 6, levels: new Uint8Array(300), top: 0 }), encodePeaks(VOICE, { duration: 9, levels: new Uint8Array(450), top: 0 })]) {
      resetPeaks(); usePeaksFiles.setState({ files: {} }); calls = [];
      disk.set(path, text);
      syncPeaks("p1", [{ uri: VOICE, duration: 6 }]);
      await settle();
      expect(calls).toHaveLength(1);
      answer(calls[0]);
      await flush();
      expect(decodePeaks(disk.get(path), VOICE, 6)).not.toBeNull();
    }
  });
  test("a cache that cannot be read or written costs nothing but the saving", async () => {
    disk.set(path, "x");
    jest.mocked(expoFs.readText).mockRejectedValueOnce(new Error("disk"));
    jest.mocked(expoFs.writeText).mockRejectedValueOnce(new Error("full"));
    syncPeaks("p1", [{ uri: VOICE, duration: 6 }]);
    await settle();
    answer(calls[0]);
    await flush();
    expect(ready(VOICE)).not.toBeNull();
  });
  test("the sweep removes the files no bar of the open project uses, and only those", async () => {
    const dir = peaksDir("p1");
    disk.set(`${dir}/${peaksFileName(SONG)}`, "a"); disk.set(`${dir}/${peaksFileName(VOICE)}`, "b"); disk.set(`${dir}/gone-p1.json`, "c"); disk.set(`${dir}/song-p0.json`, "d");
    disk.set("file:///doc/projects/p1/media/song.m4a", "media");
    await sweepPeaks("p1");
    expect([...disk.keys()].sort()).toEqual([`${dir}/${peaksFileName(SONG)}`, `${dir}/${peaksFileName(VOICE)}`, "file:///doc/projects/p1/media/song.m4a"].sort());
    // Not the open project: nothing is touched.
    disk.set("file:///doc/projects/p9/peaks/x-p1.json", "e");
    await sweepPeaks("p9");
    expect(disk.has("file:///doc/projects/p9/peaks/x-p1.json")).toBe(true);
  });
});

describe("mounted in the editor", () => {
  test("opens: sweeps and fetches; a move, a trim or a sound setting asks nothing new; a new file is fetched; leaving cancels", async () => {
    disk.set(`${peaksDir("p1")}/old-p1.json`, "x");
    const { unmount } = await renderHook(() => useWaveforms());
    await settle();
    expect(disk.has(`${peaksDir("p1")}/old-p1.json`)).toBe(false);
    for (let i = 0; i < 5; i++) { answer(calls[i]); await flush(); }
    answer(calls[5]);
    await flush();
    expect(calls).toHaveLength(6);
    await act(async () => {
      useEditorStore.getState().apply((p) => moveAudioTrack(p, "m1", 3));
      useEditorStore.getState().apply((p) => updateAudioTrackById(p, "m2", { trimEnd: 80 }));
      useEditorStore.getState().apply((p) => setTrackSound(p, "v1", { ...NO_SOUND, voice: "deep" }));
    });
    await settle(); await settle();
    expect(calls).toHaveLength(6);
    await act(async () => { useEditorStore.getState().apply((p) => ({ ...p, audioTracks: [...p.audioTracks, makeAudioTrack({ id: "s1", kind: "sfx", sourceUri: SFX, sourceDuration: 1, start: 4 })] })); });
    await settle(); await settle();
    expect(calls).toHaveLength(7);
    expect(calls[6].req.uri).toBe(SFX);
    await unmount();
    expect(cancelSoundPeaks).toHaveBeenCalledWith(calls[6].req.jobId);
  });
  test("a missing file is never asked for", async () => {
    useEditorStore.getState().setProject(project(), [SONG]);
    await renderHook(() => useWaveforms());
    await settle(); await settle();
    expect(calls.map((c) => c.req.uri)).toEqual([VOICE]);
  });
});
