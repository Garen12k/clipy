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

/**
 * Marks the account as needing a reconnect. Re-reads the row and changes only the flag: writing back a row read earlier could
 * restore a refresh token another request has already rotated. A row that is gone (disconnected) is left gone.
 */
async function flagReconnect(deps: Deps, userId: string, platform: PlatformId): Promise<void> {
  const current = await deps.db.getAccount(userId, platform);
  if (current) await deps.db.upsertAccount({ ...current, meta: { ...current.meta, needsReconnect: true } });
}

/** Runs a platform call; a 401 from the platform (or an error the adapter calls an auth error) flags the account and becomes `reconnect`. */
export async function withPlatformAuth<T>(deps: Deps, account: AccountRow, run: () => Promise<T>): Promise<T> {
  try { return await run(); }
  catch (e) {
    if (e instanceof PlatformError && (e.status === 401 || deps.adapters[account.platform]?.isAuthError?.(e) === true)) {
      await flagReconnect(deps, account.userId, account.platform);
      throw reconnect(account.platform);
    }
    throw e;
  }
}

export async function accessTokenFor(deps: Deps, userId: string, platform: PlatformId): Promise<{ accessToken: string; account: AccountRow }> {
  const account = await deps.db.getAccount(userId, platform);
  if (!account) throw new ApiError(404, "not_connected", `Connect ${platform} in Accounts first.`);
  const key = await deps.key();
  const isFresh = (row: AccountRow) => !row.expiresAt || new Date(row.expiresAt).getTime() - deps.now().getTime() > REFRESH_MARGIN_MS;
  if (isFresh(account)) return { accessToken: await decrypt(key, account.accessTokenEnc), account };

  const adapter = deps.adapters[platform];
  const oldRefresh = account.refreshTokenEnc ? await decrypt(key, account.refreshTokenEnc) : null;
  if (!adapter || !oldRefresh) { await flagReconnect(deps, userId, platform); throw reconnect(platform); }
  let next: Tokens;
  try { next = await adapter.refresh(adapterCtx(deps), oldRefresh); }
  catch (e) {
    if (e instanceof PlatformError) {
      if (e.status === 400 || e.status === 401) {
        // Rotating refresh tokens (X, TikTok) are single-use: when two requests refresh at once, the loser's refresh is refused
        // because the winner already spent the token. If the stored row changed since we read it, is still the same account,
        // is not itself flagged, and is fresh, use it.
        const latest = await deps.db.getAccount(userId, platform);
        if (latest && latest.accountId === account.accountId && latest.meta.needsReconnect !== true && isFresh(latest)
          && (latest.accessTokenEnc !== account.accessTokenEnc || latest.refreshTokenEnc !== account.refreshTokenEnc)) {
          return { accessToken: await decrypt(key, latest.accessTokenEnc), account: latest };
        }
        await flagReconnect(deps, userId, platform);
        throw reconnect(platform);
      }
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
