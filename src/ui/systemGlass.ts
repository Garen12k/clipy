import { requireOptionalNativeModule } from "expo-modules-core";
import type { GlassViewProps } from "expo-glass-effect";
import type { ComponentType } from "react";

type GlassViewType = ComponentType<GlassViewProps>;
type GlassPackage = { GlassView?: GlassViewType; isLiquidGlassAvailable?: () => boolean; isGlassEffectAPIAvailable?: () => boolean };
let found: GlassViewType | null | undefined;   // undefined = not asked yet

/**
 * The system glass view, or null when it cannot be drawn: the installed app has no glass module (a build from before "icons and
 * light"), or the phone's iOS is older than the one that has Liquid Glass (iOS 26), or its glass API is missing. This file is the
 * ONLY place that loads `expo-glass-effect`, lazily and only when its native module is there (on iOS the package looks its native
 * view up the moment it is imported). Both of the package's own checks must say yes. Never throws; asked once.
 */
export function glassView(): GlassViewType | null {
  if (found !== undefined) return found;
  found = null;
  try {
    if (requireOptionalNativeModule("ExpoGlassEffect")) {
      const loaded = require("expo-glass-effect") as GlassPackage;
      if (loaded.GlassView && loaded.isLiquidGlassAvailable?.() === true && loaded.isGlassEffectAPIAvailable?.() === true) found = loaded.GlassView;
    }
  } catch {
    found = null;
  }
  return found;
}

/** Whether the installed app on this phone can draw system glass at all (whether it is USED is `GLASS` in theme.ts). */
export function isGlassAvailable(): boolean {
  return glassView() !== null;
}
