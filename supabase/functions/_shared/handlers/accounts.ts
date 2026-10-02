import { decrypt } from "../crypto.ts";
import { ApiError } from "../errors.ts";
import { adapterCtx, availableAdapter, isPlatformId, PLATFORM_IDS, type Deps, type PlatformId } from "../types.ts";

export interface PlatformStatus { id: PlatformId; available: boolean; connected: boolean; name: string | null; avatarUrl: string | null; needsReconnect: boolean }

export async function listAccounts(deps: Deps, userId: string): Promise<{ platforms: PlatformStatus[] }> {
  const rows = new Map((await deps.db.listAccounts(userId)).map((r) => [r.platform, r]));
  return {
    platforms: PLATFORM_IDS.map((id) => {
      const row = rows.get(id);
      return { id, available: !!availableAdapter(deps, id), connected: !!row, name: row?.displayName ?? null, avatarUrl: row?.avatarUrl ?? null, needsReconnect: row?.meta.needsReconnect === true };
    }),
  };
}

export async function disconnect(deps: Deps, userId: string, platform: unknown): Promise<{ ok: true }> {
  if (!isPlatformId(platform)) throw new ApiError(400, "bad_request", "Unknown platform.");
  const row = await deps.db.getAccount(userId, platform);
  if (!row) return { ok: true };
  const adapter = deps.adapters[platform];
  if (adapter) {
    try {
      const key = await deps.key();
      await adapter.revoke(adapterCtx(deps), { accessToken: await decrypt(key, row.accessTokenEnc), refreshToken: row.refreshTokenEnc ? await decrypt(key, row.refreshTokenEnc) : null });
    } catch (e) { console.error("revoke failed", e); }   // the row is deleted regardless
  }
  await deps.db.deleteAccount(userId, platform);
  return { ok: true };
}
