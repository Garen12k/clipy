import { ApiError } from "../errors.ts";
import { accessTokenFor, withPlatformAuth } from "../tokens.ts";
import { adapterCtx, availableAdapter, isPlatformId, type CreatorInfo, type Deps } from "../types.ts";

/**
 * What the connected account may post right now (TikTok "Post now": its name and picture, who may see a post, which interactions are
 * off, the longest video). Read fresh from the platform on every call and never stored. Nothing is posted by this.
 */
export async function creatorInfo(deps: Deps, userId: string, body: unknown): Promise<CreatorInfo> {
  const platform = (body as { platform?: unknown } | null)?.platform;
  if (!isPlatformId(platform)) throw new ApiError(400, "bad_request", "Unknown platform.");
  const adapter = availableAdapter(deps, platform);
  if (!adapter) throw new ApiError(409, "unavailable", `${platform} isn't set up on the server yet.`);
  const ask = adapter.creatorInfo;
  if (!ask) throw new ApiError(400, "bad_request", "This platform has no posting details.");
  const { accessToken, account } = await accessTokenFor(deps, userId, platform);
  // A missing permission arrives as a plain ApiError (`needs_permission`), which withPlatformAuth passes on without flagging the account.
  return withPlatformAuth(deps, account, () => ask.call(adapter, adapterCtx(deps), accessToken, { scopes: account.scopes }));
}
