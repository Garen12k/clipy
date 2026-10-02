import { PlatformError } from "../errors.ts";
import type { AdapterCtx, PublishResult, ServerAdapter, Tokens } from "../types.ts";
import { FORM, formBody } from "./http.ts";

const API = "https://open.tiktokapis.com";
/** Inbox upload only: the user finishes the post inside TikTok. Direct Post (video.publish) waits for TikTok's audit. Comma-separated, as TikTok requires. */
const SCOPES = "user.info.basic,video.upload";
/**
 * TikTok: every chunk 5–64 MB, sent in order; the last chunk carries the remainder (up to 128 MB).
 * A video smaller than one chunk goes as a single chunk of its own size.
 */
export const TIKTOK_CHUNK = 10 * 1024 * 1024;
/** Errors that mean the grant is not enough: the account must be reconnected. */
const AUTH_CODES = ["access_token_invalid", "scope_not_authorized", "scope_permission_missed"];
/** The HTTP status TikTok documents for a code, used when the code arrives inside an HTTP 200. */
const CODE_STATUS: Record<string, number> = {
  access_token_invalid: 401, scope_not_authorized: 401, rate_limit_exceeded: 429, internal_error: 500,
  spam_risk_too_many_pending_share: 403, spam_risk_too_many_posts: 403, spam_risk_user_banned_from_posting: 403,
  reached_active_user_cap: 403, unaudited_client_can_only_post_to_private_accounts: 403, url_ownership_unverified: 403,
};
/** OAuth error codes that mean the token endpoint itself is failing (RFC 6749): temporary, never "reconnect", even inside an HTTP 200. */
const OAUTH_STATUS: Record<string, number> = { server_error: 503, temporarily_unavailable: 503 };
const BUSY = "TikTok is having trouble — try again.";
const FRIENDLY: Record<string, string> = {
  spam_risk_too_many_pending_share: "TikTok allows 5 unfinished drafts a day. Open TikTok and post or delete some first.",
  rate_limit_exceeded: "TikTok is busy — wait a minute, then try again.",
  internal_error: BUSY,
};

const key = (c: AdapterCtx) => c.env.get("TIKTOK_CLIENT_KEY") ?? "";
const secret = (c: AdapterCtx) => c.env.get("TIKTOK_CLIENT_SECRET") ?? "";

export function chunkPlan(videoSize: number): { chunkSize: number; totalChunkCount: number } {
  const chunkSize = Math.max(1, Math.min(TIKTOK_CHUNK, videoSize));
  // Rounded down, as TikTok requires: the last chunk absorbs the remainder.
  return { chunkSize, totalChunkCount: Math.max(1, Math.floor(videoSize / chunkSize)) };
}

