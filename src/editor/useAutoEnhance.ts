import { useCallback, useEffect, useRef, useState } from "react";
import { isFrameStatsAvailable } from "@/modules/clipy-video/frameStats";
import { AUTO_TOOLS } from "@/src/lib/buildInfo";
import { haptic } from "@/src/ui/haptics";
import { useToast, type MessageOptions } from "@/src/ui/Toast";
import { lookAt, lookKey, rememberApplied, rememberTarget, stopLooking, useAutoLooks, type Applied, type LookSource } from "./autoLook";
import { autoStrengthOf, autoValues, targetOn, valuesOf, type AutoTarget, type AutoValues } from "./model/autoEnhance";
import { setClipAdjust } from "./model/ops";
import { findItem } from "./model/timeline";
import type { Clip } from "./model/types";
import { useEditorStore } from "./store";

const couldNot = (n: number): string => (n === 1 ? "1 clip could not be read." : `${n} clips could not be read.`);
/** Every word of Auto (spec §5, §7). */
export const AUTO_WORDS = {
  done: "Auto enhance applied",
  good: "This clip already looks good.",
  /** Apply to All changed nothing (every clip already had its values): no step, no Undo. */
  nothing: (skipped: number): string => `Nothing to change${skipped === 0 ? "" : `. ${couldNot(skipped)}`}`,
  allFailed: "Could not look at these clips.",
  failed: "Could not look at this clip.",
  missing: "The file of this clip is missing.",
  looking: "Looking at this clip…",
  lookingAll: (at: number, of: number): string => `Looking at ${at} of ${of}…`,
  hint: "Auto sets the sliders from this clip's picture.",
  strength: "Auto · strength",
  /** `n`: the clips that were looked at and given their values (one already at them counts too). */
  allDone: (n: number, skipped: number): string =>
    `${n === 1 ? "Auto enhance applied to 1 clip" : `Auto enhance applied to ${n} clips`}${skipped === 0 ? "" : `. ${couldNot(skipped)}`}`,
} as const;

export type AutoBusy = null | { all: false } | { all: true; at: number; of: number };
export const sourceOf = (c: Clip): LookSource => ({ clipId: c.id, uri: c.sourceUri, kind: c.kind, from: c.trimStart, to: c.trimEnd });
/**
 * Apply to All's looks: ONE per file (and kind), in the order the clips first use it — the pieces Remove pauses or Remove filler
 * words cut from one clip share one look over the whole stretch they cover (from the first piece's start to the last one's end). A
 * file used once is looked at exactly as Auto on that clip alone (`sourceOf`), so a look remembered for it is used again.
 */
export function filesOf(clips: readonly Clip[]): { source: LookSource; clips: Clip[] }[] {
  const out: { source: LookSource; clips: Clip[] }[] = [];
  for (const c of clips) {
    const g = out.find((o) => o.source.uri === c.sourceUri && o.source.kind === c.kind);
    if (!g) { out.push({ source: sourceOf(c), clips: [c] }); continue; }
    g.clips.push(c);
    const first = g.clips[0];
    g.source = { clipId: first.id, uri: c.sourceUri, kind: c.kind, from: Math.min(g.source.from, c.trimStart), to: Math.max(g.source.to, c.trimEnd) };
  }
  return out;
}
/**
 * The values Auto blends FROM: the remembered base while Auto's own values are on the clip (a second tap brings 100 % back), else
 * today's — always today's for a blank picture, which Auto leaves as it is.
 */
export function baseFor(c: Clip, target: AutoTarget, applied: Applied | undefined): AutoValues {
  const now = valuesOf(c.adjust);
  if (target.blank) return now;
  return applied && autoStrengthOf(now, target, applied.base, applied.strength) !== null ? applied.base : now;
}
const say = (message: string, options?: MessageOptions) => useToast.getState().show(message, options);

/**
 * The Adjust strip's Auto. `run(clipId)`: the preview paused, ONE look (`lookAt`), then ONE `apply` that sets the five sliders,
 * said with Undo. `runAll()`: every MAIN clip, one look per file (`filesOf`) at a time, then ONE `apply` for all. Only from a tap; stopped at
 * once (`stop`, closing the strip, another `clipId`, leaving) — a late answer is dropped, and so is one for a clip that changed.
 */
