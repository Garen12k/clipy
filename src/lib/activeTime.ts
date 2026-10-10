import { AppState } from "react-native";

/** One step of the count. A deadline is counted in steps this long, each its own short timer. */
export const ACTIVE_STEP_MS = 1000;

/**
 * A deadline that counts only the time the app really ran in front — `setTimeout` for a wait that must not be ended by the person
 * leaving the app. A plain `setTimeout(fn, 120000)` is measured against the clock: an app that was suspended for three minutes
 * comes back with the timer long overdue, and it fires at once although the work it guards had no chance to run. Here the time
 * is counted in steps of `ACTIVE_STEP_MS`, each step a short timer of its own, and a step counts for its PLANNED length only:
 * a suspension, however long, lengthens one step and so costs at most one second; and a step that ends while the app is in the
 * background (alive there, on a build that asks iOS for time) counts for nothing. No clock is read. Returns the function that
 * calls it off (safe to call twice, and after it fired).
 */
export function activeTimeout(fire: () => void, ms: number): () => void {
  let left = ms;
  let over = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const step = (): void => {
    const planned = Math.max(0, Math.min(ACTIVE_STEP_MS, left));
    timer = setTimeout(() => {
      timer = null;
      if (over) return;
      if (AppState.currentState !== "background") left -= planned;
      if (left <= 0) { over = true; fire(); return; }
      step();
    }, planned);
  };
  step();
  return () => {
    over = true;
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
}

/**
 * Runs `then` as soon as the app is in front: at once when it is, else at the next change to `active`. Returns the function
 * that calls it off. (Anything but `background` counts as in front: `inactive` is the app under Control Centre or an alert.)
 */
export function whenActive(then: () => void): () => void {
  if (AppState.currentState !== "background") { then(); return () => {}; }
  let waiting = true;
  const sub = AppState.addEventListener("change", (now) => {
    if (!waiting || now !== "active") return;
    waiting = false;
    sub.remove();
    then();
  });
  return () => { if (waiting) { waiting = false; sub.remove(); } };
}

/** Settles as soon as the app is in front (at once when it is). */
export function untilActive(): Promise<void> {
  return new Promise<void>((resolve) => { whenActive(resolve); });
}
