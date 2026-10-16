import { useEffect } from "react";
import { cancelSoundPeaks, isPeaksAvailable, isPeaksCancelled, PEAKS_CANCELLED, soundPeaks, type SoundPeaksResult } from "@/modules/clipy-video";
import { activeTimeout } from "@/src/lib/activeTime";
import { newId } from "@/src/lib/id";
import { storage } from "@/src/projects";
import { expoFs } from "@/src/projects/expoFs";
import { assemblePeaks, decodePeaks, encodePeaks, peaksFileName, peaksPlan, type Peaks, type PeaksCall } from "./model/peaks";
import { assemblePauseOutline, PAUSES, pausePlan, type PauseOutline } from "./model/pauses";
import type { Project } from "./model/types";
import { usePeaksFiles, type PeaksFile } from "./peaksFiles";
import { useEditorStore } from "./store";
import { useVoiceLive } from "./voiceLive";

/**
 * The outlines ("waveforms") the timeline's sound bars draw: fetched ONCE per source file for its whole length (`peaksPlan`), kept
 * here for the session by the file's uri, and saved beside the project (`<project>/peaks/<peaksFileName>`) so an editor that opens
 * again reads a small file instead of decoding a song. Never in the project document, never part of undo.
 *
 * What is known lives in `usePeaksFiles` (peaksFiles.ts), written only here.
 *
 * It is the track's ORIGINAL file (`sourceUri`) — never its Voice / Sound / Reduce-noise copy (`playUri`): a copy changes how the
 * sound sounds, not where its peaks are, and waiting for a render would leave the bar blank.
 *
 * This file is the only caller of `soundPeaks` / `cancelSoundPeaks`. One native call at a time (the loop below), and only while
 * the editor stands still (`idle`). Without the function (Expo Go, an older build) nothing here does anything: no call, no file
 * read, no message — the bars are as they were.
 *
 * Remove pauses listens here too (`listenForPauses`): one native call at a time for both — the turn below.
 */
/** Where a project's outlines are cached. Deleted with the project; swept when it is opened (`sweepPeaks`). */
export const peaksDir = (projectId: string): string => `${storage.projectDir(projectId)}/peaks`;
/**
 * Nothing is decoded while the editor is in use: a call starts only when two looks this far apart saw the same project, playhead
 * and zoom, nothing playing, nothing being recorded and no voice-over counted down — so not during a drag, a trim, a scrub, a pinch or playback. It is a look
 * every 600 ms while something waits (no listener on the store, nothing per frame); the calls of one file follow each other without
 * a new wait for as long as nothing has moved.
 */
export const PEAKS_SETTLE_MS = 600;
/** The longest one call may take (it reads at most 200 s of sound). After that it is told to stop and the file counts as failed. */
export const PEAKS_DEADLINE_MS = 30000;
/** How long a call that was told to stop is given to say so before the loop goes on without it. */
export const PEAKS_CANCEL_GRACE_MS = 2000;

/** One file the open project draws: its uri and the length the project knows for it. */
export type PeaksSource = { uri: string; duration: number };
/** Every different sound file of the project's music, voice and sound-effect bars, in track order; a missing file is left out. */
export function peaksSources(p: Pick<Project, "audioTracks">, missing: readonly string[] = []): PeaksSource[] {
  const out: PeaksSource[] = [];
  for (const t of p.audioTracks) {
    if (missing.includes(t.sourceUri) || out.some((s) => s.uri === t.sourceUri)) continue;
    out.push({ uri: t.sourceUri, duration: t.sourceDuration });
  }
  return out;
}

const setFile = (uri: string, file: PeaksFile): void => usePeaksFiles.setState((s) => ({ files: { ...s.files, [uri]: file } }));
const cancelledError = (): Error => Object.assign(new Error("Peaks cancelled"), { code: PEAKS_CANCELLED });

/** What the open project draws now (the newest call wins), and whether the one-at-a-time loop runs. */
let wanted: { projectId: string; sources: PeaksSource[] } | null = null;
let pumping = false;
/** Counts the times the editor was left or another project opened: an answer from before belongs to nobody. */
let epoch = 0;
/** Who asked a native call: the waveforms' loop, or Remove pauses. */
type CallKind = "wave" | "pauses";
/** The native call that has not answered yet. */
let running: { jobId: string; uri: string; kind: CallKind; giveUp: () => void } | null = null;

