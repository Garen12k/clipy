import { ApiError } from "../errors.ts";
import { accessTokenFor, withPlatformAuth } from "../tokens.ts";
import { adapterCtx, type Deps, type PostSessionRow } from "../types.ts";

/** Free-plan Edge Functions take roughly 10 MB per request and 256 MB of memory; 4 MB pieces stay well inside both. */
export const MAX_RELAY_BYTES = 4 * 1024 * 1024;

export async function ownSession(deps: Deps, userId: string, sessionId: unknown): Promise<PostSessionRow> {
  const s = typeof sessionId === "string" ? await deps.db.getSession(sessionId) : null;
  if (!s || s.userId !== userId) throw new ApiError(404, "not_found", "That upload no longer exists.");
  return s;
}

/** Relay mode only: forwards one piece of the video to the platform with the user's token. Nothing is stored. */
export async function postUpload(deps: Deps, userId: string, q: { sessionId: unknown; offset: unknown; total: unknown }, chunk: Uint8Array): Promise<{ nextOffset: number }> {
  const session = await ownSession(deps, userId, q.sessionId);
  const offset = Number(q.offset), total = Number(q.total);
  if (chunk.length > MAX_RELAY_BYTES) throw new ApiError(413, "too_large", "Upload piece is too large.");
  const adapter = deps.adapters[session.platform];
  if (!adapter?.relayChunk || chunk.length === 0 || !Number.isInteger(offset) || offset < 0 || !Number.isInteger(total) || total <= 0 || offset + chunk.length > total)
    throw new ApiError(400, "bad_request", "Bad upload piece.");
  const { accessToken, account } = await accessTokenFor(deps, userId, session.platform);
  const r = await withPlatformAuth(deps, account, () => adapter.relayChunk!(adapterCtx(deps), accessToken, session.ref, { offset, total, body: chunk }));
  if (r.ref) await deps.db.updateSession(session.id, { ref: r.ref });
  return { nextOffset: r.nextOffset };
}
