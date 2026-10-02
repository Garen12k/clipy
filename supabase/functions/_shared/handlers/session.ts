import { ApiError } from "../errors.ts";
import { accessTokenFor, withPlatformAuth } from "../tokens.ts";
import { adapterCtx, type Deps, type PostSessionRow, type PublishResult } from "../types.ts";

export async function ownSession(deps: Deps, userId: string, sessionId: unknown): Promise<PostSessionRow> {
  const s = typeof sessionId === "string" ? await deps.db.getSession(sessionId) : null;
  if (!s || s.userId !== userId) throw new ApiError(404, "not_found", "That upload no longer exists.");
  return s;
}

export const settled = (s: PostSessionRow): PublishResult | null => (s.status === "done" ? { status: "done", url: s.url } : null);

export const failedError = (s: PostSessionRow) => new ApiError(400, "platform_error", s.error ?? "The post failed.");

export async function record(deps: Deps, session: PostSessionRow, run: () => Promise<PublishResult>): Promise<PublishResult> {
  try {
    const r = await run();
    await deps.db.updateSession(session.id, r.status === "done" ? { status: "done", url: r.url } : { status: "processing" });
    return r;
  } catch (e) {
    if (e instanceof ApiError && e.code !== "reconnect") await deps.db.updateSession(session.id, { status: "failed", error: e.message });
    throw e;
  }
}

/** Asks the platform how an already-finalized (processing) session is doing. */
export async function pollSession(deps: Deps, userId: string, session: PostSessionRow): Promise<PublishResult> {
  const adapter = deps.adapters[session.platform];
  if (!adapter) throw new ApiError(409, "unavailable", `${session.platform} isn't set up on the server yet.`);
  const { accessToken, account } = await accessTokenFor(deps, userId, session.platform);
  return record(deps, session, () => withPlatformAuth(deps, account, () => adapter.status(adapterCtx(deps), accessToken, session.ref)));
}
