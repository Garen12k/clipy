import { ApiError } from "../errors.ts";
import type { Deps, PublishResult } from "../types.ts";
import { failedError, ownSession, pollProcessing, settled } from "./session.ts";

export async function postStatus(deps: Deps, userId: string, body: unknown): Promise<PublishResult> {
  const session = await ownSession(deps, userId, (body as { sessionId?: unknown } | null)?.sessionId);
  const done = settled(session);
  if (done) return done;
  if (session.status === "failed") throw failedError(session);
  if (session.status === "uploading") throw new ApiError(400, "bad_request", "Finish the upload first.");
  if (session.status === "publishing") return { status: "processing" };
  return pollProcessing(deps, userId, session);
}
