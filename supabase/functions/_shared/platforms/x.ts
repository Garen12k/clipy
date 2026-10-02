import { isTemporaryStatus, PlatformError } from "../errors.ts";
import type { AdapterCtx, PublishResult, ServerAdapter, Tokens } from "../types.ts";
import { FORM, formBody } from "./http.ts";

/**
 * X (https://docs.x.com, fetched 2026-10-02). NOTHING here has run against live X yet (no developer app, no credits).
 * - OAuth 2.0 authorization code + PKCE, confidential client (Basic client auth): .../authentication/oauth-2-0/user-access-token
 * - Chunked video upload v2 (initialize → append → finalize → status): https://docs.x.com/x-api/media/quickstart/media-upload-chunked
 * - Create post: https://docs.x.com/x-api/posts/create-post
 */
const API = "https://api.x.com";
const SCOPES = "tweet.read tweet.write users.read media.write offline.access";
/** X asks for segments of at most 5 MB (server max 8 MB); 4 MiB also fits `MAX_RELAY_BYTES`, so one relayed piece is one segment. */
export const X_CHUNK = 4 * 1024 * 1024;
export const X_MAX_WEIGHT = 280;
const NO_REF = "X upload reference is missing.";
const BUSY = "X is having trouble — try again.";
/** Media ids are decimal strings of up to 19 digits (finalize/status reference pages); anything else never reaches a URL. */
const MEDIA_ID = /^[0-9]{1,19}$/;

const clientId = (c: AdapterCtx) => c.env.get("X_CLIENT_ID") ?? "";
const clientSecret = (c: AdapterCtx) => c.env.get("X_CLIENT_SECRET") ?? "";
/** Confidential-client auth, as X's examples show it. Only ever sent as a request header, never logged or put in an error. */
const basic = (c: AdapterCtx) => `Basic ${btoa(`${clientId(c)}:${clientSecret(c)}`)}`;
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const jsonHeaders = (token: string) => ({ ...bearer(token), "Content-Type": "application/json" });
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const obj = (v: unknown) => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/**
 * X's errors: problem JSON `{ title, detail, type, status }` (response-codes-and-errors page), the same problems inside an
 * `errors` array (the API reference's default response), the older `errors[0].message`, or OAuth's `{ error, error_description }`.
 * The text shown is X's own (detail, then title, then message); the reason is the last path segment of `type` (or the OAuth code).
 */
function describe(body: unknown): { message?: string; reason?: string } {
  const b = obj(body);
  const first = obj(Array.isArray(b.errors) ? b.errors[0] : undefined);
  const type = str(b.type) ?? str(first.type);
  const reason = type && type !== "about:blank" ? type.split("/").pop() : str(b.error);
  return { message: str(b.detail) ?? str(b.title) ?? str(first.detail) ?? str(first.title) ?? str(first.message) ?? str(b.error_description) ?? str(b.error), reason };
}

/** Reads X's answer; a non-2xx becomes a PlatformError with X's status and words (the handlers classify the status). */
async function xJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  if (!res.ok) {
    const { message, reason } = describe(body);
    const e = new PlatformError("x", res.status, message ?? (isTemporaryStatus(res.status) ? BUSY : `X returned an error (${res.status}).`));
    e.reason = reason;
    throw e;
  }
  return obj(body);
}

async function tokenCall(c: AdapterCtx, params: Record<string, string>): Promise<Tokens> {
  const b = await xJson(await c.fetch(`${API}/2/oauth2/token`, { method: "POST", headers: { ...FORM, Authorization: basic(c) }, body: formBody(params) }));
  if (typeof b.error === "string") {
    const e = new PlatformError("x", 400, str(b.error_description) ?? b.error);
    e.reason = b.error;
    throw e;
  }
  if (!str(b.access_token)) throw new PlatformError("x", 502, "X did not return a sign-in token.");
  return {
    accessToken: String(b.access_token),
    refreshToken: str(b.refresh_token) ?? null,
    expiresAt: typeof b.expires_in === "number" ? new Date(Date.now() + b.expires_in * 1000).toISOString() : null,
    scopes: str(b.scope) ?? "",
  };
}

function mediaIdOf(ref: Record<string, unknown>): string {
  // Asking again cannot repair a missing reference: final (`platform_error`), so the phone starts a fresh upload.
  if (typeof ref.mediaId !== "string" || !MEDIA_ID.test(ref.mediaId)) throw new PlatformError("x", 502, NO_REF, "platform_error");
  return ref.mediaId;
}

// ---------- X's weighted character count ----------

