import { ApiFailure, type api, type Prepared } from "./api";
import type { VideoInfo } from "./adapters/types";
import type { ChunkReader } from "./fileReader";
import { PLATFORMS, type PlatformId } from "./platforms";
import { UploadError, type uploadGoogleResumable, type uploadRelay } from "./upload";

export type RowPhase = "idle" | "preparing" | "uploading" | "publishing" | "done" | "failed" | "needsReconnect";
export interface RowState { phase: RowPhase; progress: number; url: string | null; message: string | null; resumable: boolean }
export const IDLE_ROW: RowState = { phase: "idle", progress: 0, url: null, message: null, resumable: false };
export interface PostJob { platform: PlatformId; video: VideoInfo; caption: string; options: Record<string, unknown> }
export interface PostDeps {
  api: Pick<typeof api, "prepare" | "uploadChunk" | "finalize" | "status">;
  openReader(uri: string): ChunkReader;
  uploadGoogleResumable: typeof uploadGoogleResumable; uploadRelay: typeof uploadRelay;
  sleep(ms: number): Promise<void>;
}
export const POLL_MS = 3000;
export const POLL_LIMIT = 40; // 2 minutes

/** The server decides the chunk size and protocol; refuse a plan we cannot follow. */
const planIsValid = (p: Prepared) => Number.isInteger(p.chunkSize) && p.chunkSize > 0 && !(p.protocol === "google-resumable" && !p.uploadUrl);

/** Runs one platform's post to the end. Never throws: every outcome is reported through `update`. Returns the prepared session (for Resume) or null. */
export async function runPost(job: PostJob, deps: PostDeps, update: (patch: Partial<RowState>) => void, signal: AbortSignal, resumeFrom: Prepared | null = null): Promise<Prepared | null> {
  let prepared = resumeFrom;
  let reader: ChunkReader | null = null;
  try {
    if (!prepared) {
      update({ ...IDLE_ROW, phase: "preparing" });
      const { video } = job;
      prepared = await deps.api.prepare({ platform: job.platform, fileSize: video.fileSize, durationSec: video.durationSec, mimeType: video.mimeType, caption: job.caption, options: job.options });
    }
    const p = prepared;
    if (!planIsValid(p)) {
      update({ phase: "failed", message: "The server sent an unexpected upload plan.", resumable: false });
      return null;
    }
    update({ phase: "uploading", message: null, resumable: false });
    reader = deps.openReader(job.video.fileUri);
    const args = { reader, mimeType: job.video.mimeType, chunkSize: p.chunkSize, onProgress: (f: number) => update({ progress: f }), signal, resume: !!resumeFrom };
    let clientResult: string | null = null;
    if (p.protocol === "google-resumable") clientResult = await deps.uploadGoogleResumable(p.uploadUrl ?? "", p.uploadHeaders, args);
    else await deps.uploadRelay((offset, total, bytes, sig) => deps.api.uploadChunk(p.sessionId, offset, total, bytes, sig), args);

    update({ phase: "publishing", progress: 1 });
    let result = await deps.api.finalize(p.sessionId, clientResult);
    for (let i = 0; result.status === "processing" && i < POLL_LIMIT; i++) { await deps.sleep(POLL_MS); result = await deps.api.status(p.sessionId); }
    update(result.status === "done"
      ? { phase: "done", url: result.url, message: null }
      : { phase: "done", url: null, message: `Still processing on ${PLATFORMS[job.platform].label} — check the app later.` });
  } catch (e) {
    if (signal.aborted) update({ ...IDLE_ROW });
    else if (e instanceof ApiFailure && e.code === "reconnect") update({ phase: "needsReconnect", message: e.message });
    else if (e instanceof UploadError) update({ phase: "failed", message: e.message, resumable: e.resumable });
    else update({ phase: "failed", message: e instanceof Error && e.message ? e.message : "Something went wrong.", resumable: false });
  } finally { reader?.close(); }
  return prepared;
}
