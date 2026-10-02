import { PlatformError } from "../errors.ts";
import type { AdapterCtx, PlatformId } from "../types.ts";
import { FORM, formBody } from "./http.ts";

/** Graph API version, pinned in one place (v25.0: released 2026-02-18, expires 2028-07-29). */
export const VERSION = "v25.0";
export const GRAPH = `https://graph.facebook.com/${VERSION}`;
/** Meta's upload host for Reels (Facebook) and resumable Instagram uploads. The only host a Page token may be sent to from the phone. */
export const RUPLOAD_HOST = "rupload.facebook.com";
export const META_SECRETS = ["META_APP_ID", "META_APP_SECRET"] as const;

const appId = (c: AdapterCtx) => c.env.get("META_APP_ID") ?? "";
const appSecret = (c: AdapterCtx) => c.env.get("META_APP_SECRET") ?? "";
const NAME: Partial<Record<PlatformId, string>> = { facebook: "Facebook", instagram: "Instagram" };
const nameOf = (p: PlatformId) => NAME[p] ?? "Meta";

/**
 * Graph error codes → our HTTP status (https://developers.facebook.com/docs/graph-api/guides/error-handling,
 * https://developers.facebook.com/docs/graph-api/overview/rate-limiting). Token codes reconnect; throttling and outages are temporary.
 */
const CODE_STATUS: Record<number, number> = {
  190: 401, 102: 401,
  4: 429, 17: 429, 32: 429, 613: 429, 341: 429, 80001: 429, 80005: 429,
  1: 503, 2: 503,
};
/** Params whose values are secrets: scrubbed from any text Meta echoes back. */
const SECRET_PARAMS = ["access_token", "client_secret", "fb_exchange_token", "code"];
const MIN_REDACT = 8;

type MetaErrorBody = { error?: { message?: unknown; code?: unknown; error_subcode?: unknown; error_user_msg?: unknown } };

/**
 * One Graph API call. `params` go in the query for GET and in a form body for POST, with `access_token` from `token`.
 * Errors keep Meta's own words (`error_user_msg`, else `message`), never the request URL (token endpoints carry the app secret in the query).
 */
export async function graph<T>(c: AdapterCtx, platform: PlatformId, path: string, init: { method?: "GET" | "POST"; token?: string; params?: Record<string, string> } = {}): Promise<T> {
  const method = init.method ?? "GET";
  const params: Record<string, string> = { ...(init.params ?? {}), ...(init.token !== undefined ? { access_token: init.token } : {}) };
  const qs = formBody(params);
  let res: Response;
  try {
    res = method === "GET"
      ? await c.fetch(qs ? `${GRAPH}${path}?${qs}` : `${GRAPH}${path}`, { method: "GET" })
      : await c.fetch(`${GRAPH}${path}`, { method: "POST", headers: FORM, body: qs });
  } catch {
    // A runtime's network error may quote the URL (and with it a token or the app secret): never pass it on.
    throw new PlatformError(platform, 503, `Couldn't reach ${nameOf(platform)}. Try again.`);
  }
  const text = await res.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  const err = typeof body === "object" && body !== null ? (body as MetaErrorBody).error : undefined;
  if (!res.ok || (typeof err === "object" && err !== null)) {
    const e = (typeof err === "object" && err !== null ? err : {}) as NonNullable<MetaErrorBody["error"]>;
    const code = typeof e.code === "number" ? e.code : typeof e.code === "string" && /^\d+$/.test(e.code) ? Number(e.code) : undefined;
    const raw = (typeof e.error_user_msg === "string" && e.error_user_msg) || (typeof e.message === "string" && e.message) || `Meta returned ${res.status}`;
    const status = (code !== undefined ? CODE_STATUS[code] : undefined) ?? (res.ok ? 400 : res.status);
    const pe = new PlatformError(platform, status, redact(raw, params));
    if (code !== undefined) pe.reason = String(code);
    throw pe;
  }
  return (body ?? {}) as T;
}

function redact(message: string, params: Record<string, string>): string {
  let out = message;
  for (const k of SECRET_PARAMS) {
    const v = params[k];
    if (v && v.length >= MIN_REDACT) out = out.split(v).join("[redacted]");
  }
  return out;
}

/**
 * Facebook Login dialog (https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow).
 * With Facebook Login for Business a configuration (`config_id`) replaces `scope`; Meta recommends not sending both
 * (https://developers.facebook.com/docs/facebook-login/facebook-login-for-business).
 */
export function metaAuthUrl(c: AdapterCtx, state: string, scopes: string[]): string {
  const q: Record<string, string> = { client_id: appId(c), redirect_uri: c.redirectUri, state, response_type: "code" };
  const configId = c.env.get("META_LOGIN_CONFIG_ID");
  if (configId) q.config_id = configId; else q.scope = scopes.join(",");
  return `https://www.facebook.com/${VERSION}/dialog/oauth?${new URLSearchParams(q)}`;
}