type Look = { project: unknown; playhead: number; pps: number; busy: boolean };
// A voice-over's countdown (the Record tab's 3 … 1) is busy as well: the recording it leads to must not find a render under way.
const look = (): Look => { const s = useEditorStore.getState(); return { project: s.project, playhead: s.playhead, pps: s.pixelsPerSecond, busy: s.isPlaying || s.recording || useVoiceLive.getState().counting }; };
const same = (a: Look, b: Look): boolean => a.project === b.project && a.playhead === b.playhead && a.pps === b.pps;
/** What the editor looked like when it last stood still (null: not known to stand), and the wait for it. */
let stood: Look | null = null;
let waiting: { timer: ReturnType<typeof setTimeout>; end: (ok: boolean) => void } | null = null;
/**
 * Resolves true once the editor stands still (see PEAKS_SETTLE_MS) — at once when it has not moved since it last did — and false
 * when the editor was left meanwhile (`resetPeaks`).
 */
function idle(run: number): Promise<boolean> {
  const now = look();
  if (stood !== null && !now.busy && same(stood, now)) return Promise.resolve(true);
  stood = null;
  return new Promise<boolean>((resolve) => {
    let seen = now;
    const end = (ok: boolean): void => { waiting = null; resolve(ok); };
    const tick = (): void => {
      if (epoch !== run) { end(false); return; }
      const at = look();
      if (!at.busy && same(seen, at)) { stood = at; end(true); return; }
      seen = at;
      waiting = { timer: setTimeout(tick, PEAKS_SETTLE_MS), end };
    };
    waiting = { timer: setTimeout(tick, PEAKS_SETTLE_MS), end };
  });
}

function stopNative(jobId: string): void {
  try { cancelSoundPeaks(jobId); } catch (e) { console.warn("peaks cancel failed", e); }
}
/**
 * Waits for one native call — but never for ever: it ends with the answer, or `PEAKS_CANCEL_GRACE_MS` after it was cancelled (as a
 * cancelled call), or at `PEAKS_DEADLINE_MS` (as a failed one, and the phone is told to stop). A later answer is dropped.
 */
function answered(uri: string, call: PeaksCall, kind: CallKind): Promise<SoundPeaksResult> {
  return new Promise<SoundPeaksResult>((resolve, reject) => {
    const jobId = newId();
    let open = true;
    let grace: ReturnType<typeof setTimeout> | null = null;
    const settle = (end: () => void): void => {
      if (!open) return;
      open = false;
      stopDeadline();
      if (grace !== null) clearTimeout(grace);
      if (running !== null && running.jobId === jobId) running = null;
      end();
    };
    // Counted only while Clipy is in front (activeTime.ts): a listening left for another app is not failed on the way back.
    const stopDeadline = activeTimeout(() => settle(() => {
      stopNative(jobId);
      reject(new Error(`peaks: no answer after ${PEAKS_DEADLINE_MS / 1000} s`));
    }), PEAKS_DEADLINE_MS);
    running = { jobId, uri, kind, giveUp: () => { if (grace === null) grace = setTimeout(() => settle(() => reject(cancelledError())), PEAKS_CANCEL_GRACE_MS); } };
    let native: Promise<SoundPeaksResult>;
    try { native = soundPeaks({ jobId, uri, from: call.from, to: call.to, count: call.count }); } catch (e) { settle(() => reject(e)); return; }
    native.then((r) => settle(() => resolve(r)), (e: unknown) => settle(() => reject(e)));
  });
}
function cancelRunning(): void {
  const r = running;
  if (!r) return;
  stopNative(r.jobId);
  r.giveUp();
}

/**
 * Every native call — a waveform's or a pause's — holds ONE turn while it runs, so the phone never reads two at once. A listening for
 * pauses (asked by the owner's tap) goes before every WAITING waveform call and keeps the turn for ALL its calls; nothing interrupts a
 * call that runs.
 */
let turnHeld = false;
const turnQueue: { urgent: boolean; go: () => void }[] = [];
function takeTurn(urgent: boolean): Promise<void> {
  if (!turnHeld) { turnHeld = true; return Promise.resolve(); }
  return new Promise<void>((go) => { turnQueue.push({ urgent, go }); });
}
function giveTurn(): void {
  const i = turnQueue.findIndex((w) => w.urgent);
  const next = i >= 0 ? turnQueue.splice(i, 1)[0] : turnQueue.shift();
  if (next) next.go(); else turnHeld = false;
}
/** One native call in its turn; `still` is asked again once the turn comes (the caller may have been left meanwhile). */
async function asked(uri: string, call: PeaksCall, kind: CallKind, still: () => boolean): Promise<SoundPeaksResult> {
  await takeTurn(kind === "pauses");
  try {
    if (!still()) throw cancelledError();
    return await answered(uri, call, kind);
  } finally { giveTurn(); }
}

