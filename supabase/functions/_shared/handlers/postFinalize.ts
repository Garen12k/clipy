import { ApiError } from "../errors.ts";
import { accessTokenFor, withPlatformAuth } from "../tokens.ts";
import { adapterCtx, type Deps, type PublishResult } from "../types.ts";
import { failedError, failFrom, finishFrom, isRejection, ownSession, pollProcessing, settled } from "./session.ts";

/** Publishes once: only the caller that wins the uploading -> publishing claim calls the platform. */
export async function postFinalize(deps: Deps, userId: string, body: unknown): Promise<PublishResult> {
  const { sessionId, clientResult } = (body ?? {}) as { sessionId?: unknown; clientResult?: unknown };
  let session = await ownSession(deps, userId, sessionId);
  for (let attempt = 0; ; attempt++) {
    const done = settled(session);
    if (done) return done;
    if (session.status === "failed") throw failedError(session);
    if (session.status === "publishing") return { status: "processing" };
    if (session.status === "processing") return pollProcessing(deps, userId, session);

    // uploading
    const adapter = deps.adapters[session.platform];
    if (!adapter) throw new ApiError(409, "unavailable", `${session.platform} isn't set up on the server yet.`);
    const { accessToken, account } = await accessTokenFor(deps, userId, session.platform);
    if (await deps.db.claimSession(session.id, "uploading", "publishing")) {
      const profile = { accountId: account.accountId, displayName: account.displayName, avatarUrl: account.avatarUrl };
      let r: PublishResult;
      try {
        r = await withPlatformAuth(deps, account, () =>
          adapter.finalize(adapterCtx(deps), accessToken, { ref: session.ref, input: session.input, clientResult: typeof clientResult === "string" ? clientResult : null, account: profile }));
      } catch (e) {
        if (isRejection(e)) await failFrom(deps, session.id, "publishing", e.message);
        else await deps.db.claimSession(session.id, "publishing", "uploading"); // nothing was published: let the user try again
        throw e;
      }
      // The platform call succeeded: never revert from here. A failed write leaves `publishing` (accepted dead end).
      if (r.status === "done") return await finishFrom(deps, session, "publishing", r.url);
      await deps.db.claimSession(session.id, "publishing", "processing");
      return r;
    }
    if (attempt >= 3) return { status: "processing" };
    session = await ownSession(deps, userId, sessionId); // lost the race: apply the rules to the new status
  }
}
