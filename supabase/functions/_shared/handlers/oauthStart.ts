import { ApiError } from "../errors.ts";
import { challengeFor, randomToken } from "../pkce.ts";
import { adapterCtx, availableAdapter, isPlatformId, type Deps } from "../types.ts";

/** Where the callback may send the browser back to: Expo Go (exp/exps) or the built app (clipy). Nothing else. */
export const RETURN_URL = /^(exp|exps|clipy):\/\/[^\s#]{0,500}$/;
export const STATE_TTL_MS = 600_000;

export async function oauthStart(deps: Deps, userId: string, body: unknown): Promise<{ authUrl: string }> {
  const { platform, returnUrl } = (body ?? {}) as { platform?: unknown; returnUrl?: unknown };
  if (!isPlatformId(platform) || typeof returnUrl !== "string" || !RETURN_URL.test(returnUrl)) throw new ApiError(400, "bad_request", "Unknown platform or return address.");
  const adapter = availableAdapter(deps, platform);
  if (!adapter) throw new ApiError(409, "unavailable", `${platform} isn't set up on the server yet.`);
  const state = randomToken(), codeVerifier = randomToken(48);
  await deps.db.putState({ state, userId, platform, codeVerifier, returnUrl, expiresAt: new Date(deps.now().getTime() + STATE_TTL_MS).toISOString() });
  return { authUrl: adapter.authUrl(adapterCtx(deps), { state, codeChallenge: await challengeFor(codeVerifier) }) };
}
