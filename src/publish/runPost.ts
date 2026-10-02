import { ApiFailure, type api, type Prepared } from "./api";
import type { VideoInfo } from "./adapters/types";
import type { ChunkReader } from "./fileReader";
import { PLATFORMS, type PlatformId } from "./platforms";
import { UploadError, type uploadGoogleResumable, type uploadMetaWhole, type uploadRelay, type uploadTikTokChunks } from "./upload";

export type RowPhase = "idle" | "preparing" | "uploading" | "publishing" | "done" | "failed" | "needsReconnect";
export interface RowState { phase: RowPhase; progress: number; url: string | null; message: string | null; resumable: boolean }
export const IDLE_ROW: RowState = { phase: "idle", progress: 0, url: null, message: null, resumable: false };
export interface PostJob { platform: PlatformId; video: VideoInfo; caption: string; options: Record<string, unknown> }
export interface PostDeps {
  api: Pick<typeof api, "prepare" | "uploadChunk" | "finalize" | "status">;
  openReader(uri: string): ChunkReader;
  uploadGoogleResumable: typeof uploadGoogleResumable; uploadRelay: typeof uploadRelay; uploadTikTokChunks: typeof uploadTikTokChunks;
  uploadMetaWhole: typeof uploadMetaWhole;
  /** Resolves after `ms`, or early when `signal` aborts. */
  sleep(ms: number, signal: AbortSignal): Promise<void>;
}
/** Everything needed to carry on a post without starting over. In memory only: `prepared` may hold a platform token. */
export interface ResumeInfo { prepared: Prepared; uploaded: boolean; clientResult: string | null }
export const POLL_MS = 3000;
export const POLL_LIMIT = 40; // 2 minutes
const DEFAULT_WAIT_SECONDS = (POLL_LIMIT * POLL_MS) / 1000;
/** The longest wait any server hint can ask for (30 minutes), so a bad value cannot keep the phone polling for hours. */
export const MAX_WAIT_SECONDS = 1800;
/** The pause between polls the server's hint may ask for: 3 s to 60 s (3 s without a usable hint). */
export const MIN_INTERVAL_SECONDS = 3;
export const MAX_INTERVAL_SECONDS = 60;
const pollMs = (p: Prepared) => {
  const i = p.wait?.intervalSeconds;
  return typeof i === "number" && Number.isFinite(i) ? Math.min(MAX_INTERVAL_SECONDS, Math.max(MIN_INTERVAL_SECONDS, i)) * 1000 : POLL_MS;
};
/** How many polls the server's `wait` hint allows (the 2-minute default without one, or with a hint we cannot use; never over 30 minutes). */
const pollLimit = (p: Prepared) => {
  const s = p.wait?.maxSeconds;
  const seconds = typeof s === "number" && Number.isFinite(s) && s > 0 ? Math.min(s, MAX_WAIT_SECONDS) : DEFAULT_WAIT_SECONDS;
  return Math.ceil(seconds / (pollMs(p) / 1000));
};

/** The server decides the chunk size and protocol; refuse a plan we cannot follow. */
const planIsValid = (p: Prepared) => Number.isInteger(p.chunkSize) && p.chunkSize > 0 && !((p.protocol === "google-resumable" || p.protocol === "tiktok-chunks" || p.protocol === "meta-rupload") && !p.uploadUrl);
/**
 * After the upload finished, every failure is resumable (the stored session decides) except these two: the server says
 * the session itself is gone or finished-and-failed, so only a fresh upload can help. A temporary platform failure
 * (`platform_unavailable`: 408, 429, 5xx) is not final: Retry asks again without uploading.
 */
const FINAL_AFTER_UPLOAD = new Set(["platform_error", "not_found"]);
const messageOf = (e: unknown) => (e instanceof Error && e.message ? e.message : "Something went wrong.");

