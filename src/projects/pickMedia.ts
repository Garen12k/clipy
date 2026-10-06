import * as ImagePicker from "expo-image-picker";
import { Linking } from "react-native";
import { useToast } from "@/src/ui/Toast";
import type { PickedAsset } from "./storage";

/** Opens the camera roll for photos and videos. Returns null if cancelled or denied. `limit`: at most that many, returned in the order they were tapped (a collage's cells). */
export async function pickMedia(opts: { multiple?: boolean; limit?: number } = {}): Promise<PickedAsset[] | null> {
  const multiple = opts.multiple ?? true;
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    useToast.getState().show("Clipy needs Photos access to import photos and videos. Open Settings to allow it.");
    if (!perm.canAskAgain) Linking.openSettings().catch(() => {});
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images", "videos"], quality: 1,
    ...(multiple
      ? { allowsMultipleSelection: true, selectionLimit: opts.limit ?? 20, ...(opts.limit ? { orderedSelection: true } : null) }
      : { allowsMultipleSelection: false }),
  });
  if (result.canceled) return null;
  return result.assets.map((a) => ({
    uri: a.uri,
    kind: a.type === "video" ? "video" : "photo",
    durationSec: a.type === "video" ? (a.duration ?? 0) / 1000 : 0,
    width: a.width,
    height: a.height,
    fileName: a.fileName ?? undefined,
  }));
}
