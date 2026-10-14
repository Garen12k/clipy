import { AFTER_PICKER_MS } from "./AspectRatioSheet";

/** Takes a guard and answers with what lets it go — ONCE: a late second call (a sheet that closes long after) cannot let go of what a newer run holds. */
export function hold(ref: { current: boolean }): () => void {
  ref.current = true;
  let held = true;
  return () => { if (held) { held = false; ref.current = false; } };
}

/**
 * Asks for one system sheet (the photo picker, the camera, the source menu). `answered` may be called the moment the sheet itself
 * has answered, before the promise settles (the menu waits for itself to close first): the guard is taken back then.
 */
export type SheetAsk<T> = (answered: () => void) => Promise<T | null>;

/**
 * One run of an action that asks for system sheets under a guard — Home's `starting`, the editor's media lock. The rule (AGENTS.md):
 * NO GUARD EVER WAITS FOR A SYSTEM SHEET'S PROMISE. If iOS declines to present a sheet, its promise never settles, and a guard held
 * for it would leave every action that shares the guard dead until Clipy is closed. So `sheet(ask)` holds the guard only while the
 * sheet comes up — `AFTER_PICKER_MS` after it was asked for, or until it answers, if that is sooner — and lets it go then (ONCE,
 * through `take`'s release). An answer that arrives after that takes the guard back and continues, unless something else holds it
 * by then (`busy()`): such an answer is DROPPED — `sheet` answers null, as a cancel does (nothing imported, nothing made, nothing
 * said), and an error it throws is swallowed. Within the window nothing changes: an answer that comes in time continues at once,
 * with no wait added. `end()` lets the guard go at the end of the run (once).
 */
export function sheetRun(busy: () => boolean, take: () => () => void): { sheet: <T>(ask: SheetAsk<T>) => Promise<T | null>; end: () => void } {
  let release = take();
  let holding = true;
  const end = () => { if (holding) { holding = false; release(); } };
  async function sheet<T>(ask: SheetAsk<T>): Promise<T | null> {
    let dropped = false;
    let up: ReturnType<typeof setTimeout> | null = null;
    const back = () => {
      if (up !== null) { clearTimeout(up); up = null; }
      if (holding || dropped) return;
      if (busy()) { dropped = true; return; }
      release = take();
      holding = true;
    };
    up = setTimeout(() => { up = null; end(); }, AFTER_PICKER_MS);
    let answer: T | null;
    try { answer = await ask(back); }
    catch (e) { back(); if (dropped) return null; throw e; }
    back();
    return dropped ? null : answer;
  }
  return { sheet, end };
}
