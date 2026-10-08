import { useEffect } from "react";
import { addCutoutListener, cancelCutout, CUTOUT_CANCELLED, isCutoutAvailable, isCutoutCancelled, renderCutout, type CutoutRequest } from "@/modules/clipy-video";
import { CUTOUT, cutoutDeadlineMs, cutoutStillName, neededCutouts, parseCutoutName, type NeededCutout } from "@/src/editor/model/cutout";
import type { Project } from "@/src/editor/model/types";
import { BEATS_BACKGROUND_TOOLS } from "@/src/lib/buildInfo";
import { newId } from "@/src/lib/id";
import { storage } from "@/src/projects";
import { expoFs } from "@/src/projects/expoFs";
import { useToast } from "@/src/ui/Toast";
import { cutoutsNeeded, useCutoutFiles, type CutoutFile } from "./cutoutFiles";
import { takeTurn } from "./renderTurn";
import { useEditorStore } from "./store";

/** Said once when a copy could not be rendered. The switch stays on; the clip shows as it was. */
export const CUTOUT_FAILED = "Could not remove the background. The clip shows as it was.";
/** Said instead when the phone found no person in the picture. */
export const CUTOUT_NO_PERSON = "No person was found in that clip. It shows as it was.";
/** Whether a failed render's message says that no person was found. */
export const isNoPerson = (message: string): boolean => message.includes("cutout person:");
/** Where a project's cut-out copies live. Deleted with the project; swept when it is opened (`openCutouts`). */
export const cutoutDir = (projectId: string): string => `${storage.projectDir(projectId)}/cutout`;
/**
 * How long a render that was told to stop is given to say so (as for sounds). After that the wait ends as a cancelled render's does,
 * whatever the native side does later: the queue (one render at a time) never stands still behind a render that does not answer.
 */
export const CUTOUT_CANCEL_GRACE_MS = 4000;
/**
 * How long what the project needs must stay the same before a render starts: a trim drag changes it again and again, and a copy
 * takes about as long as its clip. (The longest one copy may take is not a constant: `cutoutDeadlineMs` grows with its length.)
 */
export const CUTOUT_SETTLE_MS = 800;

type Running = {
  jobId: string; promise: Promise<string>; listeners: Set<(fraction: number) => void>; cancelled: boolean;
  /**
   * What a cancel does to the wait (`cancel` calls it). While the render waits for its turn: ends the wait at once. While the
   * native render is awaited: starts the grace after which the wait ends by itself.
   */
  giveUp: (() => void) | null;
};
/** The renders that have not answered yet, by output path: a second caller for the same copy shares the first one's render. */
const inflight = new Map<string, Running>();
let listening = false;
/** Subscribes once, and only from a render that is about to start: never on a build that does not know the event. */
function listen(): void {
  if (listening) return;
  listening = true;
  addCutoutListener((e) => { for (const r of inflight.values()) if (r.jobId === e.jobId) r.listeners.forEach((cb) => cb(e.progress)); });
}
/** A native side that cannot be told (no module) must not break the caller. */
function stopNative(jobId: string): void {
  try { cancelCutout(jobId); } catch (e) { console.warn("cutout cancel failed", e); }
}
/**
 * Nobody needs this render any more. One that has not reached the native side yet never starts (it answers as a cancelled render
 * does); a running one is told to stop, once.
 */
function cancel(r: Running): void {
  if (r.cancelled) return;
  r.cancelled = true;
  stopNative(r.jobId);
  r.giveUp?.();
}
const cancelledError = (): Error => Object.assign(new Error("Cutout cancelled"), { code: CUTOUT_CANCELLED });

/**
 * Waits for one native render, but never for ever: it ends with the answer, or `CUTOUT_CANCEL_GRACE_MS` after the render was
 * cancelled (as a cancelled render), or at `deadlineMs` (as a failed one; the phone is told to stop), whichever comes first.
 * Whatever the native side answers after that is dropped here: nobody waits for it and no state is written for it. (A copy it still
 * finishes is simply on disk, written as `part-<name>` and moved: it is found the next time it is needed, or swept at the next open.)
 */
function answered(entry: Running, start: () => Promise<unknown>, deadlineMs: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let open = true;
    let grace: ReturnType<typeof setTimeout> | null = null;
    const settle = (end: () => void): void => {
      if (!open) return;
      open = false;
      clearTimeout(deadline);
      if (grace !== null) clearTimeout(grace);
      entry.giveUp = null;
      end();
    };
    const deadline = setTimeout(() => settle(() => {
      stopNative(entry.jobId);
      reject(new Error(`cutout render: no answer after ${Math.round(deadlineMs / 1000)} s`));
    }), deadlineMs);
    entry.giveUp = () => { if (grace === null) grace = setTimeout(() => settle(() => reject(cancelledError())), CUTOUT_CANCEL_GRACE_MS); };
    let native: Promise<unknown>;
    try { native = start(); } catch (e) { settle(() => reject(e)); return; }
    native.then(() => settle(resolve), (e: unknown) => settle(() => reject(e)));
  });
}

