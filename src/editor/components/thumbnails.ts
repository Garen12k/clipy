import * as VideoThumbnails from "expo-video-thumbnails";

const cache = new Map<string, Promise<string>>();

/** Thumbnail URI for a source time, memoized to the nearest half second. */
export function getThumb(uri: string, timeSec: number): Promise<string> {
  const bucket = Math.floor(timeSec * 2) / 2;
  const key = `${uri}|${bucket}`;
  let p = cache.get(key);
  if (!p) {
    p = VideoThumbnails.getThumbnailAsync(uri, { time: Math.round(bucket * 1000), quality: 0.4 }).then((r) => r.uri);
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}
