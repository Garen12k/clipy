import * as ImagePicker from "expo-image-picker";
import { Linking } from "react-native";
import { useToast } from "@/src/ui/Toast";
import type { PickedAsset } from "./storage";

/** Opens the camera roll for multi-select videos. Returns null if cancelled or denied. */
export async function pickVideos(): Promise<PickedAsset[] | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    useToast.getState().show("Clipy needs Photos access to import clips. Open Settings to allow it.");
    if (!perm.canAskAgain) Linking.openSettings().catch(() => {});
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["videos"], allowsMultipleSelection: true, selectionLimit: 20, quality: 1 });
  if (result.canceled) return null;
  return result.assets.map((a) => ({
    uri: a.uri,
    durationSec: (a.duration ?? 0) / 1000,
    width: a.width,
    height: a.height,
    fileName: a.fileName ?? undefined,
  }));
}
