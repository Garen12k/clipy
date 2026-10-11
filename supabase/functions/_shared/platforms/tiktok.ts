import { ApiError, isRejectionStatus, isTemporaryStatus, plainCode, PlatformError } from "../errors.ts";
import type { AdapterCtx, CreatorInfo, PrepareInput, PrepareResult, PublishResult, ServerAdapter, TikTokPrivacy, Tokens } from "../types.ts";
import { FORM, formBody } from "./http.ts";

const API = "https://open.tiktokapis.com";
/** What connecting asks for while Post now is off: `video.upload` sends a draft to the inbox. Comma-separated, as TikTok requires. */
const SCOPES = "user.info.basic,video.upload";
/** Direct Post ("Post now") and creator info. Asked for ONLY while the switch below is on; an account without it keeps working for drafts. */
export const DIRECT_SCOPE = "video.publish";
/**
 * Post now is switched on by the server secret `TIKTOK_DIRECT_POST=true`, set only after Direct Post and `video.publish` are enabled
 * for the app in TikTok's portal (TikTok refuses a connect that asks for a scope the app does not have). Absent or anything else:
 * connecting asks for exactly the two draft scopes, and Post now answers `direct_off`. Drafts never read it.
 */
const directOn = (c: AdapterCtx) => c.env.get("TIKTOK_DIRECT_POST") === "true";
export const DIRECT_OFF = "Posting straight to TikTok isn't switched on yet. Choose Send as draft.";
/** A plain ApiError, like `needs_permission`: nothing is wrong with the account, so it is never flagged. */
const directOff = () => new ApiError(409, "direct_off", DIRECT_OFF);
const DRAFT_SCOPE = "video.upload";
/** The stored grant as a list: TikTok separates with commas; white space is accepted too. */
export const scopeList = (scopes: string): string[] => scopes.split(/[\s,]+/).filter(Boolean);
/** True only when the stored grant is readable (it names the draft permission) and does not name the direct one. Anything else: ask TikTok. */
export const knownToLackDirect = (scopes: string): boolean => { const l = scopeList(scopes); return l.includes(DRAFT_SCOPE) && !l.includes(DIRECT_SCOPE); };
/** The order "Who can see it" is offered in. */
export const TIKTOK_PRIVACY: readonly TikTokPrivacy[] = ["PUBLIC_TO_EVERYONE", "FOLLOWER_OF_CREATOR", "MUTUAL_FOLLOW_FRIENDS", "SELF_ONLY"];
export const TIKTOK_TITLE_MAX = 2200;
/** TikTok's API ceiling, used when a creator's own limit is not sent. */
const API_MAX_DURATION_SEC = 600;
export const NEEDS_PERMISSION = "Reconnect TikTok to allow posting directly, or choose Send as draft in the TikTok options.";
/** Not a PlatformError and not a 401: the account is healthy for drafts, so it must never be flagged for a reconnect. */
const needsPermission = () => new ApiError(403, "needs_permission", NEEDS_PERMISSION);
const refuse = (message: string) => new ApiError(400, "options_refused", message);
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
/** Direct Post only. The draft path keeps `CODE_STATUS` and `FRIENDLY` exactly as they are. */
const DIRECT_STATUS: Record<string, number> = { ...CODE_STATUS, privacy_level_option_mismatch: 403 };
const TOO_MANY = "TikTok says this account has posted too much today. Try again tomorrow, or post from TikTok.";
const BANNED = "TikTok has stopped this account from posting for now. Open TikTok to see why.";
const PRIVACY_GONE = "TikTok no longer offers that choice of who can see it. Open the TikTok options and choose again.";
const DIRECT_FRIENDLY: Record<string, string> = {
  ...FRIENDLY,
  unaudited_client_can_only_post_to_private_accounts: "TikTok only lets Clipy post to private accounts for now. Set your TikTok account to private, or choose Send as draft in the TikTok options.",
  spam_risk_too_many_posts: TOO_MANY,
  spam_risk_user_banned_from_posting: BANNED,
  reached_active_user_cap: "Clipy has reached TikTok's daily limit of accounts that can post. Try again tomorrow, or choose Send as draft in the TikTok options.",
  privacy_level_option_mismatch: PRIVACY_GONE,
};
/** A direct post's final failures in plain words; a reason not listed keeps the draft's sentence. */
const DIRECT_FAILED: Record<string, string> = {
  spam_risk_text: "TikTok refused the caption. Change it and post again.",
  spam_risk: "TikTok refused this post.",
  spam_risk_too_many_posts: TOO_MANY,
  spam_risk_user_banned_from_posting: BANNED,
  auth_removed: "TikTok access was removed while posting. Reconnect TikTok and post again.",
};
/** On a direct call these mean "the grant has no video.publish": the account still posts drafts. */
const DIRECT_SCOPE_CODES = ["scope_not_authorized", "scope_permission_missed"];
/** A direct call refused with a code this file does not know: never TikTok's own text, never the bare code. */
const DIRECT_REFUSED = "TikTok didn't accept this. Try again later, or choose Send as draft in the TikTok options.";
/** A direct post that FAILED for a reason this file does not know. */
const DIRECT_UNUSABLE = "TikTok couldn't use this video.";
/** A direct post's status call refused without a verdict: the post may be live. */
const DIRECT_UNCONFIRMED = "TikTok couldn't confirm this post. Check your TikTok profile before posting again.";
const CONNECT_REFUSED = "TikTok didn't let Clipy connect. Try again in a few minutes.";
/** The raw code of something this file has no sentence for goes to the server log only (a code, never a token or TikTok's text). */
const logCode = (what: string, code: string) => console.error(`tiktok ${what}: ${plainCode(code)}`);

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
function fail(status: number, code: string, message: string, friendly: Record<string, string> = FRIENDLY): never {
  const e = new PlatformError("tiktok", status, friendly[code] ?? (message || (code.startsWith("http_5") ? BUSY : code)));
  e.reason = code;
  throw e;
}
/** A refused direct call: the listed sentence, else "busy" for a temporary status, else one generic sentence. */
function failDirect(status: number, code: string): never {
  const known = DIRECT_FRIENDLY[code];
  if (!known && code !== "access_token_invalid") logCode("direct call refused", code);
  const e = new PlatformError("tiktok", status, known ?? (isTemporaryStatus(status) ? BUSY : DIRECT_REFUSED));
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
async function apiJson(res: Response, direct = false): Promise<Record<string, unknown>> {
  const b = await body(res);
  const err = (typeof b.error === "object" && b.error !== null ? b.error : {}) as { code?: unknown; message?: unknown };
  const code = typeof err.code === "string" ? err.code : res.ok ? "ok" : `http_${res.status}`;
  if (!res.ok || code !== "ok") {
    if (direct) {
      const status = res.ok ? (DIRECT_STATUS[code] ?? 400) : res.status;
      // Only `access_token_invalid` says the token itself is bad. Any other 401 on a direct call is taken as the missing permission:
      // the account still posts drafts, so merely opening Post now must never flag it "Sign-in expired".
      if (DIRECT_SCOPE_CODES.includes(code) || (status === 401 && code !== "access_token_invalid")) throw needsPermission();
      failDirect(status, code);
    }
    fail(res.ok ? (CODE_STATUS[code] ?? 400) : res.status, code, typeof err.message === "string" ? err.message : "");
  }
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
  let data: Record<string, unknown>;
  try { data = await apiJson(await c.fetch(`${API}/v2/post/publish/status/fetch/`, { method: "POST", headers: authed(accessToken), body: JSON.stringify({ publish_id: ref.publishId }) })); }
  catch (e) {
    // Direct Post only: the status CALL was refused, which is no verdict on the post — it may be live. Final for this session, with its
    // own code so the phone says "check your profile" and never "Retry will upload the video again". An auth error stays what it is.
    if (ref.direct === true && e instanceof PlatformError && isRejectionStatus(e.status) && !AUTH_CODES.includes(e.reason ?? "")) {
      logCode("direct status refused", e.reason ?? "");
      const unknown = new PlatformError("tiktok", e.status, DIRECT_UNCONFIRMED, "outcome_unknown");
      unknown.reason = e.reason;
      throw unknown;
    }
    throw e;
  }
  if (data.status === "FAILED") {
    const reason = typeof data.fail_reason === "string" && data.fail_reason ? data.fail_reason : "unknown";
    // FAILED is final for this publish_id (asking again returns FAILED again), so even TikTok's own `internal` failure stays a 400:
    // the session fails and the phone's Retry uploads afresh, which is the only retry that can work.
    // A direct post never shows a bare reason: the listed sentence, the shared "internal" one below, or one generic sentence (the reason goes to the log).
    const plain = ref.direct === true ? (DIRECT_FAILED[reason] ?? (reason === "internal" ? undefined : DIRECT_UNUSABLE)) : undefined;
    if (plain === DIRECT_UNUSABLE) logCode("direct post failed", reason);
    const e = new PlatformError("tiktok", 400, plain ?? (reason === "internal" ? "TikTok had a problem processing the video." : `TikTok couldn't use this video: ${reason}.`));
    e.reason = reason;
    throw e;
  }
  // Inbox uploads stop at SEND_TO_USER_INBOX until the user finishes the draft in TikTok (then PUBLISH_COMPLETE); there is no link to return.
  return data.status === "SEND_TO_USER_INBOX" || data.status === "PUBLISH_COMPLETE" ? { status: "done", url: null } : { status: "processing" };
}

const text = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
/** Asked fresh every time (TikTok's avatar address lives 2 hours and the options can change): nothing here is cached. */
async function queryCreator(c: AdapterCtx, accessToken: string): Promise<CreatorInfo> {
  const d = await apiJson(await c.fetch(`${API}/v2/post/publish/creator_info/query/`, { method: "POST", headers: authed(accessToken) }), true);
  const offered = Array.isArray(d.privacy_level_options) ? (d.privacy_level_options as unknown[]) : [];
  const privacyOptions = TIKTOK_PRIVACY.filter((p) => offered.includes(p));
  if (privacyOptions.length === 0) throw new PlatformError("tiktok", 502, "TikTok did not say who can see the post.");
  const max = d.max_video_post_duration_sec;
  const avatar = text(d.creator_avatar_url);
  return {
    nickname: text(d.creator_nickname) ?? text(d.creator_username) ?? "TikTok account", username: text(d.creator_username),
    avatarUrl: avatar && avatar.startsWith("https://") ? avatar : null, privacyOptions,
    commentDisabled: d.comment_disabled === true, duetDisabled: d.duet_disabled === true, stitchDisabled: d.stitch_disabled === true,
    maxDurationSec: typeof max === "number" && Number.isFinite(max) && max > 0 ? max : API_MAX_DURATION_SEC,
  };
}

interface DirectOptions { privacy: TikTokPrivacy; allowComment: boolean; allowDuet: boolean; allowStitch: boolean; brandOrganic: boolean; brandContent: boolean }
const SWITCHES = ["allowComment", "allowDuet", "allowStitch", "brandOrganic", "brandContent"] as const;
function directOptions(o: Record<string, unknown>): DirectOptions {
  if (!TIKTOK_PRIVACY.includes(o.privacy as TikTokPrivacy) || !SWITCHES.every((k) => typeof o[k] === "boolean")) throw new ApiError(400, "bad_request", "The TikTok options are incomplete.");
  return o as unknown as DirectOptions;
}
const lengthWords = (sec: number) => (sec >= 60 && sec % 60 === 0 ? `${sec / 60} ${sec === 60 ? "minute" : "minutes"}` : `${Math.floor(sec)} seconds`);
const turnedOff = (what: string, verb: "are" | "is") => `${what} ${verb} turned off in your TikTok settings. Open the TikTok options and try again.`;

/**
 * Direct Post ("Post now"). The phone is never trusted: the creator is asked again here and every option is checked against that
 * answer before the post is opened. A refusal opens nothing. `video/init` is called once and never repeated.
 */
async function prepareDirect(c: AdapterCtx, accessToken: string, input: PrepareInput): Promise<PrepareResult> {
  if (!directOn(c)) throw directOff();
  const o = directOptions(input.options);
  if (input.caption.length > TIKTOK_TITLE_MAX) throw refuse(`TikTok captions can be up to ${TIKTOK_TITLE_MAX} characters.`);
  const info = await queryCreator(c, accessToken);
  if (!info.privacyOptions.includes(o.privacy)) throw refuse(PRIVACY_GONE);
  if (o.brandContent && o.privacy === "SELF_ONLY") throw refuse("Branded content visibility cannot be set to private.");
  if (o.allowComment && info.commentDisabled) throw refuse(turnedOff("Comments", "are"));
  if (o.allowDuet && info.duetDisabled) throw refuse(turnedOff("Duet", "is"));
  if (o.allowStitch && info.stitchDisabled) throw refuse(turnedOff("Stitch", "is"));
  if (input.durationSec > info.maxDurationSec) throw refuse(`This TikTok account can post videos up to ${lengthWords(info.maxDurationSec)}.`);
  const plan = chunkPlan(input.fileSize);
  const title = input.caption.trim();
  const data = await apiJson(await c.fetch(`${API}/v2/post/publish/video/init/`, {
    method: "POST", headers: authed(accessToken),
    body: JSON.stringify({
      post_info: { ...(title ? { title } : {}), privacy_level: o.privacy, disable_duet: !o.allowDuet, disable_comment: !o.allowComment, disable_stitch: !o.allowStitch, brand_content_toggle: o.brandContent, brand_organic_toggle: o.brandOrganic },
      source_info: { source: "FILE_UPLOAD", video_size: input.fileSize, chunk_size: plan.chunkSize, total_chunk_count: plan.totalChunkCount },
    }),
  }), true);
  if (typeof data.upload_url !== "string" || !data.upload_url || typeof data.publish_id !== "string" || !data.publish_id) throw new PlatformError("tiktok", 502, "TikTok did not return an upload address.");
  // The same pre-signed chunk upload as a draft. Once the last piece is in, TikTok posts by itself: `publishes` tells the phone that a lost last piece may be a live post.
  return { protocol: "tiktok-chunks", uploadUrl: data.upload_url, uploadHeaders: {}, chunkSize: plan.chunkSize, ref: { publishId: data.publish_id, direct: true },
    wait: { maxSeconds: 300, intervalSeconds: 5, resumeOnTimeout: false }, publishes: true };
}

export const tiktok: ServerAdapter = {
  id: "tiktok",
  secrets: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"],

  // TikTok's web flow has no PKCE (code_verifier is for mobile/desktop apps only); the client secret stays on the server and `state` protects the redirect.
  authUrl(c, { state }) {
    return `https://www.tiktok.com/v2/auth/authorize/?${new URLSearchParams({ client_key: key(c), response_type: "code", scope: directOn(c) ? `${SCOPES},${DIRECT_SCOPE}` : SCOPES, redirect_uri: c.redirectUri, state })}`;
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
    // Only this exact value posts directly; everything else is the draft below, unchanged.
    if (input.options.mode === "direct") return prepareDirect(c, accessToken, input);
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
  async creatorInfo(c, accessToken, grant) {
    if (!directOn(c)) throw directOff();
    if (knownToLackDirect(grant.scopes)) throw needsPermission();
    return queryCreator(c, accessToken);
  },
  isAuthError: (e) => AUTH_CODES.includes(e.reason ?? ""),
  // `access_denied` is the user's own "no" on TikTok's page; anything else is TikTok refusing the request (e.g. a scope the app does not have).
  connectError: (code) => (code === "access_denied" ? null : CONNECT_REFUSED),
};
