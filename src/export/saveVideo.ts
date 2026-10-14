import { requireOptionalNativeModule } from "expo-modules-core";
import { requestPermissionsAsync, saveToLibraryAsync } from "expo-media-library/legacy";

export type SaveResult = { saved: false } | { saved: true; localIdentifier: string | null };

/**
 * Save to Photos — the one path for the Export screen's Save to Photos AND Open Instagram (which needs to know WHICH asset was made).
 * Permission as ever: add-only access (`requestPermissionsAsync(true)`, the legacy API — the root API's legacy names throw in SDK 57).
 * The save is the class API's `Asset.create`, which makes the asset under add-only access and answers its id, `ph://<localIdentifier>`
 * (the legacy `createAssetAsync` reads the asset back after making it, which add-only access cannot). It is loaded lazily behind its
 * native module; an installed app without it saves with the legacy `saveToLibraryAsync` as before and knows no identifier. A failed
 * save throws and is never tried a second way (that could leave two copies in Photos).
 */
export async function saveVideoToPhotos(uri: string): Promise<SaveResult> {
  const perm = await requestPermissionsAsync(true);
  if (!perm.granted) return { saved: false };
  const create = assetCreate();
  if (!create) { await saveToLibraryAsync(uri); return { saved: true, localIdentifier: null }; }
  const asset = await create(uri);
  const id = typeof asset?.id === "string" ? asset.id : "";
  const local = id.startsWith("ph://") ? id.slice("ph://".length) : id;
  return { saved: true, localIdentifier: local || null };
}

function assetCreate(): ((uri: string) => Promise<{ id?: unknown }>) | null {
  try {
    if (!requireOptionalNativeModule("ExpoMediaLibraryNext")) return null;
    const lib = require("expo-media-library") as typeof import("expo-media-library");
    return typeof lib.Asset?.create === "function" ? (uri) => lib.Asset.create(uri) : null;
  } catch {
    return null;
  }
}