/**
 * X's counting rule (twitter-text v3 config): these ranges weigh 1, every other code point 2, and each link 23 (t.co).
 * Simplifications, all on the safe side for the 280 limit: emoji sequences count 2 per code point (X counts a whole sequence
 * as 2); no Unicode normalisation; the link matcher below is broader than X's. The phone has the same rule
 * (src/publish/adapters/x.ts) pinned to the same test vectors.
 */
const LIGHT: ReadonlyArray<readonly [number, number]> = [[0x0000, 0x10ff], [0x2000, 0x200d], [0x2010, 0x201f], [0x2032, 0x2037]];
const URL_WEIGHT = 23;
/**
 * A link: `http(s)://…`, or a bare domain `label(.label)*.tld` (optionally followed by a path) whose last label is 2+ letters.
 * Conservative on purpose — X counts bare domains as links too, and bills a post containing a link at the "with URL" price:
 * so "hello.World" (a missing space after a full stop) and the domain of an email address ("a@b.com") count as links, while
 * "1.2" or "e.g." do not. Group 2 is the character before a bare domain (no lookbehind, so the phone's engine can run the
 * same expression); trailing `.,;:!?)]}'"` is not part of the link and is counted as text.
 */
const LINK = /(https?:\/\/\S+)|(^|[^\w.-])((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?![\w-])(?:\/\S*)?)/gi;
const TRAILING = /[.,;:!?)\]}'"]+$/;
const weightOf = (cp: number) => (LIGHT.some(([lo, hi]) => cp >= lo && cp <= hi) ? 1 : 2);

/** The text as plain runs and links, in order. */
function pieces(text: string): Array<{ link: boolean; text: string }> {
  const out: Array<{ link: boolean; text: string }> = [];
  let at = 0;
  for (const m of text.matchAll(LINK)) {
    const start = m.index! + (m[1] ? 0 : m[2].length);
    const link = (m[1] ?? m[3]).replace(TRAILING, "");
    if (!link) continue;
    if (start > at) out.push({ link: false, text: text.slice(at, start) });
    out.push({ link: true, text: link });
    at = start + link.length; // trimmed punctuation goes back to the following text
  }
  if (at < text.length) out.push({ link: false, text: text.slice(at) });
  return out;
}

/** True when X would count (and bill) part of the text as a link — same matcher as weightedLength. */
export function hasLink(text: string): boolean { return pieces(text).some((p) => p.link); }

export function weightedLength(text: string): number {
  let n = 0;
  for (const p of pieces(text)) {
    if (p.link) n += URL_WEIGHT;
    else for (const ch of p.text) n += weightOf(ch.codePointAt(0)!);
  }
  return n;
}

/** The longest start of `text` that weighs at most `max`; never splits a link, a code point or a grapheme (emoji sequence, accent). */
export function cutToWeighted(text: string, max: number): string {
  let n = 0, out = "";
  for (const p of pieces(text)) {
    if (p.link) {
      if (n + URL_WEIGHT > max) return wholeGraphemes(text, out);
      n += URL_WEIGHT; out += p.text;
      continue;
    }
    for (const ch of p.text) {
      const w = weightOf(ch.codePointAt(0)!);
      if (n + w > max) return wholeGraphemes(text, out);
      n += w; out += ch;
    }
  }
  return out;
}

/** Cuts `prefix` (a start of `text`) back to the last grapheme boundary, so no half emoji or bare base letter is sent. */
function wholeGraphemes(text: string, prefix: string): string {
  const Segmenter = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (Segmenter) {
    let end = 0;
    for (const g of new Segmenter(undefined, { granularity: "grapheme" }).segment(text)) {
      if (g.index + g.segment.length > prefix.length) break;
      end = g.index + g.segment.length;
    }
    return prefix.slice(0, end);
  }
  // No Segmenter: at least drop a trailing lone surrogate, zero-width joiner or combining mark.
  return prefix.replace(/(?:[\uD800-\uDBFF]|‍|\p{M})+$/u, "");
}

// ---------- upload ----------

const boundary = () => `clipy-${Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("")}`;

/**
 * One append request as multipart/form-data (`segment_index`, then `media`), built by hand so it is byte-for-byte the same in
 * Node and Deno and the chunk is copied exactly once. A fresh random boundary (128 bits) per request; fetch sets Content-Length.
 */
