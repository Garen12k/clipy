import { useEffect } from "react";
import { activeTimeout } from "@/src/lib/activeTime";
import { addSteadyListener, cancelSteady, isBlurAndCutsBuild, isSteadyAvailable, isSteadyCancelled, measureShake, renderSteady, STEADY_CANCELLED, type ShakeResult } from "@/modules/clipy-video";
import { levelRule, neededSteady, parseSteadyName, SMOOTH, SMOOTH_MARK, STEADY, steadyDeadlineMs, type NeededSteady } from "@/src/editor/model/steady";
import { steadyShifts, type Shifts } from "@/src/editor/model/steadyPath";
import type { Project } from "@/src/editor/model/types";
import { STEADY_TOOLS } from "@/src/lib/buildInfo";
import { newId } from "@/src/lib/id";
import { storage } from "@/src/projects";
import { expoFs } from "@/src/projects/expoFs";
import { useToast } from "@/src/ui/Toast";
import { takeTurn } from "./renderTurn";
import { steadyNeeded, useSteadyFiles, type SteadyFile } from "./steadyFiles";
import { useEditorStore } from "./store";

/** Said once when a copy could not be made. The setting stays; the clip shows as it was. Which one is said goes by what the copy was for. */
export const STABILIZE_FAILED = "Could not stabilize the clip. It shows as it was.";
export const SMOOTH_FAILED = "Could not smooth the slow motion. The clip shows as it was.";
/** Where a project's steady copies live. Deleted with the project; swept when it is opened (`openSteady`). */
export const steadyDir = (projectId: string): string => `${storage.projectDir(projectId)}/steady`;
/** How long a call that was told to stop is given to say so; after that the wait ends as a cancelled render's does. */
export const STEADY_CANCEL_GRACE_MS = 4000;
/** How long what the project needs must stay the same before a render starts: a trim or speed drag changes it again and again. */
export const STEADY_SETTLE_MS = 800;
/**
 * A measuring with more frames than this is "long": working out its path (`steadyShifts`, up to about a second of JavaScript for
 * the longest copy at High) is given a breath before and after, so touches that came in meanwhile are handled first.
 */
export const STEADY_LONG_PATH = 300;

type Running = {
  jobId: string; promise: Promise<string>; listeners: Set<(fraction: number) => void>; cancelled: boolean;
  /** What a cancel does to the wait: while the render waits for its turn, ends the wait at once; while the phone is awaited, starts the grace. */
  giveUp: (() => void) | null;
  /** Whether this copy has a measuring half (Stabilize), and which half the phone is in: its fractions are fitted into one percent. */
  staged: boolean; writing: boolean;
};
/** The renders that have not answered yet, by output path: a second caller for the same copy shares the first one's render. */
const inflight = new Map<string, Running>();
/** The phone's fraction of the half it is in, as the copy's own: measuring is the first `measureShare`, writing the rest. */
const overall = (r: Running, fraction: number): number =>
  (!r.staged ? fraction : r.writing ? STEADY.measureShare + fraction * (1 - STEADY.measureShare) : fraction * STEADY.measureShare);
let listening = false;
/** Subscribes once, and only from a render that is about to start: never on a build that does not know the event. */
function listen(): void {
  if (listening) return;
  listening = true;
  addSteadyListener((e) => { for (const r of inflight.values()) if (r.jobId === e.jobId) { const f = overall(r, e.progress); r.listeners.forEach((cb) => cb(f)); } });
}
/** A native side that cannot be told (no module) must not break the caller. */
function stopNative(jobId: string): void {
  try { cancelSteady(jobId); } catch (e) { console.warn("steady cancel failed", e); }
}
/**
 * Nobody needs this copy any more. One job id serves both halves, so the one call reaches whichever the phone is in; one that has
 * not reached the phone yet never starts, and between the halves (no native call open, `giveUp` null) `make` sees `cancelled`
 * before it asks the phone to write.
 */
function cancel(r: Running): void {
  if (r.cancelled) return;
  r.cancelled = true;
  stopNative(r.jobId);
  r.giveUp?.();
}
const cancelledError = (): Error => Object.assign(new Error("Steady cancelled"), { code: STEADY_CANCELLED });

/**
 * Waits for one native call, but never for ever: it ends with the answer, or `STEADY_CANCEL_GRACE_MS` after the render was
 * cancelled (as a cancelled one), or at `deadlineMs` (as a failed one; the phone is told to stop), whichever comes first. Whatever
 * the phone answers after that is dropped here.
 */