/** Runs one platform's post to the end. Never throws: every outcome is reported through `update`. Returns what Resume needs, or null. */
export async function runPost(job: PostJob, deps: PostDeps, update: (patch: Partial<RowState>) => void, signal: AbortSignal, resumeFrom: ResumeInfo | null = null): Promise<ResumeInfo | null> {
  let info = resumeFrom;
  let reader: ChunkReader | null = null;
  const label = PLATFORMS[job.platform].label;
  /**
   * Out of polls (or cancelled while polling). Without `resumeOnTimeout` the platform publishes by itself: "done", check later.
   * With it, the post is not published until the server's finalize runs again, so the row stays resumable and keeps the info.
   */
  const stillProcessing = () => info?.prepared.wait?.resumeOnTimeout
    ? update({ phase: "failed", url: null, message: `${label} is still processing the video. Tap Resume in a minute to finish posting.`, resumable: true })
    : update({ phase: "done", url: null, message: `Still processing on ${label} — check the app later.` });
  try {
    if (!info) {
      update({ ...IDLE_ROW, phase: "preparing" });
      const { video } = job;
      const prepared = await deps.api.prepare({ platform: job.platform, fileSize: video.fileSize, durationSec: video.durationSec, mimeType: video.mimeType, caption: job.caption, options: job.options });
      if (signal.aborted) { update({ ...IDLE_ROW }); return null; }
      if (!planIsValid(prepared)) {
        update({ phase: "failed", message: "The server sent an unexpected upload plan.", resumable: false });
        return null;
      }
      info = { prepared, uploaded: false, clientResult: null };
    } else if (!planIsValid(info.prepared)) {
      update({ phase: "failed", message: "The server sent an unexpected upload plan.", resumable: false });
      return null;
    }
    const p = info.prepared;
    if (!info.uploaded) {
      update({ phase: "uploading", message: null, resumable: false });
      const onProgress = (f: number) => update({ progress: f });
      let clientResult: string | null = null;
      // Streamed natively from disk in one request: no chunk reader.
      if (p.protocol === "meta-rupload") await deps.uploadMetaWhole(p.uploadUrl ?? "", p.uploadHeaders, job.video.fileUri, { onProgress, signal });
      else {
        reader = deps.openReader(job.video.fileUri);
        const args = { reader, mimeType: job.video.mimeType, chunkSize: p.chunkSize, onProgress, signal, resume: !!resumeFrom };
        if (p.protocol === "google-resumable") clientResult = await deps.uploadGoogleResumable(p.uploadUrl ?? "", p.uploadHeaders, args);
        else if (p.protocol === "tiktok-chunks") await deps.uploadTikTokChunks(p.uploadUrl ?? "", args);
        else await deps.uploadRelay((offset, total, bytes, sig) => deps.api.uploadChunk(p.sessionId, offset, total, bytes, sig), args);
      }
      info = { prepared: p, uploaded: true, clientResult };
    }
    // The video now exists on the platform: finalize is never cancelled, and cancel while polling ends the row as "still processing"
    // (resumable when the server's wait hint says the post still needs finalizing).
    update({ phase: "publishing", progress: 1, message: null, resumable: false });
    let result = await deps.api.finalize(p.sessionId, info.clientResult);
    const limit = pollLimit(p), every = pollMs(p);
    for (let i = 0; result.status === "processing" && i < limit; i++) {
      await deps.sleep(every, signal);
      if (signal.aborted) { stillProcessing(); return info; }
      result = await deps.api.status(p.sessionId);
    }
    if (result.status === "done") update({ phase: "done", url: result.url, message: null });
    else stillProcessing();
  } catch (e) {
    const uploaded = !!info?.uploaded;
    if (signal.aborted && !uploaded) update({ ...IDLE_ROW });
    else if (e instanceof ApiFailure && e.code === "reconnect") update({ phase: "needsReconnect", message: e.message });
    else if (uploaded && e instanceof ApiFailure && FINAL_AFTER_UPLOAD.has(e.code)) {
      // Nothing left to resume: drop the info so Retry starts over, and say so.
      update({ phase: "failed", message: `${messageOf(e)} Retry will upload the video again.`, resumable: false });
      return null;
    }
    // A finished upload is never uploaded again: any other failure keeps the info for Resume.
    else if (uploaded) update({ phase: "failed", message: messageOf(e), resumable: true });
    else if (e instanceof UploadError) update({ phase: "failed", message: e.message, resumable: e.resumable });
    else update({ phase: "failed", message: messageOf(e), resumable: false });
  } finally { reader?.close(); }
  return info;
}
