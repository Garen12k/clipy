import { useEffect } from "react";
import { requireOptionalNativeModule } from "expo-modules-core";

type KeepAwake = typeof import("expo-keep-awake");
/** The tag the export holds the screen under: its own, so nothing else's keep-awake is ended by it. */
export const AWAKE_TAG = "clipy-export";
let found: KeepAwake | null | undefined;   // undefined = not asked yet
let held = false;

/**
 * `expo-keep-awake`, or null in an app without its native module. This file is the ONLY place that names the package — loaded
 * lazily, never by a top-level import, so an app without it still starts. Never throws; asked once.
 */
function keepAwake(): KeepAwake | null {
  if (found !== undefined) return found;
  found = null;
  try {
    if (requireOptionalNativeModule("ExpoKeepAwake")) found = require("expo-keep-awake") as KeepAwake;
  } catch {
    found = null;
  }
  return found;
}

/**
 * The screen stays on (true) or may sleep again (false). Auto-Lock in the middle of a long export sends the app to the
 * background exactly as leaving it does, so the screen is held for as long as an export runs — and never longer: every call with
 * the value it already has does nothing, and a failure is swallowed (the export matters, the screen does not).
 */
export function stayAwake(want: boolean): void {
  if (want === held) return;
  held = want;
  const k = keepAwake();
  if (!k) return;
  try {
    (want ? k.activateKeepAwakeAsync(AWAKE_TAG) : k.deactivateKeepAwake(AWAKE_TAG)).then(() => {}, () => {});
  } catch {
    // an app whose module cannot be told: the export goes on with a screen that may sleep, as before
  }
}

/** Holds the screen on while `on` is true, and lets it go when `on` turns false AND when the screen that asked goes away. */
export function useStayAwake(on: boolean): void {
  useEffect(() => {
    stayAwake(on);
    return () => stayAwake(false);
  }, [on]);
}
