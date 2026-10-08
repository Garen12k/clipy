jest.mock("@/src/lib/id", () => ({ newId: jest.fn(() => "job-1") }));
jest.mock("@/modules/clipy-video", () => ({
  beatEnvelope: jest.fn(), cancelBeatEnvelope: jest.fn(), isBeatEnvelopeAvailable: jest.fn(() => true),
  isBeatsCancelled: (e: unknown) => typeof e === "object" && e !== null && (e as { code?: string }).code === "E_BEATS_CANCELLED",
}));
import { beatEnvelope, cancelBeatEnvelope, isBeatEnvelopeAvailable } from "@/modules/clipy-video";
import { beatPeriod, beatsFromPeriod, detectBeats, onsetEnvelope } from "@/src/editor/model/beatDetect";
import { makeAudioTrack, makeProject } from "@/src/editor/model/types";
import { BUNDLED_TRACKS } from "@/src/editor/music";
import { useEditorStore } from "@/src/editor/store";
import { newId } from "@/src/lib/id";
import { analyseEnvelope, BEAT_ANALYSIS, BEATS_BREATH_MS, beatKey, beatRange, BEATS_DEADLINE_MS, forgetOwnBeats, foundBeats, listenForBeats, stopListening, useOwnBeats } from "../ownBeats";

jest.setTimeout(30000);   // the analyses are real ones; beside other suites one can take several seconds

const RATE = 11025;
function clicks(bpm: number, first: number, seconds: number): Float32Array {
  const x = new Float32Array(Math.round(RATE * seconds));
  for (let t = first; t < seconds; t += 60 / bpm) {
    const s = Math.round(t * RATE);
    for (let i = 0; i < 300 && s + i < x.length; i++) x[s + i] += Math.sin(i * 0.9) * Math.exp(-i / 60);
  }
  return x;
}
function noise(seconds: number): Float32Array {
  let s = 12345;
  return Float32Array.from({ length: Math.round(RATE * seconds) }, () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s / 4294967296) * 2 - 1; });
}
const envOf = (x: Float32Array) => { const e = onsetEnvelope(x, RATE); return { env: e.env, rate: e.rate, seconds: x.length / RATE }; };
const now = () => Promise.resolve();
const never = () => false;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const native = jest.mocked(beatEnvelope);
const song = makeAudioTrack({ id: "s", title: "my song.m4a", sourceDuration: 60, sourceUri: "file:///doc/projects/p1/media/song.m4a" });
const other = makeAudioTrack({ id: "o", title: "other.m4a", sourceDuration: 45, sourceUri: "file:///doc/projects/p1/media/other.m4a" });
/** One answer of the phone for a minute of clicks, made once (the envelope is the slow part of this file). */
const MINUTE = envOf(clicks(120, 0.2, 60));
/** Sixteen seconds of the same, for the tests that are about the listening and not about the beats. */
const SHORT = envOf(clicks(120, 0.2, 16));
const brief = (from: number) => ({ env: Array.from(SHORT.env), rate: SHORT.rate, seconds: SHORT.seconds, from });
const answer = (from: number) => ({ env: Array.from(MINUTE.env), rate: MINUTE.rate, seconds: MINUTE.seconds, from });

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(isBeatEnvelopeAvailable).mockReturnValue(true);
  jest.mocked(newId).mockReturnValue("job-1");
  forgetOwnBeats();
});

test("the limits", () => {
  expect(BEAT_ANALYSIS).toEqual({ maxSeconds: 600, minSeconds: 8, slice: 4 });
  expect(BEATS_DEADLINE_MS).toBe(120000);
});

test("beatRange: the whole file up to ten minutes; a longer one from the second its trim starts in, for ten minutes", () => {
  expect(beatRange({ sourceDuration: 180.4, trimStart: 20 })).toEqual({ from: 0, to: 180.4 });
  expect(beatRange({ sourceDuration: 600, trimStart: 500 })).toEqual({ from: 0, to: 600 });
  expect(beatRange({ sourceDuration: 3600, trimStart: 125.7 })).toEqual({ from: 125, to: 725 });
  expect(beatRange({ sourceDuration: 700, trimStart: 400 })).toEqual({ from: 400, to: 700 });
  expect(beatKey({ sourceUri: "file:///a.m4a", sourceDuration: 180.4, trimStart: 20 })).toBe("file:///a.m4a|0|180.4");
});