/** The outline in the project's cache file for this source, or null (no file, not readable, not this file's: `decodePeaks`). */
async function cached(projectId: string, source: PeaksSource): Promise<Peaks | null> {
  const path = `${peaksDir(projectId)}/${peaksFileName(source.uri)}`;
  try {
    if (!(await expoFs.exists(path))) return null;
    return decodePeaks(await expoFs.readText(path), source.uri, source.duration);
  } catch (e) { console.warn("peaks cache read failed", e); return null; }
}

async function pump(): Promise<void> {
  if (pumping) return;
  pumping = true;
  try {
    for (;;) {
      const w = wanted;
      if (!w || !isPeaksAvailable()) return;
      const { files } = usePeaksFiles.getState();
      const next = w.sources.find((s) => files[s.uri] === undefined);
      if (!next) return;
      const run = epoch;
      /** The answer belongs to the editor that asked, and to a file it still draws. */
      const stillWanted = (): boolean => epoch === run && wanted !== null && wanted.sources.some((s) => s.uri === next.uri);
      try {
        const held = await cached(w.projectId, next);
        if (epoch !== run) continue;
        if (held) { setFile(next.uri, { status: "ready", peaks: held }); continue; }
        const plan = peaksPlan(next.duration);
        const answers: SoundPeaksResult[] = [];
        for (const call of plan) {
          if (!(await idle(run)) || !stillWanted()) throw cancelledError();
          answers.push(await asked(next.uri, call, "wave", stillWanted));
        }
        if (!stillWanted()) continue;
        const peaks = assemblePeaks(plan, answers);
        if (!peaks) throw new Error("peaks: the answers do not fit the file");
        setFile(next.uri, { status: "ready", peaks });
        // The cache is only a saving: a write that fails costs the next opening a decode, nothing else.
        void expoFs.writeText(`${peaksDir(w.projectId)}/${peaksFileName(next.uri)}`, encodePeaks(next.uri, peaks)).catch((e: unknown) => console.warn("peaks cache write failed", e));
      } catch (e) {
        if (!stillWanted()) continue;   // nobody needed it any more; if someone does again, it is asked again
        console.warn("peaks failed", e instanceof Error ? e.message : String(e));
        setFile(next.uri, { status: "failed" });
      }
    }
  } finally { pumping = false; }
}

/**
 * The editor says which files the open project draws: a call for a file nobody draws any more is cancelled, and whatever is drawn
 * and not known yet is read from the cache or fetched, one call at a time. Never touches the project.
 */
export function syncPeaks(projectId: string, sources: PeaksSource[]): void {
  wanted = { projectId, sources };
  if (running !== null && running.kind === "wave" && !sources.some((s) => s.uri === running?.uri)) cancelRunning();
  void pump();
}

/**
 * The editor is left (or another project opens): the call that runs is cancelled and nothing more is asked. What is known stays
 * for the session — the outlines, and the files that failed.
 */
export function resetPeaks(): void {
  stopPauses();
  wanted = null;
  epoch += 1;
  stood = null;
  cancelRunning();
  const w = waiting;
  if (w) { clearTimeout(w.timer); w.end(false); }
}

/**
 * Removes the cache files in the project's peaks folder that no sound bar of the OPEN project uses — asked at the moment each file
 * is about to go, so one that became needed meanwhile stays. Run once when a project is opened. Never touches a media file.
 */
export async function sweepPeaks(projectId: string): Promise<void> {
  const dir = peaksDir(projectId);
  const neededNow = (name: string): boolean => {
    const s = useEditorStore.getState();
    if (!s.project || s.project.id !== projectId) return true;   // not the open project any more: leave everything
    return s.project.audioTracks.some((t) => peaksFileName(t.sourceUri) === name);
  };
  try {
    for (const name of await expoFs.list(dir)) if (!neededNow(name)) await expoFs.remove(`${dir}/${name}`);
  } catch (e) { console.warn("peaks sweep failed", e); }
}

