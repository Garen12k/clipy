import { create } from "zustand";
import { clipSnapTargets, snapMove, snapTargets, snapThreshold, snapTime } from "./model/snap";
import { useEditorStore } from "./store";
import { haptic } from "@/src/ui/haptics";

/** The project time of the snap guide line (null = hidden). Transient: not saved, not undoable. */
export const useSnapGuide = create<{ time: number | null }>(() => ({ time: null }));

/** Two times this close are the same place (the ops keep 3 decimals): an edge the op left further from its target has not landed on it. */
const SAME_PLACE = 1e-3;
export const sameTime = (a: number, b: number): boolean => Math.abs(a - b) <= SAME_PLACE;

/**
 * Says whether the bar's own op really puts the edge on the target when given the snapped time. When it does not (the op clamped or
 * refused it) the frame is not a snap: the finger's own time is used, with no haptic and no guide.
 */
export type Lands = (snapped: number, target: number) => boolean;

/** One bar's snapping during a gesture. Its state lives in this one object (gesture callbacks get copies of reassigned variables). */
export interface Snapper {
  /** Reads project, playhead and zoom from the editor store once. */
  begin(excludeId: string | null, mainClip?: boolean): void;
  /** The edges about to be dragged, where they are now: a target one of them already sits on is held, not entered (no haptic). */
  rest(...edges: number[]): void;
  /** An edge: the snapped time (or t). */
  time(t: number, lands?: Lands): number;
  /** A moved bar: the snapped start (or start). */
  move(start: number, duration: number, lands?: Lands): number;
  /** The last call landed on a target. */
  snapped(): boolean;
  /** Clears the guide and the entered-snap memory. Does nothing when `begin` was not called since the last `end`. */
  end(): void;
}

export function createSnapper(): Snapper {
  let targets: number[] = [], threshold = 0, last: number | null = null, active = false;
  const landed = (target: number | null) => {
    if (target !== null && target !== last) haptic("light");            // entering a snap; holding it or leaving it is silent
    if (target !== last) useSnapGuide.setState({ time: target });
    last = target;
  };
  return {
    begin(excludeId, mainClip = false) {
      const s = useEditorStore.getState();
      targets = !s.project ? [] : mainClip ? clipSnapTargets(s.project, s.playhead) : snapTargets(s.project, s.playhead, excludeId);
      threshold = snapThreshold(s.pixelsPerSecond); last = null; active = true;
    },
    rest(...edges) {
      for (const edge of edges) {
        const on = targets.find((x) => sameTime(x, edge));
        if (on === undefined) continue;
        last = on; useSnapGuide.setState({ time: on });
        return;
      }
    },
    time(t, lands) {
      const r = snapTime(t, targets, threshold);
      const ok = r.target !== null && (!lands || lands(r.time, r.target));
      landed(ok ? r.target : null);
      return ok ? r.time : t;
    },
    move(start, duration, lands) {
      const r = snapMove(start, duration, targets, threshold);
      const ok = r.target !== null && (!lands || lands(r.start, r.target));
      landed(ok ? r.target : null);
      return ok ? r.start : start;
    },
    snapped: () => last !== null,
    end() {
      if (!active) return;   // a gesture that never began (a tap) must not clear the guide another bar is showing
      targets = []; last = null; active = false;
      if (useSnapGuide.getState().time !== null) useSnapGuide.setState({ time: null });
    },
  };
}
