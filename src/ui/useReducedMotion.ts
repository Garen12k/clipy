import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";
import { useReducedMotion as reanimatedReducedMotion } from "react-native-reanimated";

/** Synchronous app-start value from Reanimated (not a real hook: it just returns a constant). The Jest mock lacks it. */
function initialReducedMotion(): boolean {
  try { return typeof reanimatedReducedMotion === "function" ? reanimatedReducedMotion() : false; } catch { return false; }
}

/** True when iOS Reduce Motion is on: correct on the first render, and live-updated when the setting changes. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(initialReducedMotion);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => { if (alive) setReduced(v); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => { alive = false; sub.remove(); };
  }, []);
  return reduced;
}
