import { ApiError } from "../errors.ts";
import { accessTokenFor, withPlatformAuth } from "../tokens.ts";
import { adapterCtx, availableAdapter, isPlatformId, type Deps, type PlatformId, type PrepareInput, type UploadProtocol, type WaitHint } from "../types.ts";

export interface PrepareResponse { sessionId: string; protocol: UploadProtocol; uploadUrl: string | null; uploadHeaders: Record<string, string>; chunkSize: number; wait?: WaitHint }
const MAX_FILE_BYTES = 10 * 1024 ** 3, MAX_DURATION_SEC = 6 * 3600;
const fileSizeOk = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v > 0 && v <= MAX_FILE_BYTES;
const durationOk = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0 && v <= MAX_DURATION_SEC;
const plainObject = (v: unknown) => typeof v === "object" && v !== null && !Array.isArray(v);

export async function postPrepare(deps: Deps, userId: string, body: unknown): Promise<PrepareResponse> {
  const b = (body ?? {}) as Record<string, unknown>;
  const ok = isPlatformId(b.platform) && fileSizeOk(b.fileSize) && durationOk(b.durationSec) && typeof b.mimeType === "string" && /^video\/[a-z0-9.+-]{1,40}$/i.test(b.mimeType)
    && typeof b.caption === "string" && b.caption.length <= 10_000 && plainObject(b.options);
  if (!ok) throw new ApiError(400, "bad_request", "The post request is incomplete.");
  const platform = b.platform as PlatformId;
  const adapter = availableAdapter(deps, platform);
  if (!adapter) throw new ApiError(409, "unavailable", `${platform} isn't set up on the server yet.`);
  const input: PrepareInput = { fileSize: b.fileSize as number, durationSec: b.durationSec as number, mimeType: b.mimeType as string, caption: b.caption as string, options: b.options as Record<string, unknown> };
  const { accessToken, account } = await accessTokenFor(deps, userId, platform);
  const p = await withPlatformAuth(deps, account, () => adapter.prepare(adapterCtx(deps), accessToken, input));
  const sessionId = await deps.db.createSession({ userId, platform, ref: p.ref, input, status: "uploading", url: null, error: null });
  return { sessionId, protocol: p.protocol, uploadUrl: p.uploadUrl, uploadHeaders: p.uploadHeaders, chunkSize: p.chunkSize, ...(p.wait ? { wait: p.wait } : {}) };
}