test("beatRange: a trim that is not a usable number listens from the start", () => {
  expect(beatRange({ sourceDuration: 3600, trimStart: NaN })).toEqual({ from: 0, to: 600 });
  expect(beatRange({ sourceDuration: 3600, trimStart: -4 })).toEqual({ from: 0, to: 600 });
});

test("analyseEnvelope: steady clicks give the whole's beats, the same as the detector in one go", async () => {
  const { env, rate, seconds } = MINUTE;
  const pauses = jest.fn(now);
  const got = await analyseEnvelope(env, rate, seconds, pauses, never);
  expect(got).toEqual(beatsFromPeriod(env, rate, beatPeriod(env, rate), seconds));
  expect(got && got !== "stopped" ? got.bpm : 0).toBeCloseTo(120, 0);
  expect(pauses.mock.calls.length).toBeGreaterThanOrEqual(3 * 151);      // 601 steps in slices of 4, three times over
});

test("analyseEnvelope: the slices answer what the one-pass detector answers for the samples, every beat", async () => {
  const samples = clicks(128, 0.31, 40);
  const { env, rate, seconds } = envOf(samples);
  expect(await analyseEnvelope(env, rate, seconds, now, never)).toEqual(detectBeats(samples, RATE));
});

test("analyseEnvelope: noise is not steady; an envelope too short for a tempo is not either; a stop ends it", async () => {
  const n = envOf(noise(40));
  expect(await analyseEnvelope(n.env, n.rate, n.seconds, now, never)).toBeNull();
  expect(await analyseEnvelope(new Float64Array(200), 100, 2, now, never)).toBeNull();
  let asked = 0;
  const pauses = jest.fn(now);
  expect(await analyseEnvelope(MINUTE.env, MINUTE.rate, MINUTE.seconds, pauses, () => ++asked > 5)).toBe("stopped");
  expect(pauses.mock.calls.length).toBeLessThanOrEqual(6);              // promptly: at the next pause, not at the end
});

test("foundBeats: a bundled track is the bundled answer; an own track is own until listened to, then ok or unsteady", () => {
  const bundled = BUNDLED_TRACKS[0];
  const b = makeAudioTrack({ id: "b", title: bundled.title, sourceDuration: bundled.durationSec });
  expect(foundBeats({}, b).status).not.toBe("own");
  expect(foundBeats({}, song)).toEqual({ status: "own", title: "my song.m4a" });
  expect(foundBeats({ [beatKey(song)]: { bpm: 120, first: 0.2, confidence: 3, beats: [0.2, 0.7] } }, song)).toEqual({ status: "ok", title: "my song.m4a", beats: [0.2, 0.7] });
  expect(foundBeats({ [beatKey(song)]: null }, song)).toEqual({ status: "unsteady", title: "my song.m4a" });
  expect(foundBeats({ [beatKey(song)]: { bpm: 120, first: 0, confidence: 3, beats: [] } }, song)).toEqual({ status: "unsteady", title: "my song.m4a" });
});

test("listenForBeats: asks the phone for the track's range, analyses, and remembers the beats in FILE seconds", async () => {
  native.mockResolvedValueOnce(answer(0));
  await expect(listenForBeats(song)).resolves.toBe("ok");
  expect(native).toHaveBeenCalledWith({ jobId: "job-1", sourceUri: song.sourceUri, from: 0, to: 60 });
  const kept = useOwnBeats.getState().found[beatKey(song)];
  expect(kept?.bpm).toBeCloseTo(120, 0);
  expect(kept?.beats.length).toBeGreaterThan(100);
  expect(foundBeats(useOwnBeats.getState().found, song).status).toBe("ok");
  // End to end: what is remembered is what the detector finds in one pass over the same envelope.
  const whole = beatsFromPeriod(MINUTE.env, MINUTE.rate, beatPeriod(MINUTE.env, MINUTE.rate), MINUTE.seconds);
  expect(kept).toEqual({ bpm: whole?.bpm, first: whole?.first, confidence: whole?.confidence, beats: whole?.beats });
});

