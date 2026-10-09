import { useSyncExternalStore } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * iOS's Reduce Transparency, for the kit's `Glass` only. Three answers: on, off, and NOT KNOWN YET (null — iOS answers by a promise),
 * which counts as on: a surface is solid until the phone has said it may be see-through, never the other way round.
 * ONE listener for the whole app, there only while some glass surface is on screen: it is added with the first and removed with the last.
 */
let reduced: boolean | null = null;
const readers = new Set<() => void>();
let listener: { remove: () => void } | null = null;

function set(value: boolean): void {
  if (reduced === value) return;
  reduced = value;
  for (const reader of [...readers]) reader();
}
/** Ask the phone now. Glass asks once when the app loads (so the answer is there before Home is drawn) and again whenever listening starts. */
export function askReduceTransparency(): void {
  try { AccessibilityInfo.isReduceTransparencyEnabled().then(set, () => {}); } catch { /* not known: solid */ }
}
function subscribe(reader: () => void): () => void {
  readers.add(reader);
  if (readers.size === 1) {
    try { listener = AccessibilityInfo.addEventListener("reduceTransparencyChanged", set); } catch { listener = null; }
    askReduceTransparency();        // a change made while nothing listened
  }
  return () => {
    readers.delete(reader);
    if (readers.size === 0) { listener?.remove(); listener = null; }
  };
}
const nothing = () => () => {};
const clear = () => reduced === false;
const never = () => false;

/** True only once the phone has said Reduce Transparency is OFF. With `listen` false it asks nothing, listens to nothing and says false. */
export function useTransparencyAllowed(listen: boolean): boolean {
  return useSyncExternalStore(listen ? subscribe : nothing, listen ? clear : never);
}
/** Tests only: forget the answer. */
export function forgetReduceTransparencyForTests(): void { reduced = null; }
