import { ApiError } from "../errors.ts";
import { accessTokenFor, withPlatformAuth } from "../tokens.ts";
import { adapterCtx, type Deps, type PublishResult } from "../types.ts";
import { record, settled } from "./postFinalize.ts";
import { ownSession } from "./postUpload.ts";

export async function postStatus(deps: Deps, userId: string, body: unknown): Promise<PublishResult> {
  const session = await ownSession(deps, userId, (body as { sessionId?: unknown } | null)?.sessionId);
  const done = settled(session);
  if (done) return done;
  if (session.status === "failed") throw new ApiError(400, "platform_error", session.error ?? "The post failed.");
  const adapter = deps.adapters[session.platform];
  if (!adapter) throw new ApiError(409, "unavailable", `${session.platform} isn't set up on the server yet.`);
  const { accessToken, account } = await accessTokenFor(deps, userId, session.platform);
  return record(deps, session, () => withPlatformAuth(deps, account, () => adapter.status(adapterCtx(deps), accessToken, session.ref)));
}
