import { timeToX, xToTime } from "@/src/editor/model/timeline";

export interface ScrubDeps { scrollTo(x: number): void; seek(time: number): void; pause(): void }

/**
 * Keeps the timeline strip and the playhead in step.
 *
 * Two directions share one scroll view: the user dragging the strip moves the playhead (scrub), and the playhead moving
 * (playback, a tap on a clip, zoom) moves the strip (follow). iOS reports a programmatic `scrollTo` as a finished scroll
 * too, so the end-of-scroll handlers must never scroll, and must ignore ends that were not started by the user —
 * otherwise each `scrollTo` triggers the next one forever and the strip is yanked back under the user's finger.
 */
export function createScrubController(deps: ScrubDeps) {
  let userScrolling = false;
  // Where the strip is, as far as we know: updated by scroll events and by our own scrollTo.
  let lastX = 0;
  return {
    onBeginDrag() { userScrolling = true; deps.pause(); },
    /** The strip keeps gliding after the finger lifts: still the user's scroll. */
    onMomentumBegin() { userScrolling = true; },
    onScroll(x: number, pps: number) {
      lastX = x;
      if (userScrolling) deps.seek(xToTime(x, pps));
    },
    /** End of a drag or of a glide. Settles the playhead where the strip stopped; never scrolls. */
    onEnd(x: number, pps: number) {
      if (!userScrolling) return;
      userScrolling = false;
      lastX = x;
      deps.seek(xToTime(x, pps));
    },
    /** Move the strip to the playhead, unless the user is scrolling or it is already there. */
    follow(playhead: number, pps: number) {
      if (userScrolling) return;
      const target = timeToX(playhead, pps);
      if (Math.abs(target - lastX) < 0.5) return;
      lastX = target;
      deps.scrollTo(target);
    },
  };
}
