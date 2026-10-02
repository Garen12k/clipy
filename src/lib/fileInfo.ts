import { File } from "expo-file-system";

/** Size of a local file in bytes, or 0 when it is missing or can't be read. */
export function fileSize(uri: string): number {
  if (!uri) return 0;
  try {
    const n = new File(uri).size;
    return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0;
  } catch { return 0; }
}
