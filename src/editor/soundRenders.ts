import { useEffect } from "react";
import { addSoundListener, cancelSoundRender, isSoundAvailable, isSoundCancelled, renderSound, SOUND_CANCELLED } from "@/modules/clipy-video";
import { neededSounds, soundChain, soundFileName, type NeededSound } from "@/src/editor/model/sound";
import type { SoundSettings } from "@/src/editor/model/types";
import { newId } from "@/src/lib/id";
import { storage } from "@/src/projects";
import { expoFs } from "@/src/projects/expoFs";
import { useToast } from "@/src/ui/Toast";
import { useSoundFiles, type SoundFile } from "./soundFiles";
import { useEditorStore } from "./store";

/** Said where Voice or Sound is tapped without the engine (Expo Go, or a build from before the sound tools). */
export const SOUND_UNAVAILABLE = "Voice and sound effects need the new native build. Expo Go cannot run them.";
/** Said once when a copy could not be rendered. The setting stays; the track plays its original. */
export const SOUND_FAILED = "Could not prepare that sound. It plays as recorded.";
/** Where a project's rendered copies live. Deleted with the project; swept when it is opened (`sweepSounds`). */
export const soundDir = (projectId: string): string => `${storage.projectDir(projectId)}/sound`;

type Running = { jobId: string; promise: Promise<string>; listeners: Set<(fraction: number) => void>; cancelled: boolean };
/** The renders that have not answered yet, by output path: a second caller for the same copy shares the first one's render. */
const inflight = new Map<string, Running>();
let listening = false;
function listen(): void {
  if (listening) return;
  listening = true;
  addSoundListener((e) => { for (const r of inflight.values()) if (r.jobId === e.jobId) r.listeners.forEach((cb) => cb(e.progress)); });
}
/**
 * Nobody needs this render any more. One that has not reached the native side yet never starts (it answers as a cancelled render
 * does); a running one is told to stop, and a native side that cannot be told (no module) must not break the caller.
 */
function cancel(r: Running): void {
  r.cancelled = true;
  try { cancelSoundRender(r.jobId); } catch (e) { console.warn("sound cancel failed", e); }
}

/**
 * The copy of `sourceUri` changed by `sound`: its uri once it exists — found on disk, or rendered now (one render per copy however
 * many ask). Rejects with SOUND_UNAVAILABLE without the engine, with the native staged message when the render fails, and with the
 * cancel code when it was cancelled (`isSoundCancelled`). Used by the editor (`syncSounds`) and by the export.
 */
export function ensureSound(projectId: string, sourceUri: string, sound: SoundSettings, onProgress?: (fraction: number) => void): Promise<string> {
  const dir = soundDir(projectId);
  const path = `${dir}/${soundFileName(sourceUri, sound)}`;
  const running = inflight.get(path);
  if (running) {
    if (onProgress) running.listeners.add(onProgress);
    return running.promise;
  }
  const entry: Running = { jobId: newId(), promise: Promise.resolve(path), listeners: new Set(onProgress ? [onProgress] : []), cancelled: false };
  const work = async (): Promise<string> => {
    if (await expoFs.exists(path)) return path;
    if (!isSoundAvailable()) throw new Error(SOUND_UNAVAILABLE);
    listen();
    await expoFs.mkdir(dir);
    if (entry.cancelled) throw Object.assign(new Error("Sound cancelled"), { code: SOUND_CANCELLED });
    await renderSound({ ...soundChain(sound), jobId: entry.jobId, sourceUri, outputPath: path });
    return path;
  };
  entry.promise = work().finally(() => { inflight.delete(path); });
  inflight.set(path, entry);
  return entry.promise;
}

const setFile = (name: string, file: SoundFile | null): void => useSoundFiles.setState((s) => {
  const files = { ...s.files };
  if (file) files[name] = file; else delete files[name];
  return { files };
});

/** What the open project needs now (the newest call wins), and whether the one-at-a-time loop is running. */
let wanted: { projectId: string; needed: NeededSound[] } | null = null;
let pumping = false;