/**
 * One native render at a time, whoever asks (the editor's queue, the export): the phone renders one cut-out at a time anyway and a
 * second call would WAIT there, with its deadline already running. So `run` (the native call with its deadline) starts only when
 * the call before it is over. A call that is cancelled while it waits answers as a cancelled render AT ONCE and never reaches the
 * phone. The turn is always given on: `run` always settles (`answered`), a call that throws counts as over, and a call that was
 * cancelled while waiting passes the turn on the moment it gets it. The turn itself is shared with every other heavy render (renderTurn.ts).
 */
const inTurn = (entry: Running, run: () => Promise<void>): Promise<void> => takeTurn(entry, run, cancelledError);

const requestFor = (need: NeededCutout, jobId: string, dir: string): CutoutRequest => ({
  jobId, sourceUri: need.sourceUri, outputPath: `${dir}/${need.name}`, kind: need.photo ? "photo" : "video", from: need.from, to: need.to,
  maxSide: need.photo ? CUTOUT.photoMaxSide : CUTOUT.videoMaxSide, minFrameGap: CUTOUT.minFrameGap, minPerson: CUTOUT.minPerson,
  alphaQuality: CUTOUT.alphaQuality, bitsPerPixel: CUTOUT.bitsPerPixel,
  stillPath: need.photo ? `${dir}/${cutoutStillName(need.name)}` : "", stillSeconds: need.photo ? CUTOUT.stillSeconds : 0,
});
/** A finished copy is on disk: a video's file; a photo's PNG AND its still movie. */
async function onDisk(dir: string, need: NeededCutout): Promise<boolean> {
  if (!(await expoFs.exists(`${dir}/${need.name}`))) return false;
  return !need.photo || expoFs.exists(`${dir}/${cutoutStillName(need.name)}`);
}

/**
 * The cut-out copy `need` names: its uri once it exists — found on disk, or rendered now (one render per copy however many ask).
 * Rejects with BEATS_BACKGROUND_TOOLS without the tool, with the native staged message when the render fails or does not answer in
 * time, and with the cancel code when it was cancelled (`isCutoutCancelled`). It always settles. Native renders take turns
 * (`inTurn`): the deadline of a render counts from the moment the phone is handed it. `onProgress` gets the phone's own
 * fractions. `need` comes from `cutoutNeedOf` / `cutoutsNeeded`. Used by the editor (`syncCutouts`) and by the export.
 */
export function ensureCutout(projectId: string, need: NeededCutout, onProgress?: (fraction: number) => void): Promise<string> {
  const dir = cutoutDir(projectId);
  const path = `${dir}/${need.name}`;
  const running = inflight.get(path);
  if (running) {
    if (onProgress) running.listeners.add(onProgress);
    return running.promise;
  }
  const entry: Running = { jobId: newId(), promise: Promise.resolve(path), listeners: new Set(onProgress ? [onProgress] : []), cancelled: false, giveUp: null };
  const work = async (): Promise<string> => {
    if (await onDisk(dir, need)) return path;
    if (!isCutoutAvailable()) throw new Error(BEATS_BACKGROUND_TOOLS);
    listen();
    await expoFs.mkdir(dir);
    if (entry.cancelled) throw cancelledError();
    await inTurn(entry, () => answered(entry, () => renderCutout(requestFor(need, entry.jobId, dir)), cutoutDeadlineMs(need)));
    return path;
  };
  entry.promise = work().finally(() => { inflight.delete(path); });
  inflight.set(path, entry);
  return entry.promise;
}

const setFile = (name: string, file: CutoutFile | null): void => useCutoutFiles.setState((s) => {
  const files = { ...s.files };
  if (file) files[name] = file; else delete files[name];
  return { files };
});
/** A fraction from the phone as whole percent (0 … 1 in steps of 0.01), or null for a number that is not one. */
const wholePercent = (fraction: number): number | null =>
  (typeof fraction === "number" && Number.isFinite(fraction) ? Math.round(Math.min(1, Math.max(0, fraction)) * 100) / 100 : null);
const namesOf = (needed: readonly NeededCutout[]): string => needed.map((n) => n.name).join("|");

