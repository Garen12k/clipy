import * as VideoThumbnails from "expo-video-thumbnails";
import { nowIso } from "@/src/lib/clock";
import { newId } from "@/src/lib/id";
import { expoFs } from "./expoFs";
import { makeStorage } from "./storage";

export const storage = makeStorage(expoFs, {
  thumbnail: async (uri, timeMs) => (await VideoThumbnails.getThumbnailAsync(uri, { time: timeMs, quality: 0.6 })).uri,
  newId,
  nowIso,
});
// Once per launch: what a save or an open that was killed left behind (storage.sweepProjectFiles never throws).
void storage.sweepProjectFiles();
export type { PickedAsset, ProjectSummary } from "./storage";