async function pump(): Promise<void> {
  if (pumping) return;
  pumping = true;
  try {
    for (;;) {
      const w = wanted;
      const { files, hold } = useSoundFiles.getState();
      if (!w || hold) return;
      const next = w.needed.find((n) => files[n.name] === undefined);
      if (!next) return;
      setFile(next.name, { status: "busy" });
      /** The answer belongs to the project that asked: another project (or none) is open by now → drop it. */
      const stillOpen = () => wanted !== null && wanted.projectId === w.projectId;
      try {
        const uri = await ensureSound(w.projectId, next.sourceUri, next.sound);
        if (stillOpen()) setFile(next.name, { status: "ready", uri });
      } catch (e) {
        if (!stillOpen()) continue;
        if (isSoundCancelled(e)) { setFile(next.name, null); continue; }   // nobody needed it any more; if someone does again, it is rendered again
        const message = e instanceof Error ? e.message : String(e);
        console.warn("sound render failed", message);
        setFile(next.name, { status: "failed", message });
        useToast.getState().show(SOUND_FAILED);
      }
    }
  } finally { pumping = false; }
}

/**
 * The editor says what the open project needs: a running render of a copy nobody needs any more is cancelled, and whatever is
 * needed and not known yet is rendered, one at a time (nothing while a slider is held: `holdSounds`). Never touches the project.
 */
export function syncSounds(projectId: string, needed: NeededSound[]): void {
  wanted = { projectId, needed };
  const dir = soundDir(projectId);
  const keep = new Set(needed.map((n) => `${dir}/${n.name}`));
  for (const [path, r] of inflight) if (!keep.has(path)) cancel(r);
  void pump();
}

/** A Strength / Pitch drag begins (true) or ends (false): no render in between, one on release. */
export function holdSounds(on: boolean): void {
  if (useSoundFiles.getState().hold === on) return;
  useSoundFiles.setState({ hold: on });
  if (!on) void pump();
}

/** The editor is left (or another project opens): every running render is cancelled and nothing is remembered. */
export function resetSounds(): void {
  wanted = null;
  for (const r of inflight.values()) cancel(r);
  const s = useSoundFiles.getState();
  // Nothing to forget (the usual case when the editor opens): no write, so nothing that reads the store renders again.
  if (s.hold || Object.keys(s.files).length > 0) useSoundFiles.setState({ files: {}, hold: false });
}

/**
 * Removes the copies in the project's sound folder that no track needs — asked of the OPEN project at the moment each file is about
 * to go, so a copy that became needed meanwhile stays; a `part-` file is judged by the copy it is part of. Run once when a project
 * is opened (there is no undo history then). Never touches a media file.
 */
export async function sweepSounds(projectId: string): Promise<void> {
  const dir = soundDir(projectId);
  const neededNow = (name: string): boolean => {
    const s = useEditorStore.getState();
    if (!s.project || s.project.id !== projectId) return true;   // not the open project any more: leave everything
    return neededSounds(s.project).some((n) => n.name === name.replace(/^part-/, ""));
  };
  try {
    for (const name of await expoFs.list(dir)) if (!neededNow(name)) await expoFs.remove(`${dir}/${name}`);
  } catch (e) { console.warn("sound sweep failed", e); }
}

/**
 * Mount once in the editor: keeps the open project's copies rendered. It reads only WHICH copies are needed (their names), so an
 * edit that changes no sound setting does nothing here; during a slider drag the names change on every frame but `hold` keeps
 * anything from being rendered. Sets no React state and never writes the project.
 */
export function useSoundRenders(): void {
  const projectId = useEditorStore((s) => s.project?.id ?? null);
  const names = useEditorStore((s) => (s.project ? neededSounds(s.project, s.missingSourceUris).map((n) => n.name).join("|") : ""));
  useEffect(() => {
    resetSounds();
    if (projectId) void sweepSounds(projectId);
    return resetSounds;
  }, [projectId]);
  useEffect(() => {
    const s = useEditorStore.getState();
    if (!projectId || !s.project || !isSoundAvailable()) return;
    syncSounds(projectId, neededSounds(s.project, s.missingSourceUris));
  }, [projectId, names]);
}
