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
import { AppState, type AppStateStatus } from "react-native";
import { cancelSoundPeaks, isPeaksAvailable, soundPeaks, type SoundPeaksRequest, type SoundPeaksResult } from "@/modules/clipy-video";
import { makeAudioTrack, makeClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { usePeaksFiles } from "../peaksFiles";
import { heardPauses, listenForPauses, pauseKey, PEAKS_CANCEL_GRACE_MS, PEAKS_DEADLINE_MS, PEAKS_SETTLE_MS, peaksSources, resetPeaks, stopPauses, syncPeaks } from "../soundPeaks";

const disk = (jest.requireMock("@/src/projects/expoFs") as { __files: Map<string, string> }).__files;
const SONG = "file:///doc/projects/p1/media/song.m4a";
const project = () => makeProject({ id: "p1", clips: [makeClip({ id: "a", sourceDuration: 20 })], audioTracks: [
  makeAudioTrack({ id: "m1", sourceUri: SONG, title: "Song", sourceDuration: 180, start: 0, trimStart: 0, trimEnd: 60 }),
] });

/** The native side: every call is kept until the test answers it. */
type Call = { req: SoundPeaksRequest; resolve: (r: SoundPeaksResult) => void; reject: (e: unknown) => void };
let calls: Call[] = [];
const answer = (c: Call, level = 0.5) => c.resolve({ from: c.req.from, to: c.req.to, peaks: Array.from({ length: c.req.count }, () => level) });
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

/** A file of its own for every test: what was heard is remembered for the session (the module's memory outlives a test). */
let CLIP = "", n = 0;
beforeEach(() => { CLIP = `file:///doc/projects/p1/media/talk-${++n}.mov`; });

test("listens over the clip's trim in calls of 20 s, one at a time, without waiting for the editor to stand still", async () => {
  const done = listenForPauses({ uri: CLIP, from: 2, to: 32 });
  await flush();
  expect(calls.map((c) => [c.req.uri, c.req.from, c.req.to, c.req.count])).toEqual([[CLIP, 2, 17, 1500]]);
  answer(calls[0], 0.5); await flush();
  expect(calls[1].req).toMatchObject({ uri: CLIP, from: 17, to: 32, count: 1500 });
  answer(calls[1], 0.5);
  const r = await done;
  expect(r.status).toBe("ready");
  if (r.status === "ready") { expect(r.outline.levels).toHaveLength(3000); expect([r.outline.from, r.outline.to]).toEqual([2, 32]); }
});

test("remembered for the session by uri, range and density: asked again, nothing is asked of the phone", async () => {
  const first = listenForPauses({ uri: CLIP, from: 0, to: 3 }); await flush(); answer(calls[0]); await first;
  expect(heardPauses({ uri: CLIP, from: 0, to: 3 })).not.toBeNull();
  expect(pauseKey({ uri: CLIP, from: 0, to: 3 })).toBe(`${CLIP}|0|3|100`);
  expect((await listenForPauses({ uri: CLIP, from: 0, to: 3 })).status).toBe("ready");
  expect(calls).toHaveLength(1);
  void listenForPauses({ uri: CLIP, from: 0, to: 4 }); await flush();
  expect(calls).toHaveLength(2);   // another trim is another outline
});

test("never two native calls: a pauses call waits for the waveform call that runs, then goes before the waveform calls that wait", async () => {
  syncPeaks("p1", peaksSources(useEditorStore.getState().project!, []));
  await settle();
  expect(calls).toHaveLength(1);                                  // the song's first call runs
  const done = listenForPauses({ uri: CLIP, from: 0, to: 3 }); await flush();
  expect(calls).toHaveLength(1);
  answer(calls[0]); await flush();
  expect(calls[1].req.uri).toBe(CLIP);
  answer(calls[1]); await done; await settle();
  expect(calls[2].req.uri).not.toBe(CLIP);                         // the waveforms go on
});

test("syncPeaks never cancels a pauses call; stopPauses does, and its answer is dropped", async () => {
  const done = listenForPauses({ uri: CLIP, from: 0, to: 3 }); await flush();
  syncPeaks("p1", []);
  expect(cancelSoundPeaks).not.toHaveBeenCalled();
  stopPauses();
  expect(cancelSoundPeaks).toHaveBeenCalledWith(calls[0].req.jobId);
  answer(calls[0]);
  expect(await done).toEqual({ status: "stopped" });
  expect(heardPauses({ uri: CLIP, from: 0, to: 3 })).toBeNull();
});

test("one listening at a time: the same source joins, another stops the first", async () => {
  const a = listenForPauses({ uri: CLIP, from: 0, to: 3 }), b = listenForPauses({ uri: CLIP, from: 0, to: 3 });
  await flush();
  expect(calls).toHaveLength(1);
  const c = listenForPauses({ uri: CLIP, from: 1, to: 3 });
  calls[0].reject(Object.assign(new Error("Peaks cancelled"), { code: "E_PEAKS_CANCELLED" }));
  expect(await a).toEqual({ status: "stopped" }); expect(await b).toEqual({ status: "stopped" });
  await flush();
  expect(calls[1].req).toMatchObject({ from: 1, to: 3 });
  answer(calls[1]); expect((await c).status).toBe("ready");
});

test("leaving the editor (resetPeaks) stops a listening", async () => {
  const done = listenForPauses({ uri: CLIP, from: 0, to: 3 }); await flush();
  resetPeaks();
  expect(cancelSoundPeaks).toHaveBeenCalled();
  await jest.advanceTimersByTimeAsync(PEAKS_CANCEL_GRACE_MS);
  expect(await done).toEqual({ status: "stopped" });
});

test("failures: no sound, anything else, a deadline — none remembered; no function and too long ask nothing", async () => {
  let done = listenForPauses({ uri: CLIP, from: 0, to: 3 }); await flush();
  calls[0].reject(new Error("peaks source: this file has no sound"));
  expect(await done).toEqual({ status: "failed", reason: "noSound" });
  done = listenForPauses({ uri: CLIP, from: 0, to: 3 }); await flush();
  calls[1].reject(new Error("peaks reader: boom"));
  expect(await done).toEqual({ status: "failed", reason: "failed" });
  done = listenForPauses({ uri: CLIP, from: 0, to: 3 }); await flush();
  await jest.advanceTimersByTimeAsync(PEAKS_DEADLINE_MS);
  expect(await done).toEqual({ status: "failed", reason: "failed" });
  expect(await listenForPauses({ uri: CLIP, from: 0, to: 601 })).toEqual({ status: "failed", reason: "tooLong" });
  jest.mocked(isPeaksAvailable).mockReturnValue(false);
  expect(await listenForPauses({ uri: CLIP, from: 0, to: 3 })).toEqual({ status: "failed", reason: "build" });
  expect(calls).toHaveLength(3);
});

test("a listening of several calls keeps the turn: no waveform call runs between two of its calls", async () => {
  syncPeaks("p1", peaksSources(useEditorStore.getState().project!, []));
  await settle();
  expect(calls).toHaveLength(1);                                  // the song's first call runs
  const done = listenForPauses({ uri: CLIP, from: 0, to: 30 }); await flush();
  answer(calls[0]); await settle();                               // the song's next call now waits
  expect(calls[1].req).toMatchObject({ uri: CLIP, from: 0, to: 15 });
  answer(calls[1]); await settle();
  expect(calls[2].req).toMatchObject({ uri: CLIP, from: 15, to: 30 });
  answer(calls[2]); expect((await done).status).toBe("ready"); await settle();
  expect(calls[3].req.uri).toBe(SONG);                             // then the waveforms go on
});

test("a deadline counts only time in front: Clipy left during a long listening does not fail it", async () => {
  const app = (now: AppStateStatus) => { Object.defineProperty(AppState, "currentState", { configurable: true, get: () => now }); };
  try {
    const done = listenForPauses({ uri: CLIP, from: 0, to: 3 }); await flush();
    app("background");
    await jest.advanceTimersByTimeAsync(PEAKS_DEADLINE_MS * 2);
    app("active");
    answer(calls[0]);
    expect((await done).status).toBe("ready");
  } finally { app("active"); }
});

test("what was heard is kept by last use: an outline read again outlives the ones not read since", async () => {
  const hear = async (to: number) => { const d = listenForPauses({ uri: CLIP, from: 0, to }); await flush(); answer(calls[calls.length - 1]); await d; };
  for (let i = 1; i <= 8; i++) await hear(i);
  expect(heardPauses({ uri: CLIP, from: 0, to: 1 })).not.toBeNull();   // read: the newest now
  await hear(9);
  expect(heardPauses({ uri: CLIP, from: 0, to: 1 })).not.toBeNull();
  expect(heardPauses({ uri: CLIP, from: 0, to: 2 })).toBeNull();
});

test("a waveform call that waited for a listening's turn asks again whether the editor stands still: never started while playing", async () => {
  syncPeaks("p1", peaksSources(useEditorStore.getState().project!, []));
  await settle();
  expect(calls).toHaveLength(1);                                  // the song's first call runs
  const done = listenForPauses({ uri: CLIP, from: 0, to: 3 }); await flush();
  answer(calls[0]); await flush();                                // the song's next call now waits for the turn
  expect(calls[1].req.uri).toBe(CLIP);
  useEditorStore.getState().setPlaying(true);                     // the strip closed, Play pressed
  answer(calls[1]); expect((await done).status).toBe("ready");
  await settle(); await settle();
  expect(calls).toHaveLength(2);                                  // nothing started during playback
  useEditorStore.getState().setPlaying(false);
  await settle(); await settle();
  expect(calls[2].req.uri).toBe(SONG);                            // standing still again: the waveform goes on
});
