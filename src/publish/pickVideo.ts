import * as ImagePicker from "expo-image-picker";
import { Linking } from "react-native";
import { fileSize } from "@/src/lib/fileInfo";
import { useToast } from "@/src/ui/Toast";
import type { VideoInfo } from "./adapters/types";

/**
 * Picks one video from Photos to post as it is: no editing, no re-encode (Passthrough + Current representation),
 * so the file uploaded is the original. Returns null when cancelled, denied, or the file can't be read.
 */
export async function pickVideoForPost(): Promise<VideoInfo | null> {
  // The v57 docs: request Photos access up front when picking videos with allowsEditing false + Passthrough,
  // so the permission prompt doesn't appear after the user has already chosen.
  let result: ImagePicker.ImagePickerResult;
  try {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      useToast.getState().show("Clipy needs Photos access to post a video. Open Settings to allow it.");
      if (!perm.canAskAgain) Linking.openSettings().catch(() => {});
      return null;
    }
    result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"], allowsEditing: false, allowsMultipleSelection: false,
      videoExportPreset: ImagePicker.VideoExportPreset.Passthrough,
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
      shouldDownloadFromNetwork: true, // Passthrough + iCloud-only videos need this to arrive at all
    });
  } catch (e) {
    useToast.getState().show(e instanceof Error && e.message ? e.message : "Couldn't open Photos.");
    return null;
  }
  const asset = result.canceled ? null : result.assets?.[0];
  if (!asset) return null;
  const durationSec = (asset.duration ?? NaN) / 1000; // the picker reports milliseconds
  const onDisk = fileSize(asset.uri);
  // Stay on home with a toast rather than opening a Post screen that can only say "can't be posted".
  if (onDisk <= 0 || !Number.isFinite(durationSec) || durationSec <= 0) { useToast.getState().show("Couldn't read that video."); return null; }
  return {
    fileUri: asset.uri,
    durationSec,
    fileSize: asset.fileSize && asset.fileSize > 0 ? asset.fileSize : onDisk,
    mimeType: asset.mimeType ?? "video/mp4",
  };
}
