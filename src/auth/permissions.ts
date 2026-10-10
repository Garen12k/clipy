import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from "expo-audio";
import * as ImagePicker from "expo-image-picker";
import { Linking } from "react-native";
import { askToNotify, notifyAvailable, notifyState } from "@/src/lib/notify";
import { canUseCamera } from "@/src/projects/camera";

/** The four things the wizard's third page offers, in the order they are listed. */
export const PERMISSION_IDS = ["photos", "microphone", "camera", "notifications"] as const;
export type PermissionId = (typeof PERMISSION_IDS)[number];

/**
 * What the PHONE says about one of them — read, never guessed or remembered:
 * `notAsked` iOS has not asked yet (asking shows Apple's own alert); `granted`; `limited` (Photos: only the chosen ones);
 * `denied` refused once, or only Settings can change it (iOS does not tell a refusal from a parental restriction: both read as this);
 * `unavailable` the installed app cannot ask at all (an older build, a module that is missing, a call that fails).
 */
export type PermissionState = "notAsked" | "granted" | "limited" | "denied" | "unavailable";

type Answer = { granted: boolean; status: string; canAskAgain: boolean; accessPrivileges?: "all" | "limited" | "none" };
function stateOf(a: Answer): PermissionState {
  if (a.granted) return a.accessPrivileges === "limited" ? "limited" : "granted";
  return a.status === "undetermined" && a.canAskAgain ? "notAsked" : "denied";
}

/** The state of one permission now. Shows nothing, asks nothing, never throws. */
export async function readPermission(id: PermissionId): Promise<PermissionState> {
  try {
    switch (id) {
      case "photos": return stateOf(await ImagePicker.getMediaLibraryPermissionsAsync());
      case "microphone": return stateOf(await getRecordingPermissionsAsync());
      // iOS ENDS an app that touches the camera without a usage text in its bundle: an app that has none is never asked anything.
      case "camera": return canUseCamera() ? stateOf(await ImagePicker.getCameraPermissionsAsync()) : "unavailable";
      case "notifications": return notifyAvailable() ? await notifyState() : "unavailable";
    }
  } catch {
    return "unavailable";
  }
}

/**
 * Asks for ONE permission — the same call the feature itself makes the first time it is used (Photos: New project's; the microphone:
 * the voice-over recorder's; the camera: `takeMedia`'s; notifications: `askToNotify`) — so iOS shows its own alert, and answers with
 * the state read afterwards. Only ever called for a permission that is `notAsked`. Never throws.
 */
export async function askPermission(id: PermissionId): Promise<PermissionState> {
  try {
    switch (id) {
      case "photos": return stateOf(await ImagePicker.requestMediaLibraryPermissionsAsync());
      case "microphone": return stateOf(await requestRecordingPermissionsAsync());
      case "camera": return canUseCamera() ? stateOf(await ImagePicker.requestCameraPermissionsAsync()) : "unavailable";
      case "notifications": await askToNotify(); return await readPermission("notifications");
    }
  } catch {
    return readPermission(id);
  }
}

/** The app's page in Settings: the only way to change a permission iOS will not ask about again. */
export function openSettings(): void {
  Linking.openSettings().catch(() => {});
}

/**
 * Limited Photos: the system's own "select more photos" picker (`presentPermissionsPicker` of expo-media-library, loaded only here
 * and only now — an installed app without it, or a picker that fails, opens Settings instead). Resolves when the call returns.
 */
export async function managePhotos(): Promise<void> {
  try {
    const lib = require("expo-media-library") as typeof import("expo-media-library");
    await lib.presentPermissionsPicker();
  } catch {
    openSettings();
  }
}