export function appendBody(segmentIndex: number, media: Uint8Array): { body: Uint8Array<ArrayBuffer>; contentType: string } {
  const b = boundary();
  const enc = new TextEncoder();
  const head = enc.encode(`--${b}\r\nContent-Disposition: form-data; name="segment_index"\r\n\r\n${segmentIndex}\r\n--${b}\r\nContent-Disposition: form-data; name="media"; filename="segment"\r\nContent-Type: application/octet-stream\r\n\r\n`);
  const tail = enc.encode(`\r\n--${b}--\r\n`);
  const body = new Uint8Array(head.length + media.length + tail.length);
  body.set(head, 0);
  body.set(media, head.length);
  body.set(tail, head.length + media.length);
  return { body, contentType: `multipart/form-data; boundary=${b}` };
}

type ProcessingInfo = { state?: unknown; error?: { message?: unknown } } | undefined;
const processingOf = (b: Record<string, unknown>): ProcessingInfo => {
  const p = obj(b.data).processing_info;
  return typeof p === "object" && p !== null ? (p as ProcessingInfo) : undefined;
};

async function readStatus(c: AdapterCtx, token: string, mediaId: string): Promise<ProcessingInfo> {
  return processingOf(await xJson(await c.fetch(`${API}/2/media/upload?${new URLSearchParams({ command: "STATUS", media_id: mediaId })}`, { headers: bearer(token) })));
}

const UNCONFIRMED = "X didn't confirm the post. It may already be on your profile — check X before posting again.";
/** The post may or may not exist. 409 is a final rejection for the handlers (a 4xx other than 401/408/429): the session fails. */
const unconfirmed = () => { const e = new PlatformError("x", 409, UNCONFIRMED); e.reason = "post_unconfirmed"; return e; };

/**
 * Creates the post — called only from finalize/status, which the handlers serialise with a claim; never retried here.
 * Clipy must never create a second post, and never say "done" without knowing a post exists. So the outcome is classified:
 * - 2xx with `data.id`                     → done, with the link;
 * - HTTP 401                               → not accepted: reconnect (the handlers' rule);
 * - HTTP 429                               → not accepted: temporary, Resume may try again;
 * - any other definite 4xx (incl. X's duplicate-content 403) → not accepted: final, in X's words;
 * - UNKNOWN — the request threw (network), HTTP 408, any 5xx (or other non-2xx), a 2xx without an id or unreadable
 *   → FINAL 409 "check X before posting again". Never temporary: a temporary error would let Resume post a second time.
 */
async function createPost(c: AdapterCtx, token: string, ref: Record<string, unknown>, mediaId: string): Promise<PublishResult> {
  const text = cutToWeighted(typeof ref.text === "string" ? ref.text : "", X_MAX_WEIGHT);
  let res: Response;
  try {
    res = await c.fetch(`${API}/2/tweets`, { method: "POST", headers: jsonHeaders(token), body: JSON.stringify({ ...(text ? { text } : {}), media: { media_ids: [mediaId] } }) });
  } catch { throw unconfirmed(); }
  const definiteRefusal = res.status >= 400 && res.status < 500 && res.status !== 408;
  if (!res.ok && !definiteRefusal) throw unconfirmed();
  let b: Record<string, unknown>;
  try { b = await xJson(res); }
  catch (e) {
    // 401, 429, other 4xx: X's own status and words (the status alone is the answer if the body could not be read).
    if (definiteRefusal) throw e instanceof PlatformError ? e : new PlatformError("x", res.status, `X returned an error (${res.status}).`);
    throw unconfirmed(); // the 2xx body could not be read
  }
  const id = str(obj(b.data).id);
  if (!id) throw unconfirmed(); // X can answer 2xx with only `errors`
  return { status: "done", url: `https://x.com/i/status/${encodeURIComponent(id)}` };
}

async function publishWhenReady(c: AdapterCtx, token: string, ref: Record<string, unknown>, mediaId: string, info: ProcessingInfo): Promise<PublishResult> {
  const state = info?.state;
  if (state === undefined || state === "succeeded") return createPost(c, token, ref, mediaId);
  if (state === "failed") {
    // `processing_info.error.message` is the v1.1 shape; the v2 reference lists no error field (UNVERIFIED).
    const detail = str(info?.error?.message);
    const e = new PlatformError("x", 400, `X couldn't process this video.${detail ? ` ${detail}` : ""}`);
    e.reason = "processing_failed";
    throw e;
  }
  return { status: "processing" }; // pending, in_progress (or a state we don't know yet: keep asking)
}

