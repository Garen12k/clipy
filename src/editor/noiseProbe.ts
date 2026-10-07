import "expo-sqlite/localStorage/install";
import { isSoundAvailable, probeNoiseReduction } from "@/modules/clipy-video";

/**
 * Where the noise-reduction test keeps what it knows, in the same synchronous localStorage as `src/auth/welcomeSeen.ts`: nothing
 * (never run), `started` (run, and it has not come back), or the answer it logged. Nothing outside this file reads or writes it.
 * The `v1` is there for a later build whose probe is worth asking again: raise it and the test runs once more.
 */
export const NOISE_PROBE_KEY = "clipy.noiseProbe.v1";
const STARTED = "started";
/** Logged on every later app start when a probe was started and never came back: the app closed under it. */
export const NOISE_PROBE_CRASHED = '{"ok":false,"stage":"crash","detail":"the previous probe did not return"}';

/** The noise-reduction test has had its turn in this app session. */
let probed = false;
/** Tests only: a new app start (what is stored stays). */
export function resetNoiseProbe(): void { probed = false; }
/** The one line per app start in the dev-server log: `[noise-probe] {"ok":…,"stage":"…","detail":"…"}` (after `(stored)` when it is an earlier run's answer). */
const log = (...parts: string[]): void => console.log("[noise-probe]", ...parts);
const probeFailed = (e: unknown) => ({ ok: false, stage: "call", detail: e instanceof Error ? e.message : String(e) });
/** The probe has come back: its answer is stored (so it is never run again) and logged. */
function answered(answer: unknown): void {
  let line: string;
  try { line = JSON.stringify(answer); } catch (e) { line = JSON.stringify(probeFailed(e)); }
  try { localStorage.setItem(NOISE_PROBE_KEY, line); } catch { /* not stored: the next start reports `started` as a crash and does not run it either */ }
  log(line);
}

/**
 * The noise-reduction TEST (spec §9): asks the engine whether Apple's sound isolation unit can render this recording, and writes
 * the answer to the dev-server log. A development session only; nothing on screen, nothing waited for; neither a wrapper that
 * throws at once (a build without the function) nor a rejected call reaches React.
 * It runs ONCE PER INSTALL, not once per app start: the unit might take the app down, and that must not repeat. So `started` is
 * stored BEFORE the native call and the answer after it. On a later start a stored answer is logged again as `(stored)`, a
 * `started` with no answer is logged as a crash, and in neither case is the probe run. Storage that cannot be read, or does not keep
 * the `started` mark, means the probe is not run at all.
 */
export function runNoiseProbe(uri: string): void {
  if (probed || !__DEV__ || !isSoundAvailable()) return;
  probed = true;
  let before: string | null;
  try {
    before = localStorage.getItem(NOISE_PROBE_KEY);
    if (before === null) {
      localStorage.setItem(NOISE_PROBE_KEY, STARTED);
      if (localStorage.getItem(NOISE_PROBE_KEY) !== STARTED) return;
    }
  } catch { return; }
  if (before === STARTED) { log(NOISE_PROBE_CRASHED); return; }
  if (before !== null) { log("(stored)", before); return; }
  try {
    probeNoiseReduction(uri).then(answered, (e: unknown) => answered(probeFailed(e)));
  } catch (e) {
    answered(probeFailed(e));
  }
}
