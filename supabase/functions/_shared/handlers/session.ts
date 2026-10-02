import { ApiError, isRejectionStatus, PlatformError } from "../errors.ts";
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
export const isRejection = (e: unknown): e is PlatformError => e instanceof PlatformError && isRejectionStatus(e.status);

/**
 * A state write made while handling an error: if the write itself fails, the original error is still the one the caller
 * rethrows. Only the write failure's message is logged (never a token, never the session's contents).
 */
export async function quietly(write: () => Promise<unknown>): Promise<void> {
  try { await write(); }
  catch (w) { console.error(`session state write after an error failed: ${w instanceof Error ? w.message : String(w)}`); }
}

/** Moves to `failed` only if the session is still in `from`; nothing ever overwrites `done`. */
export async function failFrom(deps: Deps, id: string, from: "publishing", message: string): Promise<void> {
  await deps.db.claimSession(id, from, "failed", { error: message });
}

/** Moves to `done` only if the session is still in `from`; returns what is stored when the claim is lost. */
export async function finishFrom(deps: Deps, session: PostSessionRow, from: "publishing", url: string | null): Promise<PublishResult> {
  if (await deps.db.claimSession(session.id, from, "done", { url })) return { status: "done", url };
  const now = await deps.db.getSession(session.id);
  return now ? (settled(now) ?? { status: "processing" }) : { status: "done", url };
}

/** The answer for a session someone else just moved on: never calls the platform. */
async function answerFromStored(deps: Deps, id: string): Promise<PublishResult> {
  const now = await deps.db.getSession(id);
  if (!now) throw new ApiError(404, "not_found", "That upload no longer exists.");
  const done = settled(now);
  if (done) return done;
  if (now.status === "failed") throw failedError(now);
  if (now.status === "uploading") throw new ApiError(400, "bad_request", "Finish the upload first.");
  return { status: "processing" }; // publishing or processing: another call is (or was just) asking the platform
}

/**
 * Status logic shared by finalize (when processing) and status. The session must be `processing`.
 * Only the caller that wins the processing -> publishing claim asks the platform, so at most one status call per post is in flight.
 */
export async function pollProcessing(deps: Deps, userId: string, session: PostSessionRow): Promise<PublishResult> {
  const adapter = deps.adapters[session.platform];
  if (!adapter) throw new ApiError(409, "unavailable", `${session.platform} isn't set up on the server yet.`);
  if (!(await deps.db.claimSession(session.id, "processing", "publishing"))) return answerFromStored(deps, session.id);
  // Publishing was already started once: anything short of a final answer goes back to `processing`, never `uploading`.
  const back = () => deps.db.claimSession(session.id, "publishing", "processing");
  // Fetched inside the claim so racing polls never refresh (and rotate) the token twice; a token failure is never a verdict on the post.
  let token: Awaited<ReturnType<typeof accessTokenFor>>;
  try { token = await accessTokenFor(deps, userId, session.platform); }
  catch (e) { await quietly(back); throw e; }
  const { accessToken, account } = token;
  let r: PublishResult;
  try {
    r = await withPlatformAuth(deps, account, () => adapter.status(adapterCtx(deps), accessToken, session.ref));
  } catch (e) {
    if (isRejection(e)) await quietly(() => failFrom(deps, session.id, "publishing", e.message));
    else await quietly(back);
    throw e;
  }
  // The platform answered: never revert from here. A failed write leaves `publishing` (accepted dead end).
  if (r.status === "done") return await finishFrom(deps, session, "publishing", r.url);
  await back();
  return r;
}
