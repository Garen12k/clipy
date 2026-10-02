import { ApiError } from "../errors.ts";
import { accessTokenFor, withPlatformAuth } from "../tokens.ts";
import { adapterCtx, type Deps } from "../types.ts";
import { ownSession } from "./session.ts";

/** Free-plan Edge Functions take roughly 10 MB per request and 256 MB of memory; 4 MB pieces stay well inside both. */
export const MAX_RELAY_BYTES = 4 * 1024 * 1024;

/** A non-negative integer number, or a plain digit string; anything else is NaN. */
function strictInt(v: unknown): number {
  if (typeof v === "number") return Number.isSafeInteger(v) && v >= 0 ? v : NaN;
  if (typeof v === "string" && /^\d{1,15}$/.test(v)) return Number(v);
  return NaN;
}

/** Relay mode only: forwards one piece of the video to the platform with the user's token. Nothing is stored. */
export async function postUpload(deps: Deps, userId: string, q: { sessionId: unknown; offset: unknown; total: unknown }, chunk: Uint8Array): Promise<{ nextOffset: number }> {
  const session = await ownSession(deps, userId, q.sessionId);
  if (chunk.length > MAX_RELAY_BYTES) throw new ApiError(413, "too_large", "Upload piece is too large.");
  if (session.status !== "uploading") throw new ApiError(400, "bad_request", "This upload is already finished.");
  const offset = strictInt(q.offset), total = strictInt(q.total);
  const adapter = deps.adapters[session.platform];
  if (!adapter?.relayChunk || chunk.length === 0 || Number.isNaN(offset) || Number.isNaN(total) || total <= 0 || total !== session.input.fileSize || offset + chunk.length > total)
    throw new ApiError(400, "bad_request", "Bad upload piece.");
  const { accessToken, account } = await accessTokenFor(deps, userId, session.platform);
  const r = await withPlatformAuth(deps, account, () => adapter.relayChunk!(adapterCtx(deps), accessToken, session.ref, { offset, total, body: chunk }));
  if (r.ref) await deps.db.updateSession(session.id, { ref: r.ref });
  return { nextOffset: r.nextOffset };
}