function answered<T>(entry: Running, start: () => Promise<T>, deadlineMs: number, stage: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let open = true;
    let grace: ReturnType<typeof setTimeout> | null = null;
    const settle = (end: () => void): void => {
      if (!open) return;
      open = false;
      stopDeadline();
      if (grace !== null) clearTimeout(grace);
      entry.giveUp = null;
      end();
    };
    // Counted in the time the app ran in front (activeTimeout): a suspension must not end a render that had no chance to run.
    const stopDeadline = activeTimeout(() => settle(() => {
      stopNative(entry.jobId);
      reject(new Error(`steady ${stage}: no answer after ${Math.round(deadlineMs / 1000)} s`));
    }), deadlineMs);
    entry.giveUp = () => { if (grace === null) grace = setTimeout(() => settle(() => reject(cancelledError())), STEADY_CANCEL_GRACE_MS); };
    let native: Promise<T>;
    try { native = start(); } catch (e) { settle(() => reject(e)); return; }
    native.then((value) => settle(() => resolve(value)), (e: unknown) => settle(() => reject(e)));
  });
}

/** What the phone measured, by source file and range: another strength, or Smooth slow motion switched on afterwards, writes a new copy without measuring again. For the session only; a handful at most. */
const shakes = new Map<string, ShakeResult>();
const SHAKES_KEPT = 6;
const shakeKey = (need: NeededSteady): string => `${need.sourceUri}|${need.from}|${need.to}`;
export function forgetShakes(): void { shakes.clear(); }
const NO_SHIFTS: Shifts = { times: [], dx: [], dy: [] };
/** The largest step in a list, by a loop: thousands of numbers are never handed to one call as arguments. */
function largest(list: readonly number[]): number {
  let most = 0;
  for (let i = 0; i < list.length; i += 1) { const v = Math.abs(list[i]); if (v > most) most = v; }
  return most;
}
/** Lets what waits on the JavaScript thread (a touch, a frame) go first. Always ends. */
const breath = (): Promise<void> => new Promise<void>((resolve) => { setTimeout(resolve, 0); });

/**
 * One copy's native work, inside its turn: measure (unless remembered), work out the corrections, write. Two native calls under one
 * job id, each with its own deadline counted from the moment the phone is handed it. It always settles (both waits do, and a breath
 * does), so the turn is always given on; cancelled between the halves it ends as a cancelled render before anything is written.
 */
async function make(entry: Running, need: NeededSteady, dir: string): Promise<void> {
  const deadline = steadyDeadlineMs(need);
  const rule = levelRule(need.level);
  let shifts = NO_SHIFTS;
  if (rule !== null) {
    let shake = shakes.get(shakeKey(need));
    if (shake === undefined) {
      const request = { jobId: entry.jobId, sourceUri: need.sourceUri, from: need.from, to: need.to, minFrameGap: STEADY.minFrameGap, measureSide: STEADY.measureSide };
      shake = await answered(entry, () => measureShake(request), deadline.measure, "measure");
      if (shake === null || typeof shake !== "object" || !Array.isArray(shake.times) || !Array.isArray(shake.dx) || !Array.isArray(shake.dy)) throw new Error("steady measure: no numbers came back");
      if (shakes.size >= SHAKES_KEPT) { const oldest = shakes.keys().next().value; if (oldest !== undefined) shakes.delete(oldest); }
      shakes.set(shakeKey(need), shake);
      // Phone check 4 (spec §10): the size of Vision's numbers, in the dev server's log.
      console.log("steady shake", { frames: shake.frames, failed: shake.failed, largest: Math.max(largest(shake.dx), largest(shake.dy)) });
    }
    if (entry.cancelled) throw cancelledError();
    const long = shake.times.length > STEADY_LONG_PATH;
    if (long) { await breath(); if (entry.cancelled) throw cancelledError(); }
    shifts = steadyShifts(shake, { radius: rule.radius, zoom: rule.zoom, cutShift: STEADY.cutShift, scaleX: STEADY.scaleX, scaleY: STEADY.scaleY });
    if (long) { await breath(); if (entry.cancelled) throw cancelledError(); }
  }
  entry.writing = true;
  const request = {
    jobId: entry.jobId, sourceUri: need.sourceUri, outputPath: `${dir}/${need.name}`, from: need.from, to: need.to, maxSide: STEADY.maxSide,
    minFrameGap: STEADY.minFrameGap, grid: need.grid, zoom: rule === null ? 1 : rule.zoom, times: shifts.times, dx: shifts.dx, dy: shifts.dy,
    bitRate: need.bitRate, blendFloor: STEADY.blendFloor,
    // Only a copy with blended frames is asked about cuts; a steadied-only copy's request is what it always was. (A build from
    // before the key ignores it and blends every pair, as it always did.)
    ...(need.grid > 0 ? { cutDifference: SMOOTH.cutDifference } : null),
  };
  const made = await answered(entry, () => renderSteady(request), deadline.render, "render");
  // For tuning `SMOOTH.cutDifference` without a build: the pairs taken as cuts and the largest difference seen, in the dev server's log.
  if (need.grid > 0 && made && typeof made.cuts === "number") console.log("steady cuts", { cuts: made.cuts, largest: made.apart, frames: made.frames, limit: SMOOTH.cutDifference });
}

