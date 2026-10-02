import { ApiError } from "../errors.ts";
import { accessTokenFor, withPlatformAuth } from "../tokens.ts";
import { adapterCtx, availableAdapter, isPlatformId, type Deps, type PlatformId, type PrepareInput, type UploadProtocol } from "../types.ts";

export interface PrepareResponse { sessionId: string; protocol: UploadProtocol; uploadUrl: string | null; uploadHeaders: Record<string, string>; chunkSize: number }
const pos = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

export async function postPrepare(deps: Deps, userId: string, body: unknown): Promise<PrepareResponse> {
  const b = (body ?? {}) as Record<string, unknown>;
  const ok = isPlatformId(b.platform) && pos(b.fileSize) && pos(b.durationSec) && typeof b.mimeType === "string" && b.mimeType.length > 0
    && typeof b.caption === "string" && typeof b.options === "object" && b.options !== null;
  if (!ok) throw new ApiError(400, "bad_request", "The post request is incomplete.");
  const platform = b.platform as PlatformId;
  const adapter = availableAdapter(deps, platform);
  if (!adapter) throw new ApiError(409, "unavailable", `${platform} isn't set up on the server yet.`);
  const input: PrepareInput = { fileSize: b.fileSize as number, durationSec: b.durationSec as number, mimeType: b.mimeType as string, caption: b.caption as string, options: b.options as Record<string, unknown> };
  const { accessToken, account } = await accessTokenFor(deps, userId, platform);
  const p = await withPlatformAuth(deps, account, () => adapter.prepare(adapterCtx(deps), accessToken, input));
  const sessionId = await deps.db.createSession({ userId, platform, ref: p.ref, input, status: "uploading", url: null, error: null });
  return { sessionId, protocol: p.protocol, uploadUrl: p.uploadUrl, uploadHeaders: p.uploadHeaders, chunkSize: p.chunkSize };
}
