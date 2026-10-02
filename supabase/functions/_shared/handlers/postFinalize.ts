import { ApiError } from "../errors.ts";
import { accessTokenFor, withPlatformAuth } from "../tokens.ts";
import { adapterCtx, type Deps, type PublishResult } from "../types.ts";
import { failedError, ownSession, pollSession, record, settled } from "./session.ts";

/** Publishes once: only the caller that wins the uploading -> processing claim calls the platform; everyone else polls. */
export async function postFinalize(deps: Deps, userId: string, body: unknown): Promise<PublishResult> {
  const { sessionId, clientResult } = (body ?? {}) as { sessionId?: unknown; clientResult?: unknown };
  let session = await ownSession(deps, userId, sessionId);
  for (let attempt = 0; attempt < 2; attempt++) {
    const done = settled(session);
    if (done) return done;
    if (session.status === "failed") throw failedError(session);
    if (session.status === "processing") return pollSession(deps, userId, session);

    const adapter = deps.adapters[session.platform];
    if (!adapter) throw new ApiError(409, "unavailable", `${session.platform} isn't set up on the server yet.`);
    const { accessToken, account } = await accessTokenFor(deps, userId, session.platform);
    if (await deps.db.claimSession(session.id, "uploading", "processing")) {
      const profile = { accountId: account.accountId, displayName: account.displayName, avatarUrl: account.avatarUrl };
      try {
        return await record(deps, session, () => withPlatformAuth(deps, account, () =>
          adapter.finalize(adapterCtx(deps), accessToken, { ref: session.ref, input: session.input, clientResult: typeof clientResult === "string" ? clientResult : null, account: profile })));
      } catch (e) {
        // Auth trouble: nothing was published, so let the user reconnect and finalize again.
        if (e instanceof ApiError && e.code === "reconnect") await deps.db.updateSession(session.id, { status: "uploading" });
        throw e;
      }
    }
    session = await ownSession(deps, userId, sessionId); // lost the race: behave per the winner's status
  }
  return pollSession(deps, userId, session);
}
