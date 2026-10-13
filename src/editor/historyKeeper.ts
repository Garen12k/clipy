import { storage } from "@/src/projects";
import type { Project } from "./model/types";
import { useEditorStore } from "./store";

/**
 * The undo history kept with the project — the editor's half (spec: docs/superpowers/specs/2026-10-13-undo-history-design.md).
 * The file is `storage.saveHistory` / `loadHistory`; this decides WHEN: read once, a moment after a project is on screen;
 * written when the editor is left (useLoadProject) and when the app stops being active — never per edit. Nothing here can fail a
 * project save, and nothing here throws.
 */
export const HISTORY_READ_DELAY_MS = 400;

interface Kept { project: Project; past: Project[]; future: Project[] }
/** What the history file was last written from, or restored as — compared by identity. */
let kept: Kept | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
/** Raised when the editor is left or another project opens: an answer from before it is dropped. */
let epoch = 0;
/** The write that is on its way (null: none). */
let tail: Promise<void> | null = null;

/**
 * One write at a time: the two places that write a history — the app stops being active (`keepHistoryNow`) and the editor is left
 * (useLoadProject) — each save the project and then its history, and a second one starting between those two would change
 * project.json under the first one's history. A job runs AT ONCE (in this very call) when nothing is being written, else when
 * everything before it has ended, and its own answer or failure is handed back; a job that fails holds nobody up. Only those two
 * writes belong in a turn — never the cover, which waits for a thumbnail.
 */
export function historyTurn<T>(job: () => Promise<T>): Promise<T> {
  const run = tail === null ? job() : tail.then(job);
  // The first to hear of the job's end, before whoever awaits `run`: a caller that writes again right after finds the turn free.
  const over = (): void => { if (tail === mine) tail = null; };
  const mine: Promise<void> = run.then(over, over);
  tail = mine;
  return run;
}

/** Is there a history to write? A project is open, a stack is not empty, and the three are not the ones the file already holds. */
export function historyStale(s: { project: Project | null; past: Project[]; future: Project[] }): boolean {
  if (!s.project || (s.past.length === 0 && s.future.length === 0)) return false;
  return !(kept !== null && kept.project === s.project && kept.past === s.past && kept.future === s.future);
}

/** The editor is left, or another project opens: the wait is cancelled and nothing is remembered. */
export function forgetHistory(): void {
  epoch += 1;
  kept = null;
  if (timer !== null) { clearTimeout(timer); timer = null; }
}

/**
 * A project has just been put in the store: a moment later (the editor is drawn first) its history is read and, if the store still
 * holds that very object untouched, given back. `stamp` is `loadProject`'s — without one nothing is read.
 */
export function restoreAfterOpen(opened: Project, stamp: string | undefined): void {
  forgetHistory();
  if (typeof stamp !== "string") return;
  const run = epoch;
  timer = setTimeout(() => {
    timer = null;
    void (async () => {
      try {
        const found = await storage.loadHistory(opened, stamp);
        if (!found || run !== epoch) return;
        if (!useEditorStore.getState().restoreHistory(opened, found.past, found.future)) return;
        const s = useEditorStore.getState();
        kept = { project: opened, past: s.past, future: s.future };
      } catch (e) { console.warn("history restore failed", e); }
    })();
  }, HISTORY_READ_DELAY_MS);
}

/**
 * Writes the history now, if there is one to write: the project first (its stamp must be of what is on disk), then the history.
 * For the moment the app stops being active. Never rejects. What there is to write is looked at when its turn comes
 * (`historyTurn`), so a second call made while the first is still writing finds the work done and writes nothing.
 */
export function keepHistoryNow(): Promise<void> {
  return historyTurn(async () => {
    const s = useEditorStore.getState();
    const { project, past, future } = s;
    if (!project || !historyStale(s)) return;
    const run = epoch;
    try {
      await storage.saveProject(project);
      if (useEditorStore.getState().project === project) useEditorStore.getState().markSaved();
      if ((await storage.saveHistory(project, past, future)) && run === epoch) kept = { project, past, future };
    } catch (e) { console.warn("history keep failed", e); }
  });
}
