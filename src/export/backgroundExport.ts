import { AppState } from "react-native";
import { addBackgroundExportListener, backgroundExportSupport, beginBackgroundExport, endBackgroundExport, isBackgroundExportBuild, reportBackgroundExport, type BackgroundSupport } from "@/modules/clipy-video/background";
import { newId } from "@/src/lib/id";

/**
 * What an export does when Clipy is left, as this iPhone allows it — the value of the Accounts screen's "Background export" row. It
 * states what the phone supports and nothing more: `full` = iOS keeps the app alive AND lets such a task draw; `alive` = iOS keeps
 * the app alive but the video waits (iOS does not let a background app use the GPU there); `pauses` = an iOS from before the
 * continued task: the export waits until Clipy is opened again; `old` = the installed app is from before all of it.
 */
export const SUPPORT = { full: "Full", alive: "Stays alive, pauses the video", pauses: "Pauses until you return", old: "Needs the newest Clipy build" } as const;
export function supportLabel(s: BackgroundSupport | null = backgroundExportSupport()): string {
  if (!s) return SUPPORT.old;
  if (!s.continued) return SUPPORT.pauses;
  return s.gpu ? SUPPORT.full : SUPPORT.alive;
}

/** Under the ring while Clipy is out of sight (what the app switcher shows of the screen). */
export const EXPORT_PAUSED = "Paused while Clipy is in the background";
/** Under the ring of an export that was started again by itself. */
export const EXPORT_RESTARTED = "Clipy was in the background, so the export started again.";

/** How the export ended, for the phone and for the log. */
export type RunOutcome = "done" | "error" | "cancelled";
/** One export from the tap to its end, automatic restarts included, as the phone is told about it. */
export interface ExportRun {
  /** The export's progress, 0 … 1, preparations included — what the Export screen's ring shows. */
  report(progress: number): void;
  /** Clipy went to the background / came back. */
  left(): void;
  back(): void;
  /** The export was started again by itself. */
  restarted(): void;
  /** Over. Only the first call counts. */
  end(outcome: RunOutcome): void;
}
const INERT: ExportRun = { report() {}, left() {}, back() {}, restarted() {}, end() {} };
/** The smallest change of the progress that is passed on to the phone. */
const REPORT_STEP = 0.005;
const log = (what: string, facts: object): void => { console.log(`background export: ${what}`, JSON.stringify(facts)); };

/**
 * Asks iOS to keep Clipy alive for the export that begins now — called from the tap on Export, with the app in front, before the
 * preparations — and returns what the export tells the phone from then on. On a build from before "background export" (and in Expo
 * Go) it does NOTHING: no native call, no listener, no log, and the export runs exactly as it always did. If the phone refuses (an
 * older iOS, too many tasks, not permitted) the export runs without it. `onSystemCancel` is the person stopping the export in the
 * system's own interface: it must do what the screen's Cancel does. What the phone supports and what then happened (finished in the
 * background, paused for how long, restarted) is logged, once at the start and once at the end.
 */
export function beginRun(title: string, subtitle: string, onSystemCancel: () => void): ExportRun {
  if (!isBackgroundExportBuild()) return INERT;
  const id = newId();
  const support = backgroundExportSupport();
  let over = false;
  let sent = -1;
  let leftAt: number | null = null;
  let pausedMs = 0;
  let leaves = 0;
  let restarts = 0;
  log("start", { support, title });
  const sub = addBackgroundExportListener((e) => {
    if (over || e.runId !== id) return;
    if (e.type === "cancel") { log("stopped from the system's interface", {}); onSystemCancel(); } else log("the system ended its task; the export goes on", {});
  });
  void beginBackgroundExport(id, title, subtitle).then((answer) => { log("kept alive", answer ?? { asked: false }); });
  return {
    report(progress) {
      if (over || !(progress >= 0)) return;
      const p = Math.min(1, progress);
      if (Math.abs(p - sent) < REPORT_STEP && p < 1) return;
      sent = p;
      reportBackgroundExport(id, p);
    },
    left() { if (!over && leftAt === null) { leftAt = Date.now(); leaves += 1; } },
    back() { if (leftAt !== null) { pausedMs += Date.now() - leftAt; leftAt = null; } },
    restarted() { if (!over) { restarts += 1; sent = -1; } },
    end(outcome) {
      if (over) return;
      over = true;
      sub?.remove();
      endBackgroundExport(id, outcome === "done");
      const away = AppState.currentState === "background";
      log("end", { outcome, finishedInBackground: outcome === "done" && away, leftTheApp: leaves, awaySeconds: Math.round(pausedMs / 1000), restarts, support });
    },
  };
}
