import { ApiError, PlatformError } from "../errors.ts";
import { accessTokenFor, withPlatformAuth } from "../tokens.ts";
import { adapterCtx, type Deps, type PostSessionRow, type PublishResult } from "../types.ts";

export async function ownSession(deps: Deps, userId: string, sessionId: unknown): Promise<PostSessionRow> {
  const s = typeof sessionId === "string" ? await deps.db.getSession(sessionId) : null;
  if (!s || s.userId !== userId) throw new ApiError(404, "not_found", "That upload no longer exists.");
  return s;
}

export const settled = (s: PostSessionRow): PublishResult | null => (s.status === "done" ? { status: "done", url: s.url } : null);
export const failedError = (s: PostSessionRow) => new ApiError(400, "platform_error", s.error ?? "The post failed.");

/** A real rejection by the platform (4xx). Auth failures were already turned into `reconnect` by withPlatformAuth. */
export const isRejection = (e: unknown): e is PlatformError =>
  e instanceof PlatformError && e.status >= 400 && e.status < 500 && e.status !== 401 && e.status !== 408 && e.status !== 429;

/** Moves to `failed` only if the session is still in `from`; nothing ever overwrites `done`. */
export async function failFrom(deps: Deps, id: string, from: "publishing" | "processing", message: string): Promise<void> {
  await deps.db.claimSession(id, from, "failed", { error: message });
}

/** Moves to `done` only if the session is still in `from`; returns what is stored when the claim is lost. */
export async function finishFrom(deps: Deps, session: PostSessionRow, from: "publishing" | "processing", url: string | null): Promise<PublishResult> {
  if (await deps.db.claimSession(session.id, from, "done", { url })) return { status: "done", url };
  const now = await deps.db.getSession(session.id);
  return now ? (settled(now) ?? { status: "processing" }) : { status: "done", url };
}

/** Status logic shared by finalize (when processing) and status. The session must be `processing`. */
export async function pollProcessing(deps: Deps, userId: string, session: PostSessionRow): Promise<PublishResult> {
  const adapter = deps.adapters[session.platform];
  if (!adapter) throw new ApiError(409, "unavailable", `${session.platform} isn't set up on the server yet.`);
  const { accessToken, account } = await accessTokenFor(deps, userId, session.platform);
  try {
    const r = await withPlatformAuth(deps, account, () => adapter.status(adapterCtx(deps), accessToken, session.ref));
    return r.status === "done" ? await finishFrom(deps, session, "processing", r.url) : r;
  } catch (e) {
    if (isRejection(e)) await failFrom(deps, session.id, "processing", e.message);
    throw e;
  }
}
