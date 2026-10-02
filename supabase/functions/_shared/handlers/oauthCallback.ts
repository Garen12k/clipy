import { ApiError } from "../errors.ts";
import { saveTokens } from "../tokens.ts";
import { adapterCtx, availableAdapter, type Deps, type Tokens } from "../types.ts";

const back = (returnUrl: string, params: Record<string, string>) =>
  `${returnUrl}${returnUrl.includes("?") ? "&" : "?"}${Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")}`;

/** The platform's redirect lands here. Exchanges the code at once (X's expires in 30 s) and bounces back into the app. */
export async function oauthCallback(deps: Deps, url: URL): Promise<{ redirect: string }> {
  const row = await deps.db.takeState(url.searchParams.get("state") ?? "");
  if (!row || new Date(row.expiresAt).getTime() < deps.now().getTime()) throw new ApiError(400, "bad_state", "This sign-in link has expired. Go back to Clipy and try again.");
  const { platform, returnUrl } = row;
  const code = url.searchParams.get("code");
  if (url.searchParams.get("error") || !code) return { redirect: back(returnUrl, { status: "cancelled", platform }) };
  const adapter = availableAdapter(deps, platform);
  const ctx = adapterCtx(deps);
  let tokens: Tokens | null = null;
  try {
    if (!adapter) throw new ApiError(409, "unavailable", `${platform} isn't set up on the server yet.`);
    tokens = await adapter.exchange(ctx, { code, codeVerifier: row.codeVerifier });
    await saveTokens(deps, row.userId, platform, tokens, await adapter.profile(ctx, tokens.accessToken));
    return { redirect: back(returnUrl, { status: "ok", platform }) };
  } catch (e) {
    // The grant was issued but not kept: hand it back (best effort; a revoke failure never replaces the original error).
    if (adapter && tokens) {
      try { await adapter.revoke(ctx, { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken }); }
      catch { console.error("revoke after a failed connect failed"); }
    }
    const message = e instanceof ApiError ? e.message : "Something went wrong.";
    if (!(e instanceof ApiError)) console.error(e);
    return { redirect: back(returnUrl, { status: "error", platform, message }) };
  }
}