/** Whether the installed build tells a cut inside a clip (`cutDifference`). A module that cannot be asked counts as one that does not. */
function tellsCuts(): boolean {
  try { return isBlurAndCutsBuild() === true; } catch { return false; }
}

/**
 * The steady copy `need` names: its uri once it exists — found on disk, or made now (one render per copy however many ask).
 * Rejects with STEADY_TOOLS without the tool, with the staged message when the phone fails or does not answer in time, and with
 * the cancel code when it was cancelled (`isSteadyCancelled`). It always settles. Heavy native renders of every kind take turns
 * (`takeTurn`): a deadline counts from the moment the phone is handed the call. `onProgress` gets one fraction for the whole copy.
 * `need` comes from `steadyNeedOf` / `steadyNeeded`. Used by the editor (`syncSteady`) and by the export. A copy of the OPEN
 * project that is known as failed and is there after all (the export made it) becomes known as ready: the strip stops saying it
 * failed and the preview shows it. Nothing else is written for a caller outside the queue.
 */
export function ensureSteady(projectId: string, need: NeededSteady, onProgress?: (fraction: number) => void): Promise<string> {
  const dir = steadyDir(projectId);
  const path = `${dir}/${need.name}`;
  const running = inflight.get(path);
  if (running) {
    if (onProgress) running.listeners.add(onProgress);
    return running.promise;
  }
  const entry: Running = { jobId: newId(), promise: Promise.resolve(path), listeners: new Set(onProgress ? [onProgress] : []), cancelled: false, giveUp: null, staged: levelRule(need.level) !== null, writing: false };
  const work = async (): Promise<string> => {
    if (await expoFs.exists(path)) return path;
    if (!isSteadyAvailable()) throw new Error(STEADY_TOOLS);
    listen();
    await expoFs.mkdir(dir);
    if (entry.cancelled) throw cancelledError();
    await takeTurn(entry, () => make(entry, need, dir), cancelledError);
    return path;
  };
  entry.promise = work().then((uri) => {
    const known = useSteadyFiles.getState().files[need.name];
    if (wanted !== null && wanted.projectId === projectId && known !== undefined && known.status === "failed") setFile(need.name, { status: "ready", uri });
    return uri;
  }).finally(() => { inflight.delete(path); });
  inflight.set(path, entry);
  return entry.promise;
}

const setFile = (name: string, file: SteadyFile | null): void => useSteadyFiles.setState((s) => {
  const files = { ...s.files };
  if (file) files[name] = file; else delete files[name];
  return { files };
});
/** A fraction as whole percent (0 … 1 in steps of 0.01), or null for a number that is not one. */
const wholePercent = (fraction: number): number | null =>
  (typeof fraction === "number" && Number.isFinite(fraction) ? Math.round(Math.min(1, Math.max(0, fraction)) * 100) / 100 : null);
const namesOf = (needed: readonly NeededSteady[]): string => needed.map((n) => n.name).join("|");

/** What the open project needs now (the newest call wins), and the project whose folder has been read: only its copies are rendered. */
let wanted: { projectId: string; needed: NeededSteady[] } | null = null;
let opened: string | null = null;
let pumping = false;
let settle: ReturnType<typeof setTimeout> | null = null;
/** A gesture says it is under way (`holdSteady`): no copy starts until it says it is over. */
let held = false;
/** Counts the times the editor was left or a project opened: an answer from before belongs to nobody. */
let epoch = 0;
/** A failure has been said since what is needed last changed: a phone that fails every copy is said once. */
let toldFailure = false;

