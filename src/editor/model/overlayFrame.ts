import { hasOverlayMotion, overlayBaseAt, resolveOverlayMotion } from "./motion";
import { hasReveal, revealCut } from "./textReveal";
import type { Overlay } from "./types";

/** An overlay is drawn from its start up to (not at) its end. */
export const isShownAt = (o: Overlay, time: number): boolean => time >= o.start && time < o.end;

/** The overlays drawn at `time`, in the project's order, as one comparable string (their ids as JSON). */
export function shownKey(overlays: readonly Overlay[], time: number): string {
  return JSON.stringify(overlays.filter((o) => isShownAt(o, time)).map((o) => o.id));
}
/** The ids `shownKey` encoded. */
export const shownIds = (key: string): string[] => JSON.parse(key) as string[];

/** A caption that highlights its spoken word (the preview's `wordSpans`). */
export const highlightsWords = (o: Overlay): boolean => o.kind === "caption" && o.words.length > 0 && o.highlightColor !== null && o.highlightColor !== "";

/**
 * Everything about an overlay at project time `time` that is DRAWN and depends on time, as one small comparable string: two times with the
 * same key draw the same overlay pixel for pixel (`overlayFrames.proof.test.tsx`), so the preview draws an overlay again only when its key
 * (or its own document, its selection or the frame's size) changes. Exact, never rounded — numbers are written in JavaScript's shortest
 * round-trip form, so two different values never share a key:
 *   - shown or not (`isShownAt`);
 *   - with any animation or keyframe: the resolved placement and opacity (`resolveOverlayMotion`) and, with keyframes, the base placement
 *     the selection frame sits at (`overlayBaseAt`) — inside an In / Out window or under a Loop this changes on every tick, outside it does not;
 *   - a text's reveal step (`revealCut`);
 *   - a highlighting caption's spoken words (the indices the preview colours).
 * A still overlay's key is "" for its whole life: it costs no render while playing.
 */
export function overlayFrameKey(o: Overlay, time: number): string {
  if (!isShownAt(o, time)) return "hidden";
  let key = "";
  if (hasOverlayMotion(o)) {
    const m = resolveOverlayMotion(o, time);
    key = `m${m.x},${m.y},${m.scale},${m.rotation},${m.opacity}`;
    if (o.keyframes.length > 0) {
      const b = overlayBaseAt(o, time);
      key += `b${b.x},${b.y},${b.scale},${b.rotation}`;
    }
  }
  if (hasReveal(o)) key += `r${revealCut(o, time)}`;
  if (o.kind !== "sticker" && highlightsWords(o)) {
    const t = time - o.start;
    key += "w";
    o.words.forEach((w, i) => { if (t >= w.start && t < w.end) key += `${i},`; });
  }
  return key;
}
