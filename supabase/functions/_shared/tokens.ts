import { decrypt, encrypt } from "./crypto.ts";
import { ApiError, isTemporaryStatus, PlatformError } from "./errors.ts";
import { adapterCtx, type AccountRow, type Deps, type PlatformId, type Profile, type Tokens } from "./types.ts";

const REFRESH_MARGIN_MS = 60_000;

export async function saveTokens(deps: Deps, userId: string, platform: PlatformId, tokens: Tokens, profile: Profile, meta: Record<string, unknown> = {}): Promise<void> {
  const key = await deps.key();
  await deps.db.upsertAccount({
    userId, platform, accountId: profile.accountId, displayName: profile.displayName, avatarUrl: profile.avatarUrl,
    accessTokenEnc: await encrypt(key, tokens.accessToken),
    refreshTokenEnc: tokens.refreshToken ? await encrypt(key, tokens.refreshToken) : null,
    expiresAt: tokens.expiresAt, scopes: tokens.scopes, meta,
  });
}

const reconnect = (platform: PlatformId) => new ApiError(401, "reconnect", `Reconnect ${platform} in Accounts.`);
const unreachable = (platform: PlatformId) => new ApiError(502, "platform_unreachable", `Couldn't reach ${platform}. Try again.`);

/** Runs a platform call; a 401 from the platform (or an error the adapter calls an auth error) flags the account and becomes `reconnect`. */
export async function withPlatformAuth<T>(deps: Deps, account: AccountRow, run: () => Promise<T>): Promise<T> {
  try { return await run(); }
  catch (e) {
    if (e instanceof PlatformError && (e.status === 401 || deps.adapters[account.platform]?.isAuthError?.(e) === true)) {
      await deps.db.upsertAccount({ ...account, meta: { ...account.meta, needsReconnect: true } });
      throw reconnect(account.platform);
    }
    throw e;
  }
}

export async function accessTokenFor(deps: Deps, userId: string, platform: PlatformId): Promise<{ accessToken: string; account: AccountRow }> {
  const account = await deps.db.getAccount(userId, platform);
  if (!account) throw new ApiError(404, "not_connected", `Connect ${platform} in Accounts first.`);
  const key = await deps.key();
  const fresh = !account.expiresAt || new Date(account.expiresAt).getTime() - deps.now().getTime() > REFRESH_MARGIN_MS;
  if (fresh) return { accessToken: await decrypt(key, account.accessTokenEnc), account };

  const adapter = deps.adapters[platform];
  const oldRefresh = account.refreshTokenEnc ? await decrypt(key, account.refreshTokenEnc) : null;
  const flag = () => deps.db.upsertAccount({ ...account, meta: { ...account.meta, needsReconnect: true } });
  if (!adapter || !oldRefresh) { await flag(); throw reconnect(platform); }
  let next: Tokens;
  try { next = await adapter.refresh(adapterCtx(deps), oldRefresh); }
  catch (e) {
    if (e instanceof PlatformError) {
      if (e.status === 400 || e.status === 401) { await flag(); throw reconnect(platform); }
      // A busy or failing token endpoint is temporary: say "try again", never "the platform refused".
      if (!isTemporaryStatus(e.status)) throw e;
    }
    throw unreachable(platform);
  }
  const updated: AccountRow = {
    ...account, accessTokenEnc: await encrypt(key, next.accessToken),
    refreshTokenEnc: await encrypt(key, next.refreshToken ?? oldRefresh),
    expiresAt: next.expiresAt, scopes: next.scopes || account.scopes, meta: { ...account.meta, needsReconnect: false },
  };
  await deps.db.upsertAccount(updated);
  return { accessToken: next.accessToken, account: updated };
}