async function pump(): Promise<void> {
  if (pumping) return;
  pumping = true;
  try {
    for (;;) {
      const w = wanted;
      // Not while a gesture holds the queue or the project is still moving, and not before its folder has been read.
      if (!w || held || settle !== null || opened !== w.projectId) return;
      const { files } = useSteadyFiles.getState();
      const next = w.needed.find((n) => files[n.name] === undefined);
      if (!next) return;
      setFile(next.name, { status: "busy", progress: 0 });
      const run = epoch;
      const stillOpen = (): boolean => epoch === run && wanted !== null && wanted.projectId === w.projectId;
      try {
        const uri = await ensureSteady(w.projectId, next, (fraction) => {
          const now = useSteadyFiles.getState().files[next.name];
          const progress = wholePercent(fraction);
          // One write per whole percent, never backwards.
          if (!stillOpen() || now === undefined || now.status !== "busy" || progress === null || progress <= now.progress) return;
          setFile(next.name, { status: "busy", progress });
        });
        if (stillOpen()) setFile(next.name, { status: "ready", uri });
      } catch (e) {
        if (!stillOpen()) continue;
        if (isSteadyCancelled(e)) { setFile(next.name, null); continue; }   // nobody needed it any more
        const message = e instanceof Error ? e.message : String(e);
        console.warn("steady render failed", message);
        setFile(next.name, { status: "failed", message });
        if (!toldFailure) useToast.getState().show(next.level > 0 ? STABILIZE_FAILED : SMOOTH_FAILED, { kind: "problem" });
        toldFailure = true;
      }
    }
  } finally { pumping = false; }
}
/**
 * Starts the loop once what is needed has stood still for STEADY_SETTLE_MS; called again before that, the wait starts over. No
 * timer when nothing waits to be rendered, before the project's folder has been read, or while a gesture holds the queue.
 */
function kick(): void {
  if (settle !== null) { clearTimeout(settle); settle = null; }
  const w = wanted;
  if (!w || held || opened !== w.projectId) return;
  const { files } = useSteadyFiles.getState();
  if (!w.needed.some((n) => files[n.name] === undefined)) return;
  settle = setTimeout(() => { settle = null; void pump(); }, STEADY_SETTLE_MS);
}

/**
 * The editor says what the open project needs: a running render of a copy nobody needs any more is cancelled at once, and whatever
 * is needed and not known yet is rendered, one at a time, once the project has stood still. A failed copy that is not needed any
 * more is forgotten, so needing it again tries it again; one that is still needed stays failed. Never touches the project.
 */
export function syncSteady(projectId: string, needed: NeededSteady[]): void {
  if (!wanted || wanted.projectId !== projectId || namesOf(wanted.needed) !== namesOf(needed)) toldFailure = false;
  wanted = { projectId, needed };
  const dir = steadyDir(projectId);
  const keep = new Set(needed.map((n) => `${dir}/${n.name}`));
  for (const [path, r] of inflight) if (!keep.has(path)) cancel(r);
  const { files } = useSteadyFiles.getState();
  const gone = Object.keys(files).filter((name) => files[name].status === "failed" && !needed.some((n) => n.name === name));
  if (gone.length > 0) useSteadyFiles.setState((s) => {
    const left = { ...s.files };
    for (const name of gone) delete left[name];
    return { files: left };
  });
  kick();
}

/**
 * A gesture that changes which copy a clip uses again and again (the Speed slider: a Smooth slow motion clip changes its copy when
 * its speed crosses 0.5×; a trim handle) begins (true) or ends (false). While it is held no copy STARTS, however long the finger
 * rests; a copy the drag no longer needs is still cancelled at once. On release the usual wait starts from that moment. Optional:
 * without it the queue holds as the cut-out queue does — every frame of a drag changes the project and starts the wait over.
 */
export function holdSteady(on: boolean): void {
  if (held === on) return;
  held = on;
  kick();
}

/** The owner asks again for a copy that failed and is still needed: it is forgotten, so the queue tries it once more. */
export function retrySteady(name: string): void {
  const entry = useSteadyFiles.getState().files[name];
  if (entry === undefined || entry.status !== "failed") return;
  setFile(name, null);
  toldFailure = false;
  kick();
}

/** The editor is left (or another project opens): every running render is cancelled and nothing is remembered (what was measured stays for the session). */
export function resetSteady(): void {
  epoch += 1;
  wanted = null;
  opened = null;
  held = false;
  toldFailure = false;
  if (settle !== null) { clearTimeout(settle); settle = null; }
  for (const r of inflight.values()) cancel(r);
  if (Object.keys(useSteadyFiles.getState().files).length > 0) useSteadyFiles.setState({ files: {} });
}

