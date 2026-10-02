import { ApiError } from "../errors.ts";
import { accessTokenFor, withPlatformAuth } from "../tokens.ts";
import { adapterCtx, type Deps, type PostSessionRow, type PublishResult } from "../types.ts";
import { ownSession } from "./postUpload.ts";

export const settled = (s: PostSessionRow): PublishResult | null => (s.status === "done" ? { status: "done", url: s.url } : null);

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

export async function postFinalize(deps: Deps, userId: string, body: unknown): Promise<PublishResult> {
  const { sessionId, clientResult } = (body ?? {}) as { sessionId?: unknown; clientResult?: unknown };
  const session = await ownSession(deps, userId, sessionId);
  const done = settled(session);
  if (done) return done;
  const adapter = deps.adapters[session.platform];
  if (!adapter) throw new ApiError(409, "unavailable", `${session.platform} isn't set up on the server yet.`);
  const { accessToken, account } = await accessTokenFor(deps, userId, session.platform);
  const profile = { accountId: account.accountId, displayName: account.displayName, avatarUrl: account.avatarUrl };
  return record(deps, session, () => withPlatformAuth(deps, account, () =>
    adapter.finalize(adapterCtx(deps), accessToken, { ref: session.ref, input: session.input, clientResult: typeof clientResult === "string" ? clientResult : null, account: profile })));
}
