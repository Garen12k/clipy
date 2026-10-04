import { Paths } from "expo-file-system";
import { fileSize } from "@/src/lib/fileInfo";
import type { VideoInfo } from "./adapters/types";

type Param = string | string[] | undefined;
const one = (v: Param) => (Array.isArray(v) ? v[0] : v);

export const MAX_DURATION_SEC = 6 * 60 * 60;
const MIME = /^video\/[a-z0-9.+-]{1,40}$/i;
const TITLE_MAX = 100;

export interface PostTarget { video: VideoInfo; projectId: string | null; title: string | null;
  /** The project's cover frame in whole milliseconds into the video (inside its length), or null. */
  coverMs: number | null }

/** "file:///private/var/a//b/" → "/var/a/b/" (iOS reports the same container both with and without /private). */
const pathOf = (uri: string) => decodeURIComponent(uri.slice("file://".length)).replace(/\/{2,}/g, "/").replace(/^\/private\//, "/");
const withSlash = (p: string) => (p.endsWith("/") ? p : `${p}/`);

/** The projects folder inside Documents (see src/projects/storage.ts). The rest of Documents (e.g. the sign-in database) is never posted. */
const PROJECTS_DIR = "projects/";

/**
 * True only for a file:// URI inside the folders the app posts from: the cache (export output in `exports/`, Photos
 * picks from expo-image-picker, whose sub-folder name depends on a native path detail, so the whole cache is allowed)
 * and the projects folder in Documents.
 */
export function isAppFileUri(uri: string): boolean {
  if (!uri.startsWith("file://")) return false;
  try {
    const path = pathOf(uri);
    if (uri.includes("..") || path.split("/").includes("..")) return false;
    const roots = [withSlash(pathOf(Paths.cache.uri)), withSlash(pathOf(Paths.document.uri)) + PROJECTS_DIR];
    return roots.some((root) => path.startsWith(root) && path.length > root.length);
  } catch { return false; }
}

/**
 * The Post screen's route params as a video to post, or null when they can't describe one (never throws).
 * The route can be opened by a deep link (clipy://post?…), so nothing in the params is trusted: the file must
 * be one of the app's own files (export output or a Photos pick in the cache, or a project file), its size is always read
 * from disk, and every other value is range-checked. projectId is only ever compared with the open project.
 */
export function videoFromParams(params: Record<string, Param>): PostTarget | null {
  const fileUri = one(params.fileUri);
  if (!fileUri || !isAppFileUri(fileUri)) return null;
  const durationSec = Number(one(params.durationSec) ?? NaN);
  if (!Number.isFinite(durationSec) || durationSec <= 0 || durationSec > MAX_DURATION_SEC) return null;
  const mimeType = one(params.mimeType) || "video/mp4";
  if (!MIME.test(mimeType)) return null;
  const size = fileSize(fileUri);
  if (size <= 0) return null;
  const title = one(params.title);
  const c = Number(one(params.coverMs) || NaN);
  const coverMs = Number.isInteger(c) && c >= 0 && c <= durationSec * 1000 ? c : null;
  return {
    video: { fileUri, durationSec, fileSize: size, mimeType },
    projectId: one(params.projectId) || null,
    title: title === undefined ? null : title.slice(0, TITLE_MAX),
    coverMs,
  };
}
