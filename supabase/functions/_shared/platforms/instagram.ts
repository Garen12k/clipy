import { PlatformError } from "../errors.ts";
import type { AdapterCtx, PublishResult, ServerAdapter } from "../types.ts";
import { exchangeForUserAndPages, graph, META_SECRETS, metaAuthUrl, metaIsAuthError, ruploadTarget } from "./meta.ts";

/**
 * Instagram API with Facebook Login for Business: the only route with a documented resumable (no-hosting) upload
 * (https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/content-publishing).
 */
const SCOPES = ["instagram_basic", "instagram_content_publish", "pages_show_list", "pages_read_engagement"];
const NO_IG = "No Instagram professional account is linked to your Facebook Page. Link one in Instagram (Settings → Account type and tools), then connect again.";
const NO_REF = "Instagram upload reference is missing.";
/** Reels caption limit (https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media/). */
const MAX_CAPTION = 2200;
/**
 * Instagram publishing codes Meta says to retry (https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/error-codes):
 * -1 server error / create failed, -2 download timeout, 24 container not found yet. Temporary, so the phone can Resume.
 */
const RETRY_CODES = new Set(["-1", "-2", "24"]);
/** 9007 / 2207027: "The media is not ready for publishing, please wait" — nothing was published; keep polling. */
const NOT_READY = "9007";

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** A Graph call whose Instagram-specific "try again" codes become temporary failures. */
async function ig<T>(c: AdapterCtx, path: string, init: Parameters<typeof graph>[3]): Promise<T> {
  try {
    return await graph<T>(c, "instagram", path, init);
  } catch (e) {
    if (e instanceof PlatformError && e.reason && RETRY_CODES.has(e.reason) && e.status < 500 && e.status !== 429) {
      const t = new PlatformError("instagram", 503, e.message);
      t.reason = e.reason;
      throw t;
    }
    throw e;
  }
}

type IgField = { instagram_business_account?: { id?: unknown; username?: unknown; profile_picture_url?: unknown } | null };
type IgAccount = { id: string; username: string; avatarUrl: string | null };
const IG_FIELDS = "instagram_business_account{id,username,profile_picture_url}";
const accountOf = (b: IgField | undefined): IgAccount | null => {
  const a = b?.instagram_business_account;
  const id = text(a?.id);
  return a && id ? { id, username: text(a.username) ?? "", avatarUrl: text(a.profile_picture_url) } : null;
};

/**
 * Meta's docs ask for a "User access token" for the Instagram calls; this adapter stores the Page token by default
 * (works in practice, undocumented). `META_IG_TOKEN_KIND=user` switches to the long-lived user token, without new code.
 */
const useUserToken = (c: AdapterCtx) => (c.env.get("META_IG_TOKEN_KIND") ?? "").trim().toLowerCase() === "user";

/**
 * The Instagram professional account, with either kind of token. With a Page token "me" is the Page and carries the field;
 * with a user token "me" is the User (no such field: absent, or Meta's #100 "nonexisting field"), so the Pages are read instead.
 */
async function igAccount(c: AdapterCtx, token: string): Promise<IgAccount> {
  let me: IgField | undefined;
  try {
    me = await ig<IgField>(c, "/me", { token, params: { fields: IG_FIELDS } });
  } catch (e) {
    if (!(e instanceof PlatformError && e.reason === "100")) throw e;
  }
  const direct = accountOf(me);
  if (direct) return direct;
  let b: { data?: unknown };
  try {
    b = await ig<{ data?: unknown }>(c, "/me/accounts", { token, params: { fields: IG_FIELDS, limit: "100" } });
  } catch (e) {
    // With a Page token, "me" is a Page and has no accounts edge (#100): there simply is no linked Instagram account.
    if (e instanceof PlatformError && e.reason === "100") throw new PlatformError("instagram", 400, NO_IG);
    throw e;
  }
  const rows = Array.isArray(b.data) ? (b.data as IgField[]) : [];
  for (const row of rows) {
    const a = accountOf(row && typeof row === "object" ? row : undefined);
    if (a) return a;
  }
  throw new PlatformError("instagram", 400, NO_IG);
}

/** Whole characters (code points), so an emoji is never cut in half. */
const cutCaption = (s: string) => Array.from(s).slice(0, MAX_CAPTION).join("");

type Container = { status_code?: unknown; status?: unknown };
const readContainer = (c: AdapterCtx, token: string, containerId: string) =>
  ig<Container>(c, `/${encodeURIComponent(containerId)}`, { token, params: { fields: "status_code,status" } });

function processingFailure(s: Container, code: "ERROR" | "EXPIRED"): PlatformError {
  // For ERROR, Meta documents `status` as an error subcode; it is passed on as is.
  const detail = code === "ERROR" ? text(s.status) : null;
  const e = new PlatformError("instagram", 400, "Instagram couldn't process this video." + (detail ? ` ${detail}` : ""));
  e.reason = code;
  return e;
}

/**
 * Shared by finalize and status, so it must be safe to run again: `media_publish` is only called when the container reports
 * `FINISHED`. Overlapping calls can still both try (the status may also lag a publish that just succeeded); a refused publish
 * is therefore answered as temporary, and a later run finds `PUBLISHED` (done) or `FINISHED` (publish again). Statuses: https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-container
 */
