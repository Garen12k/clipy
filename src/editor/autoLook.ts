import { create } from "zustand";
import { cancelFrameStats, frameStats, isFrameStatsAvailable, isStatsCancelled, isStatsInterrupted, type FrameStatsResult } from "@/modules/clipy-video/frameStats";
import { activeTimeout, untilActive } from "@/src/lib/activeTime";
import { newId } from "@/src/lib/id";
import { AUTO, autoTarget, autoTimes, summarize, type AutoTarget, type AutoValues } from "./model/autoEnhance";

/** The longest one native look may take, counted in front only (`activeTimeout`). */
export const AUTO_DEADLINE_MS = 20000;
/** How many more times a look that Clipy's leaving interrupted is asked again, once it is in front. */
export const AUTO_RETRIES = 2;
/** At most this many looks (and as many applied entries) are remembered; the oldest goes first. */
export const AUTO_MEMORY = 64;

/** What is looked at: a clip's own file over its trim (source seconds). */
export interface LookSource { clipId: string; uri: string; kind: "video" | "photo"; from: number; to: number }
/** One look per clip, file and trim: another trim is another look. */
export const lookKey = (s: LookSource): string => `${s.clipId}|${s.uri}|${s.from}|${s.to}`;
export type LookAnswer = { status: "ready"; target: AutoTarget } | { status: "failed" | "cancelled" | "unavailable" | "busy" };
/** What Auto applied to a clip: the values it had before (`base`) and the strength now. */
export interface Applied { base: AutoValues; strength: number }

/**
 * The session's memory of Auto, in MEMORY ONLY — never in the project, the undo history or on disk: `targets` (what a look found)
 * and `applied` (the base and strength the strip rescales from), both keyed by `lookKey`.
 */
export const useAutoLooks = create<{ targets: Record<string, AutoTarget>; applied: Record<string, Applied> }>(() => ({ targets: {}, applied: {} }));

function capped<T>(map: Record<string, T>, key: string, value: T): Record<string, T> {
  const next = { ...map };
  delete next[key];
  next[key] = value;
  const keys = Object.keys(next);
  for (let i = 0; i < keys.length - AUTO_MEMORY; i++) delete next[keys[i]];
  return next;
}
export function rememberApplied(key: string, applied: Applied): void { useAutoLooks.setState((s) => ({ applied: capped(s.applied, key, applied) })); }
export function setStrength(key: string, strength: number): void {
  useAutoLooks.setState((s) => {
    const a = s.applied[key];
    return a && a.strength !== strength ? { applied: { ...s.applied, [key]: { ...a, strength } } } : s;
  });
}
export function resetAutoLooks(): void { useAutoLooks.setState({ targets: {}, applied: {} }); }

type Look = { halt: () => void };
let active: Look | null = null;
/** Ends the look under way at once (closing the strip, another selection, leaving the editor): the phone is told, a late answer is dropped. */
export function stopLooking(): void { active?.halt(); }

type Outcome = AutoTarget | "interrupted" | "failed" | "stopped";

/** One native call with its deadline. Never rejects. */
async function askOnce(source: LookSource, stopped: Promise<"stopped">, started: (jobId: string) => void): Promise<Outcome> {
  const jobId = newId();
  started(jobId);
  let stopTimer: () => void = () => {};
  const late = new Promise<"late">((resolve) => { stopTimer = activeTimeout(() => resolve("late"), AUTO_DEADLINE_MS); });
  try {
    const asked = frameStats({ jobId, uri: source.uri, kind: source.kind, times: autoTimes(source.kind, source.from, source.to), maxSide: AUTO.maxSide });
    asked.catch(() => {});   // a rejection after Stop or the deadline is nobody's business
    const answer: FrameStatsResult | "stopped" | "late" = await Promise.race([asked, stopped, late]);
    if (answer === "stopped") return "stopped";
    if (answer === "late") {
      cancelFrameStats(jobId);
      console.warn("auto enhance failed", `stats: no answer after ${AUTO_DEADLINE_MS / 1000} s`);
      return "failed";
    }
    const summary = summarize(answer.frames ?? []);
    if (!summary) { console.warn("auto enhance failed", "stats: no frame could be used"); return "failed"; }
    return autoTarget(summary);
  } catch (e) {
    if (isStatsCancelled(e)) return "stopped";
    if (isStatsInterrupted(e)) return "interrupted";
    console.warn("auto enhance failed", e instanceof Error ? e.message : String((e as { message?: unknown })?.message ?? e));
    return "failed";
  } finally {
    stopTimer();
  }
}

/**
 * Looks at one clip: the remembered target at once, else ONE native read (`frameStats`, the only caller) with `AUTO_DEADLINE_MS`.
 * One look at a time (a second one meanwhile is `busy`). A read that Clipy's leaving interrupted is asked again once Clipy is in
 * front, at most `AUTO_RETRIES` more times. Never rejects.
 */
export async function lookAt(source: LookSource): Promise<LookAnswer> {
  if (!isFrameStatsAvailable()) return { status: "unavailable" };
  const key = lookKey(source);
  const known = useAutoLooks.getState().targets[key];
  if (known) return { status: "ready", target: known };
  if (active) return { status: "busy" };
  let halted = false;
  let jobId: string | null = null;
  let release: () => void = () => {};
  const stopped = new Promise<"stopped">((resolve) => { release = () => resolve("stopped"); });
  const mine: Look = { halt: () => { if (halted) return; halted = true; if (jobId !== null) cancelFrameStats(jobId); release(); } };
  active = mine;
  try {
    for (let attempt = 0; ; attempt++) {
      if (halted) return { status: "cancelled" };
      const outcome = await askOnce(source, stopped, (id) => { jobId = id; });
      if (halted || outcome === "stopped") return { status: "cancelled" };
      if (outcome === "interrupted") {
        if (attempt >= AUTO_RETRIES) { console.warn("auto enhance failed", "stats: interrupted every time"); return { status: "failed" }; }
        const back = await Promise.race([untilActive().then(() => "back" as const), stopped]);
        if (back === "stopped" || halted) return { status: "cancelled" };
        continue;
      }
      if (outcome === "failed") return { status: "failed" };
      useAutoLooks.setState((s) => ({ targets: capped(s.targets, key, outcome) }));
      return { status: "ready", target: outcome };
    }
  } finally {
    if (active === mine) active = null;
  }
}