/** Remove pauses: one clip's sound over its trim. */
export type PauseSource = { uri: string; from: number; to: number };
export type PauseFailure = "build" | "tooLong" | "noSound" | "failed";
export type PauseListening = { status: "ready"; outline: PauseOutline } | { status: "failed"; reason: PauseFailure } | { status: "stopped" };
/** The outlines heard this session — floats, by file, range and density. In memory only (spec §2.3): never on disk, never in the project or undo. */
const heard = new Map<string, PauseOutline>();
export const pauseKey = (s: PauseSource): string => `${s.uri}|${s.from}|${s.to}|${PAUSES.perSecond}`;
/** Reading an outline makes it the newest: the session keeps the ones used last. */
export function heardPauses(s: PauseSource): PauseOutline | null {
  const key = pauseKey(s), o = heard.get(key);
  if (!o) return null;
  heard.delete(key); heard.set(key, o);
  return o;
}
/** The listening that runs (one at a time), and the count that `stopPauses` raises: an answer from before belongs to nobody. */
let listening: { key: string; run: number; done: Promise<PauseListening> } | null = null;
let pausesRun = 0;

/**
 * Listens to a clip's ORIGINAL file over its trim (`pausePlan`: calls of 20 s), one native call at a time and ahead of the waiting
 * waveform calls — not waiting for the editor to stand still: the owner asked. A second ask for the same source joins the first; another
 * source stops it. Each call has PEAKS_DEADLINE_MS. Only a ready outline is remembered.
 */
export function listenForPauses(s: PauseSource): Promise<PauseListening> {
  if (!isPeaksAvailable()) return Promise.resolve({ status: "failed", reason: "build" });
  const key = pauseKey(s);
  const known = heard.get(key);
  if (known) return Promise.resolve({ status: "ready", outline: known });
  if (listening !== null && listening.key === key && listening.run === pausesRun) return listening.done;
  stopPauses();
  const plan = pausePlan(s.from, s.to);
  if (!plan) return Promise.resolve({ status: "failed", reason: "tooLong" });
  const run = pausesRun;
  const still = (): boolean => run === pausesRun;
  // The listening holds ONE turn for all its calls, so no waiting waveform call runs between two of them.
  const done = (async (): Promise<PauseListening> => {
    await takeTurn(true);
    try {
      const answers: SoundPeaksResult[] = [];
      for (const call of plan) {
        if (!still()) return { status: "stopped" };
        answers.push(await answered(s.uri, call, "pauses"));
      }
      if (!still()) return { status: "stopped" };
      const outline = assemblePauseOutline(plan, answers);
      if (!outline) throw new Error("pauses: the answers do not fit the clip");
      heard.set(key, outline);
      while (heard.size > PAUSES.remember) heard.delete(heard.keys().next().value as string);
      return { status: "ready", outline };
    } catch (e) {
      if (!still() || isPeaksCancelled(e)) return { status: "stopped" };
      const text = e instanceof Error ? e.message : String(e);
      console.warn("pauses failed", text);
      return { status: "failed", reason: text.includes("has no sound") ? "noSound" : "failed" };
    } finally {
      giveTurn();
      if (listening !== null && listening.run === run) listening = null;
    }
  })();
  listening = { key, run, done };
  return done;
}

/** Stops the listening (the strip closed, another clip, the editor left): its call is cancelled, a late answer dropped. */
export function stopPauses(): void {
  pausesRun += 1;
  listening = null;
  if (running !== null && running.kind === "pauses") cancelRunning();
}

const keyOf = (sources: readonly PeaksSource[]): string => sources.map((s) => `${s.uri}|${s.duration}`).join("\n");
/**
 * Mount once in the editor: keeps the open project's outlines fetched. It reads only WHICH files the sound bars use, so moving,
 * trimming, splitting or changing a bar does nothing here. Sets no React state and never writes the project.
 */
export function useWaveforms(): void {
  const projectId = useEditorStore((s) => s.project?.id ?? null);
  const key = useEditorStore((s) => (s.project ? keyOf(peaksSources(s.project, s.missingSourceUris)) : ""));
  useEffect(() => {
    resetPeaks();
    if (projectId && isPeaksAvailable()) void sweepPeaks(projectId);
    return resetPeaks;
  }, [projectId]);
  useEffect(() => {
    const s = useEditorStore.getState();
    if (!projectId || !s.project || !isPeaksAvailable()) return;
    syncPeaks(projectId, peaksSources(s.project, s.missingSourceUris));
  }, [projectId, key]);
}