/** What the open project needs now (the newest call wins), and the project whose folder has been read: only its copies are rendered. */
let wanted: { projectId: string; needed: NeededCutout[] } | null = null;
let opened: string | null = null;
/** Whether the one-at-a-time loop runs, and the wait for the project to stand still (null: it stands). */
let pumping = false;
let settle: ReturnType<typeof setTimeout> | null = null;
/** Counts the times the editor was left or a project opened: an answer from before belongs to nobody. */
let epoch = 0;
/** A failure has been said since what is needed last changed: a phone that fails every copy is said once, not once per copy. */
let toldFailure = false;

async function pump(): Promise<void> {
  if (pumping) return;
  pumping = true;
  try {
    for (;;) {
      const w = wanted;
      // Not while the project is still moving (the wait's own timer comes back here), and not before its folder has been read.
      if (!w || settle !== null || opened !== w.projectId) return;
      const { files } = useCutoutFiles.getState();
      const next = w.needed.find((n) => files[n.name] === undefined);
      if (!next) return;
      setFile(next.name, { status: "busy", progress: 0 });
      const run = epoch;
      /** The answer belongs to the project that asked, as it was opened then: left or opened again by now → drop it. */
      const stillOpen = (): boolean => epoch === run && wanted !== null && wanted.projectId === w.projectId;
      try {
        const uri = await ensureCutout(w.projectId, next, (fraction) => {
          const now = useCutoutFiles.getState().files[next.name];
          const progress = wholePercent(fraction);
          // One write per whole percent, never backwards: at most a hundred for a render, however often the phone reports.
          if (!stillOpen() || now === undefined || now.status !== "busy" || progress === null || progress <= now.progress) return;
          setFile(next.name, { status: "busy", progress });
        });
        if (stillOpen()) setFile(next.name, { status: "ready", uri });
      } catch (e) {
        if (!stillOpen()) continue;
        if (isCutoutCancelled(e)) { setFile(next.name, null); continue; }   // nobody needed it any more; if someone does again, it is rendered again
        const message = e instanceof Error ? e.message : String(e);
        console.warn("cutout render failed", message);
        setFile(next.name, { status: "failed", message });
        if (!toldFailure) useToast.getState().show(isNoPerson(message) ? CUTOUT_NO_PERSON : CUTOUT_FAILED);
        toldFailure = true;
      }
    }
  } finally { pumping = false; }
}
/**
 * Starts the loop once what is needed has stood still for CUTOUT_SETTLE_MS; called again before that, the wait starts over. No
 * timer at all when nothing is waiting to be rendered (a project without cut-outs, or one whose copies are all known), or before
 * the project's folder has been read (`openCutouts` comes here when it has).
 */
function kick(): void {
  if (settle !== null) { clearTimeout(settle); settle = null; }
  const w = wanted;
  if (!w || opened !== w.projectId) return;
  const { files } = useCutoutFiles.getState();
  if (!w.needed.some((n) => files[n.name] === undefined)) return;
  settle = setTimeout(() => { settle = null; void pump(); }, CUTOUT_SETTLE_MS);
}

/**
 * The editor says what the open project needs: a running render of a copy nobody needs any more is cancelled at once, and whatever
 * is needed and not known yet is rendered, one at a time, once the project has stood still (also the copy after a running one: it
 * waits for the stand-still too). A failed copy that is not needed any more is forgotten, so needing it again (the switch, off and
 * on) tries it again; one that is still needed stays failed. Never touches the project.
 */
export function syncCutouts(projectId: string, needed: NeededCutout[]): void {
  if (!wanted || wanted.projectId !== projectId || namesOf(wanted.needed) !== namesOf(needed)) toldFailure = false;
  wanted = { projectId, needed };
  const dir = cutoutDir(projectId);
  const keep = new Set(needed.map((n) => `${dir}/${n.name}`));
  for (const [path, r] of inflight) if (!keep.has(path)) cancel(r);
  const { files } = useCutoutFiles.getState();
  const gone = Object.keys(files).filter((name) => files[name].status === "failed" && !needed.some((n) => n.name === name));
  if (gone.length > 0) useCutoutFiles.setState((s) => {
    const left = { ...s.files };
    for (const name of gone) delete left[name];
    return { files: left };
  });
  kick();
}

/** The owner asks again for a copy that failed and is still needed: it is forgotten, so the queue tries it once more. */
export function retryCutout(name: string): void {
  const entry = useCutoutFiles.getState().files[name];
  if (entry === undefined || entry.status !== "failed") return;
  setFile(name, null);
  toldFailure = false;
  kick();
}

/** The editor is left (or another project opens): every running render is cancelled and nothing is remembered. */
export function resetCutouts(): void {
  epoch += 1;
  wanted = null;
  opened = null;
  toldFailure = false;
  if (settle !== null) { clearTimeout(settle); settle = null; }
  for (const r of inflight.values()) cancel(r);
  // Nothing to forget (the usual case when the editor opens): no write, so nothing that reads the store renders again.
  if (Object.keys(useCutoutFiles.getState().files).length > 0) useCutoutFiles.setState({ files: {} });
}