test("listenForBeats: a long file is listened to from its trim, and the beats are moved to file seconds", async () => {
  const long = makeAudioTrack({ id: "l", title: "set.m4a", sourceDuration: 3600, trimStart: 125.7, trimEnd: 200, sourceUri: "file:///doc/projects/p1/media/set.m4a" });
  native.mockResolvedValueOnce(answer(125));
  await expect(listenForBeats(long)).resolves.toBe("ok");
  expect(native).toHaveBeenCalledWith({ jobId: "job-1", sourceUri: long.sourceUri, from: 125, to: 725 });
  const kept = useOwnBeats.getState().found[beatKey(long)];
  expect(kept && kept.beats[0]).toBeGreaterThanOrEqual(125);
  expect(kept && kept.first).toBeGreaterThanOrEqual(125);
  const whole = beatsFromPeriod(MINUTE.env, MINUTE.rate, beatPeriod(MINUTE.env, MINUTE.rate), MINUTE.seconds);
  expect(kept?.beats).toEqual(whole?.beats.map((b) => r3(b + 125)));
  expect(kept?.first).toBe(r3((whole?.first ?? 0) + 125));
});

test("listenForBeats: a bar with a Voice / Sound setting is listened to from its original file", async () => {
  const changed = { ...song, sound: { voice: null, strength: 0.5, pitch: 3, eq: null, level: false } };
  native.mockResolvedValueOnce(brief(0));
  await expect(listenForBeats(changed)).resolves.toBe("ok");
  expect(native.mock.calls[0][0].sourceUri).toBe(song.sourceUri);
  expect(beatKey(changed)).toBe(beatKey(song));
});

test("listenForBeats: no steady beat and a sound under 8 seconds are remembered as none", async () => {
  const n = envOf(noise(40));
  native.mockResolvedValueOnce({ env: Array.from(n.env), rate: n.rate, seconds: n.seconds, from: 0 });
  await expect(listenForBeats(song)).resolves.toBe("unsteady");
  expect(useOwnBeats.getState().found[beatKey(song)]).toBeNull();
  forgetOwnBeats();
  native.mockResolvedValueOnce({ env: [0, 1, 0], rate: 100, seconds: 7.9, from: 0 });
  await expect(listenForBeats(song)).resolves.toBe("short");
  expect(useOwnBeats.getState().found[beatKey(song)]).toBeNull();
});

test("listenForBeats: what was found is not listened to again", async () => {
  native.mockResolvedValueOnce(brief(0));
  await expect(listenForBeats(song)).resolves.toBe("ok");
  const kept = useOwnBeats.getState().found;
  await expect(listenForBeats(song)).resolves.toBe("ok");
  expect(native).toHaveBeenCalledTimes(1);
  expect(useOwnBeats.getState().found).toBe(kept);                    // nothing written: nothing that reads the store renders again
  useOwnBeats.setState({ found: { [beatKey(other)]: null } });
  await expect(listenForBeats(other)).resolves.toBe("unsteady");
  expect(native).toHaveBeenCalledTimes(1);
});

test("listenForBeats: where the app has no listener it says so and never asks the phone", async () => {
  jest.mocked(isBeatEnvelopeAvailable).mockReturnValue(false);
  await expect(listenForBeats(song)).resolves.toBe("unavailable");
  expect(native).not.toHaveBeenCalled();
  expect(newId).not.toHaveBeenCalled();
  expect(useOwnBeats.getState().found).toEqual({});
  jest.mocked(isBeatEnvelopeAvailable).mockReturnValue(true);        // nothing was left running behind it
  native.mockResolvedValueOnce(brief(0));
  await expect(listenForBeats(song)).resolves.toBe("ok");
});

test("listenForBeats: an answer that is not an envelope is a failure, not 'no steady beat'", async () => {
  native.mockResolvedValueOnce({ env: "nothing", rate: 100, seconds: 60, from: 0 } as never);
  await expect(listenForBeats(song)).rejects.toThrow("beats answer: not an envelope");
  native.mockResolvedValueOnce({ env: [0, 1, 0], rate: 0, seconds: 60, from: 0 });
  await expect(listenForBeats(song)).rejects.toThrow("beats answer: not an envelope");
  native.mockResolvedValueOnce({ env: [0, 1, 0], rate: 100, seconds: NaN, from: 0 });
  await expect(listenForBeats(song)).rejects.toThrow("beats answer: not an envelope");
  native.mockResolvedValueOnce(undefined as never);
  await expect(listenForBeats(song)).rejects.toThrow("beats answer: not an envelope");
  expect(useOwnBeats.getState().found).toEqual({});
  native.mockResolvedValueOnce(brief(0));                             // and nothing is left running
  await expect(listenForBeats(song)).resolves.toBe("ok");
});

