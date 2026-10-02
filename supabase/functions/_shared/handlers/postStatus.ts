import type { Deps, PublishResult } from "../types.ts";
import { failedError, ownSession, pollSession, settled } from "./session.ts";

export async function postStatus(deps: Deps, userId: string, body: unknown): Promise<PublishResult> {
  const session = await ownSession(deps, userId, (body as { sessionId?: unknown } | null)?.sessionId);
  const done = settled(session);
  if (done) return done;
  if (session.status === "failed") throw failedError(session);
  return pollSession(deps, userId, session);
}
