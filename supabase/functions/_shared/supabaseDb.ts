// Deno-only: the real Db over an admin (RLS-bypassing) supabase-js client. Mirrors memoryDb.ts exactly; keep it a thin mapping.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { ApiError } from "./errors.ts";
import type { AccountRow, Db, OAuthStateRow, PlatformId, PostSessionRow } from "./types.ts";

type Rec = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
interface DbError { code?: string; message?: string }

/** Logs only the code and message (never `details`, which can echo row values) and hides the rest from the caller. */
function check<T>(r: { data: T; error: DbError | null }, what: string): T {
  if (r.error) {
    console.error(`db ${what} failed`, r.error.code ?? "", r.error.message ?? "");
    throw new ApiError(500, "internal", "Something went wrong.");
  }
  return r.data;
}

const accountFrom = (r: Rec): AccountRow => ({
  userId: r.user_id as string, platform: r.platform as PlatformId, accountId: r.account_id as string, displayName: r.display_name as string,
  avatarUrl: (r.avatar_url as string | null) ?? null, accessTokenEnc: r.access_token_enc as string, refreshTokenEnc: (r.refresh_token_enc as string | null) ?? null,
  expiresAt: (r.expires_at as string | null) ?? null, scopes: (r.scopes as string) ?? "", meta: (r.meta as Record<string, unknown>) ?? {},
});
const accountTo = (a: AccountRow): Rec => ({
  user_id: a.userId, platform: a.platform, account_id: a.accountId, display_name: a.displayName, avatar_url: a.avatarUrl,
  access_token_enc: a.accessTokenEnc, refresh_token_enc: a.refreshTokenEnc, expires_at: a.expiresAt, scopes: a.scopes, meta: a.meta,
  updated_at: new Date().toISOString(),
});
const stateFrom = (r: Rec): OAuthStateRow => ({
  state: r.state as string, userId: r.user_id as string, platform: r.platform as PlatformId,
  codeVerifier: r.code_verifier as string, returnUrl: r.return_url as string, expiresAt: r.expires_at as string,
});
const sessionFrom = (r: Rec): PostSessionRow => ({
  id: r.id as string, userId: r.user_id as string, platform: r.platform as PlatformId, ref: (r.platform_ref as Record<string, unknown>) ?? {},
  input: r.input as PostSessionRow["input"], status: r.status as PostSessionRow["status"], url: (r.url as string | null) ?? null, error: (r.error as string | null) ?? null,
});

export function supabaseDb(sb: SupabaseClient): Db {
  return {
    async getAccount(userId, platform) {
      const data = check(await sb.from("connected_accounts").select("*").eq("user_id", userId).eq("platform", platform).maybeSingle(), "getAccount");
      return data ? accountFrom(data) : null;
    },
    async listAccounts(userId) {
      const data = check(await sb.from("connected_accounts").select("*").eq("user_id", userId), "listAccounts");
      return (data ?? []).map(accountFrom);
    },
    async upsertAccount(row) {
      check(await sb.from("connected_accounts").upsert(accountTo(row), { onConflict: "user_id,platform" }), "upsertAccount");
    },
    async deleteAccount(userId, platform) {
      check(await sb.from("connected_accounts").delete().eq("user_id", userId).eq("platform", platform), "deleteAccount");
    },
    async putState(row) {
      check(await sb.from("oauth_states").insert({
        state: row.state, user_id: row.userId, platform: row.platform, code_verifier: row.codeVerifier, return_url: row.returnUrl, expires_at: row.expiresAt,
      }), "putState");
    },
    /** One `delete … returning` statement: a state can be taken once, even by two simultaneous callbacks. */
    async takeState(state) {
      const data = check(await sb.from("oauth_states").delete().eq("state", state).select().maybeSingle(), "takeState");
      return data ? stateFrom(data) : null;
    },
    async createSession(row) {
      const data = check(await sb.from("post_sessions").insert({
        user_id: row.userId, platform: row.platform, platform_ref: row.ref, input: row.input, status: row.status, url: row.url, error: row.error,
      }).select("id").single(), "createSession");
      return (data as { id: string }).id;
    },
    async getSession(id) {
      if (!UUID.test(id)) return null;   // the app's session id is untrusted input; Postgres would reject a non-uuid with an error
      const data = check(await sb.from("post_sessions").select("*").eq("id", id).maybeSingle(), "getSession");
      return data ? sessionFrom(data) : null;
    },
    async updateSession(id, patch) {
      const p: Rec = {};
      if ("ref" in patch) p.platform_ref = patch.ref;
      if ("status" in patch) p.status = patch.status;
      if ("url" in patch) p.url = patch.url;
      if ("error" in patch) p.error = patch.error;
      if (Object.keys(p).length === 0 || !UUID.test(id)) return;
      check(await sb.from("post_sessions").update(p).eq("id", id), "updateSession");
    },
    /** One conditional UPDATE (status and patch together, guarded by the current status) — never a read followed by a write. */
    async claimSession(id, from, to, patch = {}) {
      if (!UUID.test(id)) return false;
      const p: Rec = { status: to };
      if ("url" in patch) p.url = patch.url;
      if ("error" in patch) p.error = patch.error;
      const data = check(await sb.from("post_sessions").update(p).eq("id", id).eq("status", from).select("id"), "claimSession");
      return (data ?? []).length === 1;
    },
  };
}