test("one at a time: the same file and stretch joins the listening, another sound is told it is busy; a stop tells the phone, ends the wait at once and remembers nothing", async () => {
  let release: (v: never) => void = () => {};
  native.mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));
  const first = listenForBeats(song);
  expect(native).toHaveBeenCalledTimes(1);                             // asked at once, not a tick later
  await Promise.resolve();
  const joined = listenForBeats({ ...song, id: "piece", trimStart: 12 } as typeof song);   // a split piece of the same file
  await expect(listenForBeats(other)).resolves.toBe("stopped");       // busy with another sound: this call does nothing
  expect(native).toHaveBeenCalledTimes(1);
  stopListening();
  await expect(first).resolves.toBe("stopped");
  await expect(joined).resolves.toBe("stopped");
  expect(cancelBeatEnvelope).toHaveBeenCalledWith("job-1");
  expect(beatKey(song) in useOwnBeats.getState().found).toBe(false);
  release(brief(0) as never);                                         // a late native answer changes nothing
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(beatKey(song) in useOwnBeats.getState().found).toBe(false);
  stopListening();                                                     // nothing running: nothing happens
  expect(cancelBeatEnvelope).toHaveBeenCalledTimes(1);
});

test("the one who joined gets the first one's answer, from one listening", async () => {
  let release: (v: never) => void = () => {};
  native.mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));
  const first = listenForBeats(song);
  const joined = listenForBeats(song);
  release(brief(0) as never);
  await expect(first).resolves.toBe("ok");
  await expect(joined).resolves.toBe("ok");
  expect(native).toHaveBeenCalledTimes(1);
});

test("a late answer of a stopped listening does not disturb the next one, even for the same file", async () => {
  let releaseOld: (v: never) => void = () => {};
  native.mockReturnValueOnce(new Promise((resolve) => { releaseOld = resolve; }));
  const old = listenForBeats(song);
  stopListening();
  await expect(old).resolves.toBe("stopped");
  jest.mocked(newId).mockReturnValue("job-2");
  let releaseNew: (v: never) => void = () => {};
  native.mockReturnValueOnce(new Promise((resolve) => { releaseNew = resolve; }));
  const next = listenForBeats(song);
  expect(native).toHaveBeenLastCalledWith({ jobId: "job-2", sourceUri: song.sourceUri, from: 0, to: 60 });
  const n = envOf(noise(40));
  releaseOld({ env: Array.from(n.env), rate: n.rate, seconds: n.seconds, from: 0 } as never);   // the old one would have said "unsteady"
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(beatKey(song) in useOwnBeats.getState().found).toBe(false);
  releaseNew(brief(0) as never);
  await expect(next).resolves.toBe("ok");
  expect(cancelBeatEnvelope).toHaveBeenCalledTimes(1);
  expect(cancelBeatEnvelope).toHaveBeenCalledWith("job-1");
});

test("a native failure rejects with its message; a native cancel is a stop; the deadline stops a render that never answers", async () => {
  native.mockRejectedValueOnce(new Error("beats source: this file has no sound"));
  await expect(listenForBeats(song)).rejects.toThrow("beats source: this file has no sound");
  native.mockImplementationOnce(() => { throw new Error("This build of the app cannot do that yet. Install the latest Clipy build."); });
  await expect(listenForBeats(song)).rejects.toThrow("This build of the app cannot do that yet.");
  native.mockRejectedValueOnce(Object.assign(new Error("Beats cancelled"), { code: "E_BEATS_CANCELLED" }));
  await expect(listenForBeats(song)).resolves.toBe("stopped");
  expect(useOwnBeats.getState().found).toEqual({});
  jest.useFakeTimers();
  try {
    native.mockReturnValueOnce(new Promise(() => {}));
    const hung = listenForBeats(song);
    await Promise.resolve();
    jest.advanceTimersByTime(BEATS_DEADLINE_MS - 1);
    expect(cancelBeatEnvelope).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    await expect(hung).resolves.toBe("stopped");
    expect(cancelBeatEnvelope).toHaveBeenCalledWith("job-1");
    expect(jest.getTimerCount()).toBe(0);
  } finally { jest.useRealTimers(); }
});

test("a phone that cannot be told to stop does not break the stop", async () => {
  jest.mocked(cancelBeatEnvelope).mockImplementationOnce(() => { throw new Error("no module"); });
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  try {
    native.mockReturnValueOnce(new Promise(() => {}));
    const hung = listenForBeats(song);
    expect(() => stopListening()).not.toThrow();
    await expect(hung).resolves.toBe("stopped");
  } finally { warn.mockRestore(); }
});

