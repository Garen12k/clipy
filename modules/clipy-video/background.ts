import { requireOptionalNativeModule, type EventSubscription } from "expo-modules-core";

/**
 * The "background export" build (2026-10-13): what the native engine does about an export when the app is left. Everything here
 * asks whether its function is THERE first — on an older build, and in Expo Go, nothing is called and every answer is the
 * "not there" one — and nothing here throws. Kept apart from index.ts's other wrappers (which re-exports it) so the export reads
 * it straight from the native module.
 */

/** What this iPhone can do for an export in the background. `continued`: iOS has the continued processing task (26+); `gpu`: it also lets such a task draw. */
export interface BackgroundSupport { os: string; continued: boolean; gpu: boolean }
/** What the phone answered when an export asked to be kept alive: the short grace every iOS gives, and the continued task (with why not). */
export interface BackgroundRun { grace: boolean; continued: boolean; reason: string }
/** `cancel`: the person stopped the export in the system's own interface. `expired`: iOS ended the task; the export itself goes on (or waits). */
export type BackgroundExportEvent = { runId: string; type: "cancel" | "expired" };
/** The `code` of an export `error` event that was not a failure of the export itself: the app was in the background during it. */
export const EXPORT_INTERRUPTED = "interrupted";

type BackgroundNative = {
  backgroundExportSupport?: () => BackgroundSupport;
  beginBackgroundExport?: (runId: string, title: string, subtitle: string) => Promise<BackgroundRun>;
  reportBackgroundExport?: (runId: string, progress: number) => void;
  endBackgroundExport?: (runId: string, success: boolean) => void;
  addListener?: (eventName: "onBackgroundExportEvent", listener: (e: BackgroundExportEvent) => void) => EventSubscription;
};
function optional(): BackgroundNative | null {
  try { return requireOptionalNativeModule<BackgroundNative>("ClipyVideo"); } catch { return null; }
}

/** Whether the installed app is the "background export" build or a newer one: its frames are never drawn in the background, and an interrupted export says so. */
export function isBackgroundExportBuild(): boolean { return typeof optional()?.backgroundExportSupport === "function"; }

/** What this iPhone supports, or null on a build from before the function (or when it cannot be asked). */
export function backgroundExportSupport(): BackgroundSupport | null {
  const m = optional();
  if (typeof m?.backgroundExportSupport !== "function") return null;
  try {
    const s = m.backgroundExportSupport();
    return { os: String(s.os), continued: s.continued === true, gpu: s.gpu === true };
  } catch { return null; }
}

/** Asks iOS to keep the app alive for this export. Null on an older build (nothing is called) and when the phone cannot be asked: the export then runs as it always did. */
export async function beginBackgroundExport(runId: string, title: string, subtitle: string): Promise<BackgroundRun | null> {
  const m = optional();
  if (typeof m?.beginBackgroundExport !== "function") return null;
  try { return await m.beginBackgroundExport(runId, title, subtitle); } catch { return null; }
}

/** The export's progress, 0 … 1, for the system's own display. Nothing on an older build. */
export function reportBackgroundExport(runId: string, progress: number): void {
  const m = optional();
  if (typeof m?.reportBackgroundExport !== "function") return;
  try { m.reportBackgroundExport(runId, progress); } catch { /* the display is not the export */ }
}

/** The export is over (done, failed or cancelled): iOS is told, once. Nothing on an older build. */
export function endBackgroundExport(runId: string, success: boolean): void {
  const m = optional();
  if (typeof m?.endBackgroundExport !== "function") return;
  try { m.endBackgroundExport(runId, success); } catch { /* nothing to do about it */ }
}

/** What the system's interface did to the export. Null on an older build (no listener is added). */
export function addBackgroundExportListener(cb: (e: BackgroundExportEvent) => void): EventSubscription | null {
  const m = optional();
  if (typeof m?.beginBackgroundExport !== "function" || typeof m.addListener !== "function") return null;
  try { return m.addListener("onBackgroundExportEvent", cb); } catch { return null; }
}