/**
 * A project is opened: the files in its steady folder that no clip needs are removed, and the finished copies that are needed are
 * known as ready. Needed is asked of the OPEN project at the moment each file is about to go, with every finished copy still in the
 * folder counted as known. A `part-` file always goes, and so does anything that is not a copy of this version. Run once per open
 * (there is no undo history then). Only after it may renders start. Never touches a media file or another folder. Without the
 * tool nothing is read, nothing is removed and nothing is ever rendered.
 * Smooth copies and cuts: on a build that tells a cut inside a clip, a folder without `SMOOTH_MARK` holds smooth copies made
 * before it could (or with another threshold) — ghosted across a cut. They go, once, like a file nobody needs, and the mark is
 * written; the queue then makes them again. Steadied-only copies stay. On an older build nothing of this happens (and a mark
 * found there goes with the sweep, so the copies that build makes are swept when a newer one opens the project).
 */
export async function openSteady(projectId: string): Promise<void> {
  if (!isSteadyAvailable()) return;
  const run = epoch;
  const dir = steadyDir(projectId);
  const open = (): Project | null => {
    const s = useEditorStore.getState();
    return epoch === run && s.project && s.project.id === projectId ? s.project : null;
  };
  try {
    const names = await expoFs.list(dir);
    const cuts = tellsCuts();
    const stale = cuts && !names.includes(SMOOTH_MARK);
    const left = new Set(names.filter((n) => { const copy = parseSteadyName(n); return copy !== null && !(stale && copy.grid > 0); }));
    const neededNow = (): Set<string> | null => {
      const p = open();
      return p ? new Set(neededSteady(p, [], [...left]).map((n) => n.name)) : null;
    };
    for (const name of names) {
      if (cuts && name === SMOOTH_MARK) continue;
      const needed = neededNow();
      if (needed === null) return;
      if (left.has(name) && needed.has(name)) continue;
      left.delete(name);
      await expoFs.remove(`${dir}/${name}`);
    }
    if (stale) await expoFs.writeText(`${dir}/${SMOOTH_MARK}`, "");
    const needed = neededNow();
    if (needed === null) return;
    for (const name of left) if (needed.has(name) && useSteadyFiles.getState().files[name] === undefined) setFile(name, { status: "ready", uri: `${dir}/${name}` });
  } catch (e) { console.warn("steady open failed", e); }
  if (open()) { opened = projectId; kick(); }
}

/**
 * Mount once in the editor, beside `useCutoutRenders`: keeps the open project's steady copies rendered. It listens to the two
 * stores outside React and tells the manager only when WHICH copies are needed has changed; any other edit only makes a copy that
 * has not started wait on (0.8 s after the LAST change of the project, so nothing starts in the middle of a drag). A project
 * without a setting costs one look at its folder when it opens and nothing after that. Sets no React state and never writes the
 * project. Without the tool nothing happens.
 */
export function useSteadyRenders(): void {
  const projectId = useEditorStore((s) => s.project?.id ?? null);
  useEffect(() => {
    resetSteady();
    if (!projectId || !isSteadyAvailable()) return resetSteady;
    void openSteady(projectId);
    let seen: { project: Project | null; missing: readonly string[]; files: Record<string, SteadyFile> } | null = null;
    let told = "";
    const tell = (): void => {
      try {
        const s = useEditorStore.getState();
        const { files } = useSteadyFiles.getState();
        if (seen !== null && seen.project === s.project && seen.missing === s.missingSourceUris && seen.files === files) return;
        const moved = seen === null || seen.project !== s.project;
        seen = { project: s.project, missing: s.missingSourceUris, files };
        if (!s.project || s.project.id !== projectId) return;
        const needed = steadyNeeded(s.project, s.missingSourceUris, files);
        const names = namesOf(needed);
        if (names === told) { if (moved) kick(); return; }
        told = names;   // before the manager is told: what it writes comes back here
        syncSteady(projectId, needed);
      } catch (e) { console.warn("steady sync failed", e); }   // a store's listener must never break the edit that called it
    };
    const offProject = useEditorStore.subscribe(tell);
    const offFiles = useSteadyFiles.subscribe(tell);
    tell();
    return () => { offProject(); offFiles(); resetSteady(); };
  }, [projectId]);
}