describe("the screen stays alive", () => {
  let clock: jest.SpyInstance<number, []>;
  /** A clock that moves `step` ms each time it is read (the slices themselves take no time under fake timers). */
  const ticking = (step: number) => { let t = 1_000_000; clock.mockImplementation(() => (t += step)); };
  beforeEach(() => { jest.useFakeTimers(); clock = jest.spyOn(Date, "now"); });
  afterEach(() => { clock.mockRestore(); jest.useRealTimers(); });
  /** Lets every promise that can settle without a timer settle. */
  const microtasks = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); };

  test("the breath is about half a frame", () => { expect(BEATS_BREATH_MS).toBe(8); });

  test("once the breath is used up the analysis waits for a TIMER — promises alone never carry it on — again and again", async () => {
    ticking(5);                                                        // every second slice ends past the 8 ms
    native.mockResolvedValueOnce(brief(0));
    let done: string | null = null;
    const listening = listenForBeats(song).then((a) => { done = a; return a; });
    await microtasks();
    await microtasks();
    expect(done).toBeNull();
    expect(jest.getTimerCount()).toBe(2);                              // the deadline, and the one pause it is waiting in
    let timers = 0;
    while (done === null && timers < 2000) { jest.advanceTimersByTime(0); await microtasks(); timers++; }
    await expect(listening).resolves.toBe("ok");
    expect(timers).toBeGreaterThanOrEqual(220);                        // 3 × 151 slices, a timer after every second one
    expect(jest.getTimerCount()).toBe(0);                              // the deadline is put away
  });

  test("on a slow phone every slice ends in a timer", async () => {
    ticking(100);
    native.mockResolvedValueOnce(brief(0));
    let done: string | null = null;
    const listening = listenForBeats(song).then((a) => { done = a; return a; });
    let timers = 0;
    while (done === null && timers < 2000) { jest.advanceTimersByTime(0); await microtasks(); timers++; }
    await expect(listening).resolves.toBe("ok");
    expect(timers).toBeGreaterThanOrEqual(3 * 151);
  });

  test("slices that fit in one breath need no timer, and find the same beats", async () => {
    clock.mockReturnValue(1_000_000);                                  // no time goes by
    native.mockResolvedValueOnce(brief(0));
    await expect(listenForBeats(song)).resolves.toBe("ok");
    const whole = beatsFromPeriod(SHORT.env, SHORT.rate, beatPeriod(SHORT.env, SHORT.rate), SHORT.seconds);
    expect(useOwnBeats.getState().found[beatKey(song)]?.beats).toEqual(whole?.beats);
    expect(jest.getTimerCount()).toBe(0);
  });

  test("a stop while the slices run ends them at the next pause: nothing is remembered, the phone is told once", async () => {
    ticking(100);
    native.mockResolvedValueOnce(brief(0));
    let done: string | null = null;
    const listening = listenForBeats(song).then((a) => { done = a; return a; });
    for (let i = 0; i < 10; i++) { jest.advanceTimersByTime(0); await microtasks(); }
    expect(done).toBeNull();
    stopListening();
    jest.advanceTimersByTime(0);
    await expect(listening).resolves.toBe("stopped");
    expect(cancelBeatEnvelope).toHaveBeenCalledTimes(1);
    expect(useOwnBeats.getState().found).toEqual({});
    expect(jest.getTimerCount()).toBe(0);
  });

  test("the deadline also ends an analysis that is still going", async () => {
    ticking(100);
    native.mockResolvedValueOnce(brief(0));
    const listening = listenForBeats(song);
    await microtasks();
    await microtasks();
    jest.advanceTimersByTime(BEATS_DEADLINE_MS);                       // the pause it waits in and the deadline fall due together
    await expect(listening).resolves.toBe("stopped");
    expect(cancelBeatEnvelope).toHaveBeenCalledWith("job-1");
    expect(useOwnBeats.getState().found).toEqual({});
  });
});

test("nothing here writes the project", async () => {
  const project = makeProject({ audioTracks: [song] });
  useEditorStore.setState({ project });
  native.mockResolvedValueOnce(brief(0));
  await expect(listenForBeats(song)).resolves.toBe("ok");
  expect(useEditorStore.getState().project).toBe(project);
  expect(useEditorStore.getState().project?.beatMarkers).toEqual([]);
});
