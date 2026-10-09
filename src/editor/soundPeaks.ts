import { useEffect } from "react";
import { create } from "zustand";
import { cancelSoundPeaks, isPeaksAvailable, PEAKS_CANCELLED, soundPeaks, type SoundPeaksResult } from "@/modules/clipy-video";
import { newId } from "@/src/lib/id";
import { storage } from "@/src/projects";
import { expoFs } from "@/src/projects/expoFs";
import { assemblePeaks, decodePeaks, encodePeaks, peaksFileName, peaksPlan, type Peaks, type PeaksCall } from "./model/peaks";
import type { Project } from "./model/types";
import { useEditorStore } from "./store";

/**
 * The outlines ("waveforms") the timeline's sound bars draw: fetched ONCE per source file for its whole length (`peaksPlan`), kept
 * here for the session by the file's uri, and saved beside the project (`<project>/peaks/<peaksFileName>`) so an editor that opens
 * again reads a small file instead of decoding a song. Never in the project document, never part of undo.
 *
 * It is the track's ORIGINAL file (`sourceUri`) — never its Voice / Sound / Reduce-noise copy (`playUri`): a copy changes how the
 * sound sounds, not where its peaks are, and waiting for a render would leave the bar blank.
 *
 * This file is the only caller of `soundPeaks` / `cancelSoundPeaks`. One native call at a time (the loop below), and only while
 * the editor stands still (`idle`). Without the function (Expo Go, an older build) nothing here does anything: no call, no file
 * read, no message — the bars are as they were.
 */
export type PeaksFile = { status: "ready"; peaks: Peaks } | { status: "failed" };
/**
 * What is known of a file's outline, by its uri. Nothing known = no entry (also while it is being fetched: nothing draws a wait).
 * A failed file stays failed for the session — it is not asked again — and simply has no outline. Written only by this file; read
 * with `readyPeaks`, which returns a stored object (never `s.files` itself).
 */
export const usePeaksFiles = create<{ files: Record<string, PeaksFile> }>(() => ({ files: {} }));
/** The outline a bar draws: the file's, once it is there; null at every other time (and for a missing file: pass null). */
export function readyPeaks(files: Record<string, PeaksFile>, uri: string | null): Peaks | null {
  const entry = uri === null ? undefined : files[uri];
  return entry !== undefined && entry.status === "ready" ? entry.peaks : null;
}

/** Where a project's outlines are cached. Deleted with the project; swept when it is opened (`sweepPeaks`). */
export const peaksDir = (projectId: string): string => `${storage.projectDir(projectId)}/peaks`;
/**
 * Nothing is decoded while the editor is in use: a call starts only when two looks this far apart saw the same project, playhead
 * and zoom, nothing playing and nothing being recorded — so not during a drag, a trim, a scrub, a pinch or playback. It is a look
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
/** The native call that has not answered yet. */
let running: { jobId: string; uri: string; giveUp: () => void } | null = null;

type Look = { project: unknown; playhead: number; pps: number; busy: boolean };
const look = (): Look => { const s = useEditorStore.getState(); return { project: s.project, playhead: s.playhead, pps: s.pixelsPerSecond, busy: s.isPlaying || s.recording }; };
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
function answered(uri: string, call: PeaksCall): Promise<SoundPeaksResult> {
  return new Promise<SoundPeaksResult>((resolve, reject) => {
    const jobId = newId();
    let open = true;
    let grace: ReturnType<typeof setTimeout> | null = null;
    const settle = (end: () => void): void => {
      if (!open) return;
      open = false;
      clearTimeout(deadline);
      if (grace !== null) clearTimeout(grace);
      if (running !== null && running.jobId === jobId) running = null;
      end();
    };
    const deadline = setTimeout(() => settle(() => {
      stopNative(jobId);
      reject(new Error(`peaks: no answer after ${PEAKS_DEADLINE_MS / 1000} s`));
    }), PEAKS_DEADLINE_MS);
    running = { jobId, uri, giveUp: () => { if (grace === null) grace = setTimeout(() => settle(() => reject(cancelledError())), PEAKS_CANCEL_GRACE_MS); } };
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
          answers.push(await answered(next.uri, call));
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
  if (running !== null && !sources.some((s) => s.uri === running?.uri)) cancelRunning();
  void pump();
}

/**
 * The editor is left (or another project opens): the call that runs is cancelled and nothing more is asked. What is known stays
 * for the session — the outlines, and the files that failed.
 */
export function resetPeaks(): void {
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