export const x: ServerAdapter = {
  id: "x",
  secrets: ["X_CLIENT_ID", "X_CLIENT_SECRET"],

  authUrl(c, { state, codeChallenge }) {
    return `https://x.com/i/oauth2/authorize?${new URLSearchParams({
      response_type: "code", client_id: clientId(c), redirect_uri: c.redirectUri, scope: SCOPES, state, code_challenge: codeChallenge, code_challenge_method: "S256",
    })}`;
  },
  // The code is valid for 30 seconds: the callback exchanges it at once.
  exchange: (c, { code, codeVerifier }) => tokenCall(c, { code, grant_type: "authorization_code", redirect_uri: c.redirectUri, code_verifier: codeVerifier }),
  // X refresh tokens are single-use (X developer forum; not stated in the docs): the new one always replaces the stored one.
  refresh: (c, refreshToken) => tokenCall(c, { grant_type: "refresh_token", refresh_token: refreshToken }),
  async revoke(c, t) {
    // Best effort. X's example revokes with `token` only; `token_type_hint` is RFC 7009 (UNVERIFIED that X reads it).
    const [token, hint] = t.refreshToken ? [t.refreshToken, "refresh_token"] : [t.accessToken, "access_token"];
    try { await c.fetch(`${API}/2/oauth2/revoke`, { method: "POST", headers: { ...FORM, Authorization: basic(c) }, body: formBody({ token, token_type_hint: hint }) }); }
    catch { /* the user can also remove Clipy under Settings → Connected apps on X */ }
  },
  async profile(c, token) {
    const d = obj((await xJson(await c.fetch(`${API}/2/users/me?user.fields=profile_image_url`, { headers: bearer(token) }))).data);
    const id = str(d.id), username = str(d.username);
    if (!id || !username) throw new PlatformError("x", 502, "X did not return the account.");
    return { accountId: id, displayName: `@${username}`, avatarUrl: str(d.profile_image_url) ?? null };
  },
  async prepare(c, token, input) {
    const b = await xJson(await c.fetch(`${API}/2/media/upload/initialize`, {
      method: "POST", headers: jsonHeaders(token), body: JSON.stringify({ media_type: input.mimeType, total_bytes: input.fileSize, media_category: "tweet_video" }),
    }));
    const mediaId = str(obj(b.data).id);
    if (!mediaId || !MEDIA_ID.test(mediaId)) throw new PlatformError("x", 502, "X did not return an upload id.");
    // The status path only sees the ref, so the post text (already cut to X's limit) travels in it. The token never goes to the phone.
    return { protocol: "relay", uploadUrl: null, uploadHeaders: {}, chunkSize: X_CHUNK, ref: { mediaId, text: cutToWeighted(input.caption, X_MAX_WEIGHT) }, wait: { maxSeconds: 300, intervalSeconds: 5, resumeOnTimeout: true } };
  },
  async relayChunk(c, token, ref, { offset, total, body }) {
    const mediaId = mediaIdOf(ref);
    if (offset % X_CHUNK !== 0) throw new PlatformError("x", 400, "Unexpected upload position.");
    // Every piece but the last is exactly one segment; a short piece in the middle would leave a gap in the video.
    if (body.length !== X_CHUNK && offset + body.length !== total) throw new PlatformError("x", 400, "Unexpected upload piece size.");
    const { body: multipart, contentType } = appendBody(offset / X_CHUNK, body);
    await xJson(await c.fetch(`${API}/2/media/upload/${mediaId}/append`, { method: "POST", headers: { ...bearer(token), "Content-Type": contentType }, body: multipart }));
    return { nextOffset: offset + body.length };
  },
  async finalize(c, token, { ref }) {
    const mediaId = mediaIdOf(ref);
    let info: ProcessingInfo;
    try {
      info = processingOf(await xJson(await c.fetch(`${API}/2/media/upload/${mediaId}/finalize`, { method: "POST", headers: bearer(token) })));
    } catch (e) {
      if (!(e instanceof PlatformError) || e.status === 401 || isTemporaryStatus(e.status)) throw e;
      // Refused. An earlier finalize may have been accepted with its answer lost (the phone retried): look once. Only an upload
      // X reports as being (or having been) processed goes on; otherwise the refusal stands.
      const seen = await readStatus(c, token, mediaId).catch(() => undefined);
      if (typeof seen?.state !== "string") throw e;
      info = seen;
    }
    return publishWhenReady(c, token, ref, mediaId, info);
  },
  async status(c, token, ref) {
    const mediaId = mediaIdOf(ref);
    return publishWhenReady(c, token, ref, mediaId, await readStatus(c, token, mediaId));
  },
  // No isAuthError: X's 403s (client-forbidden, unsupported-authentication, no credits) are developer-account problems the user
  // must fix on X, shown in X's words; only an HTTP 401 means "reconnect".
};
