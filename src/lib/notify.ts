import { requireOptionalNativeModule } from "expo-modules-core";

type Notifications = typeof import("expo-notifications");
let found: Notifications | null | undefined;   // undefined = not asked yet
let handlerSet = false;

/**
 * `expo-notifications`, or null when the installed app has none (a build from before "icons and light"). This file is the ONLY
 * place that loads the package, lazily and only when its native module is there: its files ask for their native modules the moment
 * they are imported, which throws in an app without them. LOCAL notifications only — nothing here asks for a push token, and the
 * app has no push entitlement (plugins/withoutPushEntitlement.js). Never throws; asked once.
 */
function notifications(): Notifications | null {
  if (found !== undefined) return found;
  found = null;
  try {
    if (requireOptionalNativeModule("ExpoNotificationScheduler")) found = require("expo-notifications") as Notifications;
  } catch {
    found = null;
  }
  return found;
}

/** Whether the installed app can show a notification at all (not whether the owner has allowed it). */
export function notifyAvailable(): boolean {
  return notifications() !== null;
}

/**
 * Asks the owner to allow notifications — only when called, and iOS shows its question only the first time. True when they are
 * allowed (already, or just now). Never throws.
 */
export async function askToNotify(): Promise<boolean> {
  const n = notifications();
  if (!n) return false;
  try {
    const now = await n.getPermissionsAsync();
    if (now.granted) return true;
    if (!now.canAskAgain) return false;
    const asked = await n.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
    return asked.granted;
  } catch {
    return false;
  }
}

/**
 * Shows a local notification now ("Your video is ready"). It never asks for permission: without it (or in an app without
 * notifications) nothing is shown and the answer is false. True = handed to iOS. Never throws.
 */
export async function notifyDone(title: string, body: string): Promise<boolean> {
  const n = notifications();
  if (!n) return false;
  try {
    if (!(await n.getPermissionsAsync()).granted) return false;
    if (!handlerSet) {
      // Without a handler iOS shows nothing while the app is in front.
      n.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }) });
      handlerSet = true;
    }
    await n.scheduleNotificationAsync({ content: { title, body }, trigger: null });
    return true;
  } catch {
    return false;
  }
}
