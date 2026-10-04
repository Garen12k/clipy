import * as VideoThumbnails from "expo-video-thumbnails";

const cache = new Map<string, Promise<string>>();

/** Thumbnail URI for a source time, memoized to the time floored to the half second. */
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

const stills = new Map<string, Promise<string>>();

/** Full-quality frame at the exact millisecond of a source time, memoized per uri and millisecond. */
export function getStill(uri: string, timeSec: number): Promise<string> {
  const ms = Math.max(0, Math.round(timeSec * 1000));
  const key = `${uri}|${ms}`;
  let p = stills.get(key);
  if (!p) {
    p = VideoThumbnails.getThumbnailAsync(uri, { time: ms, quality: 1 }).then((r) => r.uri);
    p.catch(() => stills.delete(key));
    stills.set(key, p);
  }
  return p;
}
