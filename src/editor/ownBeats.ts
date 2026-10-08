import { create } from "zustand";
import { beatEnvelope, cancelBeatEnvelope, isBeatEnvelopeAvailable, isBeatsCancelled, type BeatEnvelopeResult } from "@/modules/clipy-video";
import { BEAT_DETECT, beatsFromPeriod, coarsePeriod, finePeriodSlice, fineStart, isSteady, type BeatAnalysis } from "@/src/editor/model/beatDetect";
import type { AudioTrack } from "@/src/editor/model/types";
import { newId } from "@/src/lib/id";
import { beatsOf, type TrackBeats } from "./musicBeats";

/**
 * Find beats for a sound of the owner's own. The phone decodes the file and returns the onset envelope (the detector's first
 * stage); the tempo and the grid are found here with the detector's own pieces, a few steps at a time so the screen stays alive,
 * and accepted by the bundled tracks' rule. `maxSeconds`: the longest stretch listened to; `minSeconds`: under this there is
 * nothing to split in two; `slice`: fine steps between two pauses.
 */
export const BEAT_ANALYSIS = { maxSeconds: 600, minSeconds: 8, slice: 4 } as const;
/** A listening that has not answered by then is told to stop. */
export const BEATS_DEADLINE_MS = 120000;

/**
 * What listening found, by `beatKey`: the beats (FILE seconds), or null for a sound without a steady beat. Remembered until the
 * app closes; never saved, and never written to the project (markers are placed only by the owner's tap, through `placeBeats`).
 * `found` is replaced only when a listening ends with something to remember: read it whole (`(s) => s.found`, a stable reference).
 */
export const useOwnBeats = create<{ found: Record<string, TrackBeats | null> }>(() => ({ found: {} }));
const remember = (key: string, value: TrackBeats | null): void => useOwnBeats.setState((s) => ({ found: { ...s.found, [key]: value } }));
const known = (found: Record<string, TrackBeats | null>, key: string): boolean => Object.prototype.hasOwnProperty.call(found, key);

type Listened = Pick<AudioTrack, "sourceUri" | "sourceDuration" | "trimStart" | "title" | "kind">;
/** The seconds of the track's FILE that are listened to: all of it up to `maxSeconds`; a longer file from the second its trim starts in. */
export function beatRange(t: Pick<AudioTrack, "sourceDuration" | "trimStart">): { from: number; to: number } {
  if (t.sourceDuration <= BEAT_ANALYSIS.maxSeconds) return { from: 0, to: t.sourceDuration };
  const from = Number.isFinite(t.trimStart) ? Math.max(0, Math.floor(t.trimStart)) : 0;
  return { from, to: Math.min(t.sourceDuration, from + BEAT_ANALYSIS.maxSeconds) };
}
/**
 * One listening's identity: the file and the stretch. A split piece or a copy of a short file shares it. The file is the track's
 * ORIGINAL (`sourceUri`): a Voice / Sound copy has the same timing, an extracted bar's file is its video, a reading's a `.caf`.
 */
export function beatKey(t: Pick<AudioTrack, "sourceUri" | "sourceDuration" | "trimStart">): string {
  const r = beatRange(t);
  return `${t.sourceUri}|${r.from}|${r.to}`;
}

/** What Find beats can do with a track: its beats; no steady beat; or `own` — not listened to yet. */
export type OwnFound = { status: "ok"; title: string; beats: readonly number[] } | { status: "unsteady"; title: string } | { status: "own"; title: string };
export function foundBeats(found: Record<string, TrackBeats | null>, t: Listened): OwnFound {
  const bundled = beatsOf(t);
  if (bundled.status !== "own") return bundled;
  const key = beatKey(t);
  if (!known(found, key)) return { status: "own", title: t.title };
  const hit = found[key];
  return hit && hit.beats.length > 0 ? { status: "ok", title: t.title, beats: hit.beats } : { status: "unsteady", title: t.title };
}

/** `beatPeriod`, `slice` fine steps at a time with a pause after each slice (the same steps in the same order: the same number). null = stopped. */
async function periodOf(env: Float64Array, rate: number, pause: () => Promise<void>, stopped: () => boolean): Promise<number | null> {
  const coarse = coarsePeriod(env, rate);
  if (coarse === 0) return 0;
  let best = fineStart(coarse);
  for (let s = -BEAT_DETECT.fineSteps; s <= BEAT_DETECT.fineSteps; s += BEAT_ANALYSIS.slice) {
    best = finePeriodSlice(env, coarse, s, s + BEAT_ANALYSIS.slice, best);
    await pause();
    if (stopped()) return null;
  }
  return best.period;
}
/**
 * The beats of an envelope when they pass the bundled tracks' rule (`isSteady`: the whole, and each HALF of the envelope alone),
 * else null; "stopped" when `stopped()` turned true between two slices. Times are seconds from the envelope's start.
 */
export async function analyseEnvelope(env: Float64Array, rate: number, seconds: number, pause: () => Promise<void>, stopped: () => boolean): Promise<BeatAnalysis | null | "stopped"> {
  const half = Math.floor(env.length / 2);
  const parts: [Float64Array, number][] = [[env, seconds], [env.subarray(0, half), half / rate], [env.subarray(half), (env.length - half) / rate]];
  const found: (BeatAnalysis | null)[] = [];
  for (const [part, length] of parts) {
    const period = await periodOf(part, rate, pause, stopped);
    if (period === null) return "stopped";
    found.push(beatsFromPeriod(part, rate, period, length));
  }
  return isSteady(found[0], found[1], found[2]) ? found[0] : null;
}

