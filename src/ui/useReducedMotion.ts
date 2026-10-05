import { AccessibilityInfo } from "react-native";
import { useReducedMotion as reanimatedReducedMotion } from "react-native-reanimated";
import { create } from "zustand";

/** Synchronous app-start value from Reanimated (not a real hook: it just returns a constant). The Jest mock lacks it. */
function initialReducedMotion(): boolean {
  try { return typeof reanimatedReducedMotion === "function" ? reanimatedReducedMotion() : false; } catch { return false; }
}

/** One value for the whole app: correct from the first render, then kept in step with the iOS setting by ONE listener. */
const useStore = create<{ reduced: boolean }>(() => ({ reduced: initialReducedMotion() }));
const set = (reduced: boolean) => { if (useStore.getState().reduced !== reduced) useStore.setState({ reduced }); };
let listening = false;
function listen(): void {
  if (listening) return;
  listening = true;
  try {
    AccessibilityInfo.isReduceMotionEnabled().then(set).catch(() => {});
    AccessibilityInfo.addEventListener("reduceMotionChanged", set);
  } catch { /* the seed stands */ }
}

/** True when iOS Reduce Motion is on: correct on the first render, and live-updated when the setting changes. */
export function useReducedMotion(): boolean {
  listen();
  return useStore((s) => s.reduced);
}
/** The same value for press handlers and effects: no subscription, so no re-render. */
export function isReducedMotion(): boolean {
  listen();
  return useStore.getState().reduced;
}
/** Tests only. */
export function setReducedMotionForTests(reduced: boolean): void {
  set(reduced);
}
