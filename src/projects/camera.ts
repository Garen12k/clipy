import { isRunningInExpoGo } from "expo";
import * as ImagePicker from "expo-image-picker";
import { isPeaksAvailable } from "@/modules/clipy-video";
import type { PickedAsset } from "./storage";

/**
 * Whether the camera may be opened at all. iOS ENDS an app that opens the camera without a camera usage text in its own bundle, and
 * that text is part of the installed app, not of the JavaScript: it is in the build of 2026-10-12 ("icons and light", known by
 * `isPeaksAvailable`) and in Expo Go (which has its own), and in no build before. Ask this before showing anything that takes a
 * photo or a video; say `CAMERA_NEEDS_BUILD` (buildInfo.ts) where it is false.
 */
export function canUseCamera(): boolean {
  try {
    return isRunningInExpoGo() || isPeaksAvailable();
  } catch {
    return false;
  }
}

/** What taking a photo or a video ended as. `denied`: the camera is not allowed (`canAskAgain` false = only Settings can change it). */
export type TakeResult =
  | { status: "taken"; asset: PickedAsset }
  | { status: "cancelled" }
  | { status: "denied"; canAskAgain: boolean }
  | { status: "unavailable" };

/**
 * Opens the system camera for ONE photo or video and answers with it in the shape the photo picker gives (`pickMedia`). Asks for
 * the camera permission first (iOS asks for the microphone itself when a video is recorded). Never opens the camera in an app that
 * has no usage text for it (`canUseCamera`), and never throws: a camera that cannot open is `unavailable`.
 */
export async function takeMedia(): Promise<TakeResult> {
  if (!canUseCamera()) return { status: "unavailable" };
  try {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return { status: "denied", canAskAgain: perm.canAskAgain };
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images", "videos"], quality: 1 });
    const a = result.canceled ? undefined : result.assets[0];
    if (!a) return { status: "cancelled" };
    return {
      status: "taken",
      asset: {
        uri: a.uri,
        kind: a.type === "video" ? "video" : "photo",
        durationSec: a.type === "video" ? (a.duration ?? 0) / 1000 : 0,
        width: a.width,
        height: a.height,
        fileName: a.fileName ?? undefined,
      },
    };
  } catch {
    return { status: "unavailable" };
  }
}