async function body(res: Response): Promise<Record<string, unknown>> {
  try {
    const b = (await res.json()) as unknown;
    return typeof b === "object" && b !== null ? (b as Record<string, unknown>) : {};
  } catch { return {}; }
}
function fail(status: number, code: string, message: string): never {
  const e = new PlatformError("tiktok", status, FRIENDLY[code] ?? (message || (code.startsWith("http_5") ? BUSY : code)));
  e.reason = code;
  throw e;
}
/** OAuth endpoints answer with a flat `{ error, error_description }`; TikTok does not document the HTTP status, so a 200 can carry one too. */
async function oauthJson(res: Response): Promise<Record<string, unknown>> {
  const b = await body(res);
  if (!res.ok || typeof b.error === "string") {
    const code = typeof b.error === "string" ? b.error : `http_${res.status}`;
    fail(res.ok ? (OAUTH_STATUS[code] ?? 400) : res.status, code, typeof b.error_description === "string" ? b.error_description : "");
  }
  if (typeof b.access_token !== "string" || !b.access_token) throw new PlatformError("tiktok", 502, "TikTok did not return a sign-in token.");
  return b;
}
/** API endpoints wrap everything in `{ data, error: { code, message } }`; `code: "ok"` is success. A code inside an HTTP 200 gets the status TikTok documents for it. */
async function apiJson(res: Response): Promise<Record<string, unknown>> {
  const b = await body(res);
  const err = (typeof b.error === "object" && b.error !== null ? b.error : {}) as { code?: unknown; message?: unknown };
  const code = typeof err.code === "string" ? err.code : res.ok ? "ok" : `http_${res.status}`;
  if (!res.ok || code !== "ok") fail(res.ok ? (CODE_STATUS[code] ?? 400) : res.status, code, typeof err.message === "string" ? err.message : "");
  return (typeof b.data === "object" && b.data !== null ? b.data : {}) as Record<string, unknown>;
}
const toTokens = (b: Record<string, unknown>): Tokens => ({
  accessToken: String(b.access_token), refreshToken: typeof b.refresh_token === "string" && b.refresh_token ? b.refresh_token : null,
  expiresAt: typeof b.expires_in === "number" ? new Date(Date.now() + b.expires_in * 1000).toISOString() : null, scopes: typeof b.scope === "string" ? b.scope : "",
});
const authed = (accessToken: string) => ({ Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json; charset=UTF-8" });

async function fetchStatus(c: AdapterCtx, accessToken: string, ref: Record<string, unknown>): Promise<PublishResult> {
  // Asking again cannot repair a missing reference: final (`platform_error`), so the phone starts a fresh upload.
  if (typeof ref.publishId !== "string" || !ref.publishId) throw new PlatformError("tiktok", 502, "TikTok upload reference is missing.", "platform_error");
  const data = await apiJson(await c.fetch(`${API}/v2/post/publish/status/fetch/`, { method: "POST", headers: authed(accessToken), body: JSON.stringify({ publish_id: ref.publishId }) }));
  if (data.status === "FAILED") {
    const reason = typeof data.fail_reason === "string" && data.fail_reason ? data.fail_reason : "unknown";
    // FAILED is final for this publish_id (asking again returns FAILED again), so even TikTok's own `internal` failure stays a 400:
    // the session fails and the phone's Retry uploads afresh, which is the only retry that can work.
    const e = new PlatformError("tiktok", 400, reason === "internal" ? "TikTok had a problem processing the video." : `TikTok couldn't use this video: ${reason}.`);
    e.reason = reason;
    throw e;
  }
  // Inbox uploads stop at SEND_TO_USER_INBOX until the user finishes the draft in TikTok (then PUBLISH_COMPLETE); there is no link to return.
  return data.status === "SEND_TO_USER_INBOX" || data.status === "PUBLISH_COMPLETE" ? { status: "done", url: null } : { status: "processing" };
}

export const tiktok: ServerAdapter = {
  id: "tiktok",
  secrets: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"],

  // TikTok's web flow has no PKCE (code_verifier is for mobile/desktop apps only); the client secret stays on the server and `state` protects the redirect.
  authUrl(c, { state }) {
    return `https://www.tiktok.com/v2/auth/authorize/?${new URLSearchParams({ client_key: key(c), response_type: "code", scope: SCOPES, redirect_uri: c.redirectUri, state })}`;
  },
  async exchange(c, { code }) {
    const res = await c.fetch(`${API}/v2/oauth/token/`, { method: "POST", headers: FORM, body: formBody({ client_key: key(c), client_secret: secret(c), code, grant_type: "authorization_code", redirect_uri: c.redirectUri }) });
    return toTokens(await oauthJson(res));
  },
  // The refresh token may rotate: the returned one must replace the stored one (tokens.ts keeps the old one only when none comes back).
  async refresh(c, refreshToken) {
    const res = await c.fetch(`${API}/v2/oauth/token/`, { method: "POST", headers: FORM, body: formBody({ client_key: key(c), client_secret: secret(c), grant_type: "refresh_token", refresh_token: refreshToken }) });
    return toTokens(await oauthJson(res));
  },
  async revoke(c, t) {
    await c.fetch(`${API}/v2/oauth/revoke/`, { method: "POST", headers: FORM, body: formBody({ client_key: key(c), client_secret: secret(c), token: t.accessToken }) });
  },
  async profile(c, accessToken) {
    const data = await apiJson(await c.fetch(`${API}/v2/user/info/?fields=open_id,avatar_url,display_name`, { headers: { Authorization: `Bearer ${accessToken}` } }));
    const u = (typeof data.user === "object" && data.user !== null ? data.user : {}) as { open_id?: unknown; display_name?: unknown; avatar_url?: unknown };
    if (typeof u.open_id !== "string" || !u.open_id) throw new PlatformError("tiktok", 502, "TikTok did not return the account.");
    return { accountId: u.open_id, displayName: typeof u.display_name === "string" && u.display_name ? u.display_name : "TikTok account", avatarUrl: typeof u.avatar_url === "string" && u.avatar_url ? u.avatar_url : null };
  },
  async prepare(c, accessToken, input) {
    const plan = chunkPlan(input.fileSize);
    const data = await apiJson(await c.fetch(`${API}/v2/post/publish/inbox/video/init/`, {
      method: "POST", headers: authed(accessToken),
      body: JSON.stringify({ source_info: { source: "FILE_UPLOAD", video_size: input.fileSize, chunk_size: plan.chunkSize, total_chunk_count: plan.totalChunkCount } }),
    }));
    if (typeof data.upload_url !== "string" || !data.upload_url || typeof data.publish_id !== "string" || !data.publish_id) throw new PlatformError("tiktok", 502, "TikTok did not return an upload address.");
    // The upload address is pre-signed (valid for one hour): the phone uploads to it directly, with no token.
    return { protocol: "tiktok-chunks", uploadUrl: data.upload_url, uploadHeaders: {}, chunkSize: plan.chunkSize, ref: { publishId: data.publish_id } };
  },
  finalize: (c, accessToken, s) => fetchStatus(c, accessToken, s.ref),
  status: (c, accessToken, ref) => fetchStatus(c, accessToken, ref),
  isAuthError: (e) => AUTH_CODES.includes(e.reason ?? ""),
};