export interface MetaPage { id: string; name: string; accessToken: string; tasks: string[]; pictureUrl: string | null; instagram: { id: string; username: string; pictureUrl: string | null } | null }

const str = (v: unknown) => (typeof v === "string" && v ? v : null);
const pictureOf = (v: unknown) => str((v as { data?: { url?: unknown } } | null | undefined)?.data?.url);
function tokenOf(platform: PlatformId, b: { access_token?: unknown }): string {
  const t = str(b.access_token);
  if (!t) throw new PlatformError(platform, 502, `${nameOf(platform)} did not return a sign-in token.`);
  return t;
}

/**
 * Code → short-lived user token → long-lived user token → the user's Pages with their Page tokens.
 * Page tokens obtained with a long-lived user token do not expire
 * (https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived).
 */
export async function exchangeForPages(c: AdapterCtx, platform: PlatformId, code: string): Promise<MetaPage[]> {
  const short = tokenOf(platform, await graph<{ access_token?: unknown }>(c, platform, "/oauth/access_token", {
    params: { client_id: appId(c), redirect_uri: c.redirectUri, client_secret: appSecret(c), code },
  }));
  const long = tokenOf(platform, await graph<{ access_token?: unknown }>(c, platform, "/oauth/access_token", {
    params: { grant_type: "fb_exchange_token", client_id: appId(c), client_secret: appSecret(c), fb_exchange_token: short },
  }));
  // `picture` and `instagram_business_account` are Page fields (https://developers.facebook.com/docs/graph-api/reference/page/), expanded on the accounts edge.
  // Only the first 100 Pages are read; a person with more picks the Page in the Facebook dialog.
  const b = await graph<{ data?: unknown }>(c, platform, "/me/accounts", {
    token: long, params: { fields: "id,name,access_token,tasks,picture{url},instagram_business_account{id,username,profile_picture_url}", limit: "100" },
  });
  const rows = Array.isArray(b.data) ? (b.data as Array<Record<string, unknown>>) : [];
  return rows.flatMap((p): MetaPage[] => {
    const id = str(p?.id), accessToken = str(p?.access_token);
    if (!id || !accessToken) return [];
    const ig = (typeof p.instagram_business_account === "object" && p.instagram_business_account !== null ? p.instagram_business_account : null) as Record<string, unknown> | null;
    const igId = ig ? str(ig.id) : null;
    return [{
      id, name: str(p.name) ?? "", accessToken,
      tasks: Array.isArray(p.tasks) ? p.tasks.filter((t): t is string => typeof t === "string") : [],
      pictureUrl: pictureOf(p.picture),
      instagram: ig && igId ? { id: igId, username: str(ig.username) ?? "", pictureUrl: str(ig.profile_picture_url) } : null,
    }];
  });
}

const MAX_UPLOAD_URL = 2048;
/** Printable ASCII with no space and no backslash: nothing another URL parser (the phone's) could read differently. */
const PLAIN_URL = /^[\x21-\x5B\x5D-\x7E]+$/;

/**
 * The upload address and headers for the one-request upload to Meta's upload host
 * (https://developers.facebook.com/docs/video-api/guides/reels-publishing). The headers carry the token, so they are only
 * ever built for `https://rupload.facebook.com/…`, and only when the address is already in canonical form: the string that
 * was checked is the string returned, so no parser on the phone can read a different host. Anything else throws (no URL in the message).
 */
export function ruploadTarget(token: string, fileSize: number, rawUrl: unknown, platform: PlatformId = "facebook"): { uploadUrl: string; uploadHeaders: Record<string, string> } {
  const refuse = () => new PlatformError(platform, 502, "Meta returned an unexpected upload address.");
  if (typeof rawUrl !== "string" || rawUrl.length > MAX_UPLOAD_URL || !PLAIN_URL.test(rawUrl)) throw refuse();
  let u: URL;
  try { u = new URL(rawUrl); } catch { throw refuse(); }
  const exact = u.protocol === "https:" && u.hostname === RUPLOAD_HOST && u.port === "" && u.username === "" && u.password === "" && u.href === rawUrl;
  if (!exact) throw refuse();
  return { uploadUrl: u.href, uploadHeaders: { Authorization: `OAuth ${token}`, offset: "0", file_size: String(fileSize) } };
}

/** Token codes (190, 102), permission denied (10) and the permission range (200–299) need a new grant. */
export function metaIsAuthError(e: PlatformError): boolean {
  if (!e.reason || !/^\d+$/.test(e.reason)) return false;
  const code = Number(e.reason);
  return code === 190 || code === 102 || code === 10 || (code >= 200 && code <= 299);
}
