import { PlatformError } from "../errors.ts";
import type { AdapterCtx, ServerAdapter, Tokens } from "../types.ts";
import { FORM, formBody, readJson } from "./http.ts";

const SCOPES = "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
/** A multiple of 256 KiB, as the resumable protocol requires for every chunk but the last. */
const CHUNK = 8 * 1024 * 1024;
const PRIVACY = ["public", "unlisted", "private"];
const VIDEO_ID = /^[A-Za-z0-9_-]{6,20}$/;
const TITLE_MAX_CHARS = 100;
const DESCRIPTION_MAX_BYTES = 5000;

const id = (c: AdapterCtx) => c.env.get("YOUTUBE_CLIENT_ID") ?? "";
const secret = (c: AdapterCtx) => c.env.get("YOUTUBE_CLIENT_SECRET") ?? "";
const oauthErr = (b: unknown) => (b as { error_description?: string; error?: string } | null)?.error_description ?? (b as { error?: string } | null)?.error;
const apiErr = (b: unknown) => (b as { error?: { message?: string } } | null)?.error?.message;
type GoogleError = { error?: { errors?: Array<{ reason?: unknown }>; details?: Array<{ reason?: unknown }> } } | null;
/** Google's reason: `error.errors[].reason` (e.g. insufficientPermissions, quotaExceeded), else `error.details[].reason` (e.g. ACCESS_TOKEN_SCOPE_INSUFFICIENT). */
const apiReason = (b: unknown) => {
  const e = (b as GoogleError)?.error;
  const r = [...(Array.isArray(e?.errors) ? e.errors : []), ...(Array.isArray(e?.details) ? e.details : [])].find((x) => typeof x?.reason === "string")?.reason;
  return typeof r === "string" ? r : undefined;
};
const SCOPE_REASONS = ["insufficientPermissions", "ACCESS_TOKEN_SCOPE_INSUFFICIENT"];

/** YouTube rejects angle brackets in titles and descriptions. A title is one line; a description keeps its line breaks. */
const cleanLine = (s: string) => s.replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
const cleanText = (s: string) => s.replace(/[<>]/g, "").replace(/[^\S\n]+/g, " ").replace(/ *\n */g, "\n").trim();
/** Cuts by whole characters (never half an emoji). */
const takeChars = (s: string, n: number) => Array.from(s).slice(0, n).join("");
function takeBytes(s: string, max: number): string {
  const enc = new TextEncoder();
  if (enc.encode(s).length <= max) return s;
  let out = "";
  for (const ch of s) { if (enc.encode(out + ch).length > max) break; out += ch; }
  return out;
}

interface TokenBody { access_token: string; refresh_token?: string; expires_in?: number; scope?: string }
const toTokens = (b: TokenBody): Tokens => ({
  accessToken: b.access_token, refreshToken: b.refresh_token ?? null,
  expiresAt: typeof b.expires_in === "number" ? new Date(Date.now() + b.expires_in * 1000).toISOString() : null, scopes: b.scope ?? "",
});

export const youtube: ServerAdapter = {
  id: "youtube",
  secrets: ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET"],

  // Google documents PKCE only for native clients; this is a confidential web client, so state + secret protect the flow.
  authUrl(c, { state }) {
    const q = new URLSearchParams({ client_id: id(c), redirect_uri: c.redirectUri, response_type: "code", scope: SCOPES, access_type: "offline", prompt: "consent", include_granted_scopes: "true", state });
    return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
  },
  async exchange(c, { code }) {
    const res = await c.fetch(TOKEN_URL, { method: "POST", headers: FORM, body: formBody({ code, client_id: id(c), client_secret: secret(c), redirect_uri: c.redirectUri, grant_type: "authorization_code" }) });
    return toTokens(await readJson<TokenBody>("youtube", res, oauthErr));
  },
  async refresh(c, refreshToken) {
    const res = await c.fetch(TOKEN_URL, { method: "POST", headers: FORM, body: formBody({ refresh_token: refreshToken, client_id: id(c), client_secret: secret(c), grant_type: "refresh_token" }) });
    return toTokens(await readJson<TokenBody>("youtube", res, oauthErr));
  },
  async revoke(c, t) {
    await c.fetch("https://oauth2.googleapis.com/revoke", { method: "POST", headers: FORM, body: formBody({ token: t.refreshToken ?? t.accessToken }) });
  },
  async profile(c, accessToken) {
    const res = await c.fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers: { Authorization: `Bearer ${accessToken}` } });
    const b = await readJson<{ items?: Array<{ id: string; snippet: { title: string; thumbnails?: { default?: { url?: string } } } }> }>("youtube", res, apiErr, apiReason);
    const ch = b?.items?.[0];
    if (!ch) throw new PlatformError("youtube", 400, "This Google account has no YouTube channel yet.");
    return { accountId: ch.id, displayName: ch.snippet.title, avatarUrl: ch.snippet.thumbnails?.default?.url ?? null };
  },
  async prepare(c, accessToken, input) {
    const o = input.options as { title?: unknown; privacy?: unknown };
    const description = takeBytes(cleanText(input.caption), DESCRIPTION_MAX_BYTES);
    const title = takeChars(cleanLine(typeof o.title === "string" ? o.title : "") || cleanLine(input.caption) || "Clipy video", TITLE_MAX_CHARS);
    const privacyStatus = PRIVACY.includes(o.privacy as string) ? (o.privacy as string) : "public";
    const res = await c.fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Length": String(input.fileSize), "X-Upload-Content-Type": input.mimeType },
      body: JSON.stringify({ snippet: { title, description, categoryId: "22" }, status: { privacyStatus, selfDeclaredMadeForKids: false } }),
    });
    if (!res.ok) await readJson("youtube", res, apiErr, apiReason);
    const uploadUrl = res.headers.get("Location");
    if (!uploadUrl) throw new PlatformError("youtube", 502, "YouTube did not return an upload address.");
    // Whether the session URL alone authorises the upload is undocumented for YouTube; this switch sends a short-lived token to the phone instead.
    const uploadHeaders: Record<string, string> = c.env.get("YOUTUBE_UPLOAD_TOKEN_ON_PHONE") === "true" ? { Authorization: `Bearer ${accessToken}` } : {};
    return { protocol: "google-resumable", uploadUrl, uploadHeaders, chunkSize: CHUNK, ref: {} };
  },
  async finalize(_c, _t, { clientResult }) {
    let videoId: unknown;
    try { videoId = (JSON.parse(clientResult ?? "") as { id?: unknown } | null)?.id; } catch { /* handled below */ }
    if (typeof videoId !== "string" || !VIDEO_ID.test(videoId)) throw new PlatformError("youtube", 502, "YouTube did not confirm the upload.");
    return { status: "done", url: `https://youtu.be/${videoId}` };
  },
  async status() { return { status: "done", url: null }; },
  // A 403 for a missing permission (the user unticked the upload box at consent) needs a new grant; a quota 403 does not.
  isAuthError(e) {
    if (e.status !== 403 || /quota|limit/i.test(e.reason ?? "")) return false;
    return SCOPE_REASONS.includes(e.reason ?? "") || /insufficient/i.test(e.message);
  },
};
