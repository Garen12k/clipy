import { storage } from "@/src/projects";
import type { Project } from "./model/types";
import { useEditorStore } from "./store";

/**
 * The undo history kept with the project — the editor's half (spec: docs/superpowers/specs/2026-10-13-undo-history-design.md).
 * The file is the storage's (`saveWithHistory` / `loadHistory`); this decides WHEN: read once, a moment after a project is on
 * screen; written when the editor is left (useLoadProject) and when the app stops being active — never per edit.
 * ORDER IS THE STORAGE'S ALONE: `saveWithHistory` writes the project and then its history as ONE turn of that project's chain
 * of saves — the same chain the autosave, the leave and a rename wait in — so there is no queue here: a write is asked for in
 * the very call, and the chain puts it behind whatever was asked before. Nothing here can fail a project save, and nothing
 * here throws.
 */
export const HISTORY_READ_DELAY_MS = 400;

interface Kept { project: Project; past: Project[]; future: Project[] }
/** What the history file was last written from, or restored as — compared by identity. */
let kept: Kept | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
/** Raised when the editor is left or another project opens: an answer from before it is dropped. */
let epoch = 0;
/** Counts the writes `keepHistoryNow` has asked for: only the newest one asked may say what the file holds. */
let asked = 0;
/** What is being written right now by `keepHistoryNow`, and its end (null: nothing) — "inactive" and then "background" a moment later are ONE write. */
let writing: (Kept & { done: Promise<void> }) | null = null;

const same = (k: Kept | null, s: { project: Project | null; past: Project[]; future: Project[] }): boolean =>
  k !== null && k.project === s.project && k.past === s.past && k.future === s.future;

/** Is there a history to write? A project is open, a stack is not empty, and the three are not the ones the file already holds. */
export function historyStale(s: { project: Project | null; past: Project[]; future: Project[] }): boolean {
  if (!s.project || (s.past.length === 0 && s.future.length === 0)) return false;
  return !same(kept, s);
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
 * Writes the history now, if there is one to write: the project and, in the same turn of its chain, the history that belongs to
 * it (`storage.saveWithHistory`). For the moment the app stops being active. Never rejects. The store is told it is saved when
 * the PROJECT is saved, whatever becomes of the history. A second call for the very same three while the first is still being
 * written is that same write; a call with anything new asks for its own, and the chain runs it after.
 */
export function keepHistoryNow(): Promise<void> {
  const s = useEditorStore.getState();
  const { project, past, future } = s;
  if (!project || !historyStale(s)) return Promise.resolve();
  if (writing !== null && same(writing, s)) return writing.done;
  const run = epoch, turn = ++asked;
  const write = async (): Promise<void> => {
    try {
      const { saved, kept: wrote } = storage.saveWithHistory(project, past, future);
      await saved;
      if (useEditorStore.getState().project === project) useEditorStore.getState().markSaved();
      // The chain lands them in the order asked, so the newest one asked is what the file ends as.
      if ((await wrote) && run === epoch && turn === asked) kept = { project, past, future };
    } catch (e) { console.warn("history keep failed", e); }
  };
  const mine: Kept & { done: Promise<void> } = { project, past, future, done: Promise.resolve() };
  writing = mine;
  mine.done = write().then(() => { if (writing === mine) writing = null; });
  return mine.done;
}
