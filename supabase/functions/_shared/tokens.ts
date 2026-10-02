import { decrypt, encrypt } from "./crypto.ts";
import { ApiError } from "./errors.ts";
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

export async function accessTokenFor(deps: Deps, userId: string, platform: PlatformId): Promise<{ accessToken: string; account: AccountRow }> {
  const account = await deps.db.getAccount(userId, platform);
  if (!account) throw new ApiError(404, "not_connected", `Connect ${platform} in Accounts first.`);
  const key = await deps.key();
  const fresh = !account.expiresAt || new Date(account.expiresAt).getTime() - deps.now().getTime() > REFRESH_MARGIN_MS;
  if (fresh) return { accessToken: await decrypt(key, account.accessTokenEnc), account };

  const adapter = deps.adapters[platform];
  const oldRefresh = account.refreshTokenEnc ? await decrypt(key, account.refreshTokenEnc) : null;
  if (!adapter || !oldRefresh) throw reconnect(platform);
  let next: Tokens;
  try { next = await adapter.refresh(adapterCtx(deps), oldRefresh); }
  catch {
    await deps.db.upsertAccount({ ...account, meta: { ...account.meta, needsReconnect: true } });
    throw reconnect(platform);
  }
  const updated: AccountRow = {
    ...account, accessTokenEnc: await encrypt(key, next.accessToken),
    refreshTokenEnc: await encrypt(key, next.refreshToken ?? oldRefresh),
    expiresAt: next.expiresAt, scopes: next.scopes || account.scopes, meta: { ...account.meta, needsReconnect: false },
  };
  await deps.db.upsertAccount(updated);
  return { accessToken: next.accessToken, account: updated };
}