export function useAutoEnhance(clipId: string | null, visible: boolean): { busy: AutoBusy; run: (id: string) => Promise<void>; runAll: () => Promise<void>; stop: () => void } {
  const [busy, setBusy] = useState<AutoBusy>(null);
  const current = useRef<object | null>(null);
  const mounted = useRef(true);
  const stop = useCallback(() => {
    if (current.current === null) return;
    current.current = null;
    stopLooking();
    if (mounted.current) setBusy(null);
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; current.current = null; stopLooking(); };
  }, []);
  useEffect(() => () => stop(), [clipId, visible, stop]);

  const run = useCallback(async (id: string): Promise<void> => {
    if (current.current !== null) return;
    if (!isFrameStatsAvailable()) { say(AUTO_TOOLS); return; }
    const st = useEditorStore.getState();
    const p = st.project;
    const c = p ? findItem(p, id)?.clip : undefined;
    if (!p || !c) return;
    if (st.missingSourceUris.includes(c.sourceUri)) { say(AUTO_WORDS.missing, { kind: "problem" }); return; }
    st.setPlaying(false);
    const mine = {};
    current.current = mine;
    setBusy({ all: false });
    try {
      const source = sourceOf(c);
      const answer = await lookAt(source);
      if (current.current !== mine || !mounted.current) return;
      if (answer.status === "cancelled" || answer.status === "busy") return;
      if (answer.status === "unavailable") { say(AUTO_TOOLS); return; }
      if (answer.status !== "ready") { say(AUTO_WORDS.failed, { kind: "problem" }); return; }   // failed
      const now = useEditorStore.getState().project;
      const here = now && now.id === p.id ? findItem(now, id)?.clip : undefined;
      const key = lookKey(source);
      if (!now || !here || lookKey(sourceOf(here)) !== key) return;   // the clip changed meanwhile: dropped
      const base = baseFor(here, answer.target, useAutoLooks.getState().applied[key]);
      rememberApplied(key, { base, strength: 1 });
      const next = setClipAdjust(now, id, autoValues(targetOn(answer.target, base), base, 1));
      if (next === now) return;   // already there (or nothing to change: the line says "already looks good")
      haptic("light");
      useEditorStore.getState().apply(() => next);
      say(AUTO_WORDS.done, { kind: "done", undo: true });   // one step, just applied
    } finally {
      if (current.current === mine) { current.current = null; if (mounted.current) setBusy(null); }
    }
  }, []);

  const runAll = useCallback(async (): Promise<void> => {
    if (current.current !== null) return;
    if (!isFrameStatsAvailable()) { say(AUTO_TOOLS); return; }
    const st = useEditorStore.getState();
    const p = st.project;
    if (!p || p.clips.length === 0) return;
    st.setPlaying(false);
    const mine = {};
    current.current = mine;
    const found: { id: string; key: string; target: AutoTarget }[] = [];
    let skipped = 0;
    const groups = filesOf(p.clips);
    try {
      for (let i = 0; i < groups.length; i++) {
        if (current.current !== mine || !mounted.current) return;
        setBusy({ all: true, at: i + 1, of: groups.length });
        const g = groups[i];
        if (useEditorStore.getState().missingSourceUris.includes(g.source.uri)) { skipped += g.clips.length; continue; }
        const answer = await lookAt(g.source);
        if (current.current !== mine || !mounted.current) return;
        if (answer.status === "cancelled" || answer.status === "busy") return;
        if (answer.status === "unavailable") { say(AUTO_TOOLS); return; }
        if (answer.status !== "ready") { skipped += g.clips.length; continue; }   // failed
        for (const c of g.clips) found.push({ id: c.id, key: lookKey(sourceOf(c)), target: answer.target });
      }
      const now = useEditorStore.getState().project;
      if (!now || now.id !== p.id) return;
      let next = now;
      let done = 0;
      for (const f of found) {
        const here = now.clips.find((c) => c.id === f.id);
        if (!here || lookKey(sourceOf(here)) !== f.key) { skipped++; continue; }   // changed meanwhile: not touched
        const base = baseFor(here, f.target, useAutoLooks.getState().applied[f.key]);
        rememberTarget(f.key, f.target);
        rememberApplied(f.key, { base, strength: 1 });
        next = setClipAdjust(next, f.id, autoValues(targetOn(f.target, base), base, 1));
        done++;
      }
      // None given its values: blamed on the reading only when none could be read — clips that changed meanwhile say nothing.
      if (done === 0) { if (found.length === 0) say(AUTO_WORDS.allFailed, { kind: "problem" }); return; }
      if (next === now) { say(AUTO_WORDS.nothing(skipped)); return; }
      haptic("light");
      useEditorStore.getState().apply(() => next);
      say(AUTO_WORDS.allDone(done, skipped), { kind: "done", undo: true });   // one step for all, just applied
    } finally {
      if (current.current === mine) { current.current = null; if (mounted.current) setBusy(null); }
    }
  }, []);

  return { busy, run, runAll, stop };
}
