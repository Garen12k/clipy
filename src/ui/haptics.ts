import * as Haptics from "expo-haptics";

export type HapticKind = "light" | "medium" | "success";
/** Fire-and-forget vibration. Silent when the module is missing or the device refuses. */
export function haptic(kind: HapticKind): void {
  try {
    const p = kind === "success" ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      : Haptics.impactAsync(kind === "medium" ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
    p?.catch?.(() => {});
  } catch { /* optional */ }
}