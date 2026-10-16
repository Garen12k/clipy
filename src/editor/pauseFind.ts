import { useEffect, useState } from "react";
import { PAUSE_GAPS, PAUSE_QUIET, PAUSES, type PauseChoice, type PauseCut, type PauseOptions, type PauseOutline } from "./model/pauses";
import { sourceAfter, sourceToOutput } from "./model/timeline";
import type { Clip } from "./model/types";
import { heardPauses, listenForPauses, stopPauses, type PauseFailure, type PauseSource } from "./soundPeaks";

export type PauseState = { status: "listening" } | { status: "ready"; outline: PauseOutline } | { status: "failed"; reason: PauseFailure };

/** The chips as `findPauses` options: OUTPUT seconds turned into source seconds by timeline.ts (`sourceAfter`) — never a speed here. */
export function pauseOptions(clip: Clip, choice: PauseChoice): PauseOptions {
  const source = (seconds: number): number => sourceAfter(clip, clip.trimStart, seconds) - clip.trimStart;
  const gap = PAUSE_GAPS.find((g) => g.id === choice.gap) ?? PAUSE_GAPS[1];
  const quiet = PAUSE_QUIET.find((q) => q.id === choice.quiet) ?? PAUSE_QUIET[1];
  return { minGap: source(gap.seconds), minPiece: source(PAUSES.minPiece), pad: PAUSES.pad, quietDb: quiet.db };
}

/** How much shorter the clip plays without `cuts`, in output seconds (timeline.ts's mapping). */
export const pauseSaving = (clip: Clip, cuts: readonly PauseCut[]): number => cuts.reduce((s, [a, b]) => s + sourceToOutput(clip, b) - sourceToOutput(clip, a), 0);

/** Listens to `source` while it is given (the open strip's clip); null without one. Stops on a change and on unmount. */
export function usePauseListening(source: PauseSource | null): PauseState | null {
  const key = source === null ? null : `${source.uri}|${source.from}|${source.to}`;
  const [state, setState] = useState<{ key: string; value: PauseState } | null>(null);
  useEffect(() => {
    if (source === null || key === null) return;
    const known = heardPauses(source);
    if (known) { setState({ key, value: { status: "ready", outline: known } }); return; }
    let alive = true;
    setState({ key, value: { status: "listening" } });
    void listenForPauses(source).then((r) => {
      if (!alive) return;
      setState({ key, value: r.status === "stopped" ? { status: "failed", reason: "failed" } : r });
    });
    return () => { alive = false; stopPauses(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (key === null) return null;
  if (state === null || state.key !== key) {
    const known = source === null ? null : heardPauses(source);
    return known ? { status: "ready", outline: known } : { status: "listening" };
  }
  return state.value;
}