async function publishWhenReady(c: AdapterCtx, token: string, ref: Record<string, unknown>): Promise<PublishResult> {
  // Asking again cannot repair a missing reference. 502 with `platform_error`: the handlers do not mark the session failed
  // (only a 4xx is a rejection), but the phone treats `platform_error` after the upload as final, so Retry starts a fresh post.
  if (typeof ref.containerId !== "string" || !ref.containerId || typeof ref.igUserId !== "string" || !ref.igUserId) throw new PlatformError("instagram", 502, NO_REF, "platform_error");
  const s = await readContainer(c, token, ref.containerId);
  const code = s.status_code;
  // No status at all: never poll forever on it. Temporary, so the phone can ask again.
  if (typeof code !== "string" || !code) throw new PlatformError("instagram", 502, "Instagram did not report the upload's status.");
  if (code === "ERROR" || code === "EXPIRED") throw processingFailure(s, code);
  // An earlier publish succeeded but its answer was lost. The container does not give the media id, so no link.
  if (code === "PUBLISHED") return { status: "done", url: null };
  if (code !== "FINISHED") return { status: "processing" };

  let published: { id?: unknown };
  try {
    published = await ig<{ id?: unknown }>(c, `/${encodeURIComponent(ref.igUserId)}/media_publish`, { method: "POST", token, params: { creation_id: ref.containerId } });
  } catch (e) {
    if (!(e instanceof PlatformError)) throw e;
    if (e.reason === NOT_READY) return { status: "processing" };
    if (e.status === 401 || metaIsAuthError(e)) throw e;
    // A refused publish is never final here: another call (an overlapping poll, or a request the phone gave up on) may be
    // publishing or have published this container, and Meta's status can lag behind. Look once: PUBLISHED is done,
    // ERROR/EXPIRED is the container's own failure. Otherwise (still FINISHED, or the look itself failed) answer with a
    // temporary error carrying Meta's words, so the app's Resume asks again and a later check finds PUBLISHED. A container
    // that truly cannot be published expires after 24 hours and then fails for good (EXPIRED above).
    const temporary = () => {
      const t = new PlatformError("instagram", 503, e.message);
      t.reason = e.reason;
      return t;
    };
    let again: Container;
    try { again = await readContainer(c, token, ref.containerId); } catch { throw temporary(); }
    if (again.status_code === "PUBLISHED") return { status: "done", url: null };
    if (again.status_code === "IN_PROGRESS") return { status: "processing" };
    if (again.status_code === "ERROR" || again.status_code === "EXPIRED") throw processingFailure(again, again.status_code);
    throw temporary();
  }
  const mediaId = text(published.id);
  if (!mediaId) return { status: "done", url: null };
  try {
    const m = await ig<{ permalink?: unknown }>(c, `/${encodeURIComponent(mediaId)}`, { token, params: { fields: "permalink" } });
    return { status: "done", url: text(m.permalink) };
  } catch {
    // The Reel is already published: a missing link must not turn that into a failure (or a second publish).
    return { status: "done", url: null };
  }
}

export const instagram: ServerAdapter = {
  id: "instagram",
  secrets: META_SECRETS,

  authUrl: (c, { state }) => metaAuthUrl(c, state, SCOPES),
  async exchange(c, { code }) {
    const got = await exchangeForUserAndPages(c, "instagram", code);
    const pages = got.pages.filter((p) => p.instagram);
    // media_publish needs MANAGE or CREATE_CONTENT on the Page (https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media_publish).
    const page = pages.find((p) => p.tasks.includes("CREATE_CONTENT") || p.tasks.includes("MANAGE")) ?? pages[0];
    if (!page) throw new PlatformError("instagram", 400, NO_IG);
    if (useUserToken(c)) {
      // The long-lived user token lasts about 60 days and cannot be refreshed here: then Reconnect.
      const expiresAt = got.userTokenExpiresIn !== null ? new Date(Date.now() + got.userTokenExpiresIn * 1000).toISOString() : null;
      return { accessToken: got.userToken, refreshToken: null, expiresAt, scopes: SCOPES.join(",") };
    }
    // A Page token from a long-lived user token does not expire, so there is nothing to refresh.
    return { accessToken: page.accessToken, refreshToken: null, expiresAt: null, scopes: SCOPES.join(",") };
  },
  async refresh() { throw new PlatformError("instagram", 401, "Reconnect Instagram in Accounts."); },
  // A Page token cannot withdraw the user's grant; the README says how to remove the app in Facebook settings.
  async revoke() {},
  async profile(c, token) {
    const a = await igAccount(c, token);
    return { accountId: a.id, displayName: `@${a.username}`, avatarUrl: a.avatarUrl };
  },
  async prepare(c, token, input) {
    const { id: igUserId } = await igAccount(c, token);
    const r = await ig<{ id?: unknown; uri?: unknown }>(c, `/${encodeURIComponent(igUserId)}/media`, {
      method: "POST", token, params: { media_type: "REELS", upload_type: "resumable", caption: cutCaption(input.caption), share_to_feed: "true" },
    });
    const containerId = text(r.id);
    if (!containerId || !text(r.uri)) throw new PlatformError("instagram", 502, "Instagram did not return an upload address.");
    // The headers carry the Page token: only ever for Meta's own upload host, and only the checked (canonical) address is used from here on.
    const { uploadUrl, uploadHeaders } = ruploadTarget(token, input.fileSize, r.uri, "instagram");
    // One request carries the whole file (the only form Meta documents). Processing can take minutes: running out of time means Resume.
    return { protocol: "meta-rupload", uploadUrl, uploadHeaders, chunkSize: input.fileSize, ref: { containerId, igUserId }, wait: { maxSeconds: 600, resumeOnTimeout: true } };
  },
  finalize: (c, token, { ref }) => publishWhenReady(c, token, ref),
  status: (c, token, ref) => publishWhenReady(c, token, ref),
  isAuthError: metaIsAuthError,
};