const r3 = (v: number): number => Math.round(v * 1000) / 1000;
/**
 * The longest the slices run in one go before the JavaScript thread is handed back (about half a frame). Under it a pause costs
 * nothing, so a fast phone is not slowed by some 450 timers; on a slow one every slice ends in a real pause.
 */
export const BEATS_BREATH_MS = 8;
/**
 * The pause between two slices of one listening. Once `BEATS_BREATH_MS` have gone by since the thread was last handed back it is
 * a TIMER: the wait ends in a new turn of the JavaScript thread, after the touches, frames and native answers that queued up
 * meanwhile. A resolved promise alone would not do: its continuation is a microtask, and those all run before the thread takes
 * anything else — the slices would be one long block again. (Before that it IS a resolved promise: nothing is waiting long.)
 */
function breather(): () => Promise<void> {
  let since = Date.now();
  return () => (Date.now() - since < BEATS_BREATH_MS ? Promise.resolve() : new Promise<void>((resolve) => { setTimeout(() => { since = Date.now(); resolve(); }, 0); }));
}
/** A whole envelope: numbers, a real rate, a real length. Anything else is a failure, not "no steady beat". */
const isEnvelope = (got: BeatEnvelopeResult | null | undefined): got is BeatEnvelopeResult =>
  typeof got === "object" && got !== null && Array.isArray(got.env) && Number.isFinite(got.rate) && got.rate > 0 && Number.isFinite(got.seconds);

export type ListenAnswer = "ok" | "unsteady" | "short" | "stopped" | "unavailable";
type Run = {
  jobId: string; key: string; stopped: boolean; promise: Promise<ListenAnswer>;
  /** Set while the phone's answer is awaited: ends that wait now (`stopListening` calls it). */
  giveUp: (() => void) | null;
};
/** The one listening that is going on. */
let running: Run | null = null;

/** Ends the listening that is going on (the panel closed, the editor left, the deadline): the phone is told once, and the wait ends at once whatever it answers. */
export function stopListening(): void {
  const run = running;
  if (!run) return;
  run.stopped = true;
  running = null;
  try { cancelBeatEnvelope(run.jobId); } catch (e) { console.warn("beats cancel failed", e); }
  run.giveUp?.();
}

/** One listening, from the question to the phone to what is remembered. Whatever the phone answers after a stop is dropped: nobody waits for it and nothing is remembered for it. */
async function listen(run: Run, t: Listened, range: { from: number; to: number }): Promise<ListenAnswer> {
  const deadline = setTimeout(() => { if (running === run) stopListening(); }, BEATS_DEADLINE_MS);
  try {
    const got = await new Promise<BeatEnvelopeResult>((resolve, reject) => {
      run.giveUp = () => reject(new Error("Beats stopped"));
      let asked: Promise<BeatEnvelopeResult>;
      try { asked = beatEnvelope({ jobId: run.jobId, sourceUri: t.sourceUri, from: range.from, to: range.to }); } catch (e) { reject(e); return; }
      asked.then(resolve, reject);
    });
    run.giveUp = null;
    if (run.stopped) return "stopped";
    if (!isEnvelope(got)) throw new Error("beats answer: not an envelope");
    if (got.seconds < BEAT_ANALYSIS.minSeconds) { remember(run.key, null); return "short"; }
    const result = await analyseEnvelope(Float64Array.from(got.env), got.rate, got.seconds, breather(), () => run.stopped);
    if (result === "stopped" || run.stopped) return "stopped";
    if (!result) { remember(run.key, null); return "unsteady"; }
    const from = Number.isFinite(got.from) ? got.from : range.from;
    remember(run.key, { bpm: result.bpm, first: r3(result.first + from), confidence: result.confidence, beats: result.beats.map((b) => r3(b + from)) });
    return "ok";
  } catch (e) {
    if (run.stopped || isBeatsCancelled(e)) return "stopped";
    throw e;
  } finally {
    clearTimeout(deadline);
    run.giveUp = null;
    if (running === run) running = null;
  }
}

/**
 * Listens to a track's ORIGINAL file (a Voice / Sound copy has the same timing) and remembers what it finds: "ok" — beats, in file
 * seconds; "unsteady" — no clear, steady beat; "short" — under `minSeconds` of sound (both remembered as none); "stopped" — ended by
 * `stopListening` or the deadline, or the phone was busy listening to ANOTHER sound (nothing remembered); "unavailable" — this
 * app has no listener (Expo Go, an older build): the phone is not asked. One listening at a time: a call for the file and stretch
 * being listened to shares that listening and its answer, and one already remembered answers at once without the phone. Rejects
 * with the native staged message when the file cannot be read. Writes nothing to the project.
 */
export function listenForBeats(t: Listened): Promise<ListenAnswer> {
  if (!isBeatEnvelopeAvailable()) return Promise.resolve("unavailable");
  const key = beatKey(t);
  const { found } = useOwnBeats.getState();
  if (known(found, key)) return Promise.resolve(foundBeats(found, t).status === "ok" ? "ok" : "unsteady");
  if (running) return running.key === key ? running.promise : Promise.resolve("stopped");
  const run: Run = { jobId: newId(), key, stopped: false, promise: Promise.resolve("stopped"), giveUp: null };
  running = run;
  run.promise = listen(run, t, beatRange(t));
  return run.promise;
}

/** Forgets everything listened to and ends a listening (tests). */
export function forgetOwnBeats(): void {
  stopListening();
  useOwnBeats.setState({ found: {} });
}