/** The copy a file in the folder belongs to: a photo's still movie belongs to its PNG; everything else is judged as itself. */
function copyOf(name: string): string {
  if (!name.endsWith(".mov") || parseCutoutName(name) !== null) return name;
  const png = name.replace(/\.mov$/, ".png");
  return parseCutoutName(png)?.photo === true ? png : name;
}

/**
 * A project is opened: the files in its cut-out folder that no clip needs are removed, and the finished copies that are needed are
 * known as ready. Needed is asked of the OPEN project at the moment each file is about to go (so a copy that became needed
 * meanwhile stays), with every finished copy still in the folder counted as known, so a clip keeps the copy that covers it. A
 * `part-` file always goes, and so does anything that is not a copy of this version; a photo's PNG and its still movie stay or go
 * together. Run once per open (there is no undo history then, so Undo cannot need a copy that goes). Only after it may renders
 * start. Never touches a media file or another project's folder. Without the tool (Expo Go, an older build) nothing is read,
 * nothing is removed and nothing is ever rendered.
 */
export async function openCutouts(projectId: string): Promise<void> {
  if (!isCutoutAvailable()) return;
  const run = epoch;
  const dir = cutoutDir(projectId);
  /** The project, while it is still the open one (and the editor has not been left since): otherwise nothing more is touched. */
  const open = (): Project | null => {
    const s = useEditorStore.getState();
    return epoch === run && s.project && s.project.id === projectId ? s.project : null;
  };
  try {
    const names = await expoFs.list(dir);
    const left = new Set(names.filter((n) => { const p = parseCutoutName(n); return p !== null && (!p.photo || names.includes(cutoutStillName(n))); }));
    const neededNow = (): Set<string> | null => {
      const p = open();
      return p ? new Set(neededCutouts(p, [], [...left]).map((n) => n.name)) : null;
    };
    for (const name of names) {
      const copy = copyOf(name);
      const needed = neededNow();
      if (needed === null) return;
      if (left.has(copy) && needed.has(copy)) continue;
      left.delete(copy);
      await expoFs.remove(`${dir}/${name}`);
    }
    const needed = neededNow();
    if (needed === null) return;
    for (const name of left) if (needed.has(name) && useCutoutFiles.getState().files[name] === undefined) setFile(name, { status: "ready", uri: `${dir}/${name}` });
  } catch (e) { console.warn("cutout open failed", e); }
  if (open()) { opened = projectId; kick(); }
}

/**
 * Mount once in the editor: keeps the open project's cut-out copies rendered. It listens to the two stores outside React and tells
 * the manager only when WHICH copies are needed (their names) has changed; any other edit only makes a copy that has not started
 * wait on (0.8 s after the LAST change of the project, so nothing starts in the middle of a drag), and a playhead tick or a percent
 * of progress ends at one comparison. A project without a cut-out clip costs one look at its folder when it opens and nothing
 * after that: no timer, no listener. Sets no React state and never writes the project. Without the tool nothing happens.
 */
export function useCutoutRenders(): void {
  const projectId = useEditorStore((s) => s.project?.id ?? null);
  useEffect(() => {
    resetCutouts();
    if (!projectId || !isCutoutAvailable()) return resetCutouts;
    void openCutouts(projectId);
    let seen: { project: Project | null; missing: readonly string[]; files: Record<string, CutoutFile> } | null = null;
    let told = "";
    const tell = (): void => {
      try {
        const s = useEditorStore.getState();
        const { files } = useCutoutFiles.getState();
        if (seen !== null && seen.project === s.project && seen.missing === s.missingSourceUris && seen.files === files) return;
        const moved = seen === null || seen.project !== s.project;
        seen = { project: s.project, missing: s.missingSourceUris, files };
        if (!s.project || s.project.id !== projectId) return;
        const needed = cutoutsNeeded(s.project, s.missingSourceUris, files);
        const names = namesOf(needed);
        // The same copies, but the project moved (a drag inside a copy's range, any other edit): a copy that waits to start waits on.
        if (names === told) { if (moved) kick(); return; }
        told = names;   // before the manager is told: what it writes comes back here
        syncCutouts(projectId, needed);
      } catch (e) { console.warn("cutout sync failed", e); }   // a store's listener must never break the edit that called it
    };
    const offProject = useEditorStore.subscribe(tell);
    const offFiles = useCutoutFiles.subscribe(tell);
    tell();
    return () => { offProject(); offFiles(); resetCutouts(); };
  }, [projectId]);
}
