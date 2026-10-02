# Phase 4B — TikTok (Upload to Inbox) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add TikTok to the posting pipeline built in 4A: connect a TikTok account, then send a video straight from the phone to the user's TikTok inbox, where they finish the post inside TikTok.

**Architecture:** One server adapter (`platforms/tiktok.ts`) and one client adapter (`adapters/tiktok.ts`) plug into the existing contracts. TikTok's upload URL is pre-signed, so the phone uploads directly with a new client upload protocol, `tiktok-chunks` (sequential `PUT`s with `Content-Range`; `206` = more, `201` = complete). The server opens the inbox upload (`/v2/post/publish/inbox/video/init/`) and reads the post status (`/v2/post/publish/status/fetch/`).

**Tech Stack:** as 4A — Supabase Edge Functions logic in plain TypeScript (Jest, Node), Expo SDK 57 app (`src/publish/`), RNTL v14.

**Spec:** `docs/superpowers/specs/2026-10-02-phase-4-direct-posting-design.md` (§10 overrides). Research with source URLs: `docs/superpowers/research/p4-research-tiktok.md`.

## Global Constraints

- **Unverified against live TikTok** (no developer app exists). Before coding, re-fetch each TikTok doc page cited in the research note for the endpoint you touch and correct this plan where it differs; list every correction and URL in the task report.
- **Inbox route only** (scope `video.upload` + `user.info.basic`). Direct Post (`video.publish`: privacy picker, interaction toggles, consent text, creator-info query) is out of scope until the app is audited — TikTok restricts un-audited Direct Post to private accounts and private posts. No caption is sent: the user writes it in TikTok.
- Server adapter rules from 4A: web-standard APIs only, `.ts` import extensions, no `Deno.*`; tokens never in a response or log; platform error text surfaced verbatim (TikTok's `error.message`, falling back to `error.code`); an HTTP 401 or `access_token_invalid` / `scope_not_authorized` means reconnect.
- TikTok refresh tokens rotate: `refresh` must return the new refresh token so it is saved.
- Chunk plan must match TikTok's rule exactly on both sides: `chunk_size = min(10 MiB, video_size)`, `total_chunk_count = max(1, floor(video_size / chunk_size))`, every chunk is `chunk_size` bytes except the last, which carries the remainder.
- No retry may re-upload a video that finished uploading (4A rule) — after the upload completes, failures stay resumable.
- UI from the kit and theme only; `src/__tests__/noHexLiterals.test.ts` stays green. Expo Go safe; no new dependencies.
- Windows: PowerShell tool, no `&&`, `npx.cmd`. Checks: `npm run typecheck`, `npm test` (app + server), `npx.cmd expo-doctor`.
- `git add` explicit paths only. Every commit message ends with exactly `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

### Task 1: TikTok server adapter

**Files:**
- Create: `supabase/functions/_shared/platforms/tiktok.ts`, `supabase/functions/_shared/__tests__/tiktok.test.ts`
- Modify: `supabase/functions/_shared/types.ts` (`UploadProtocol` gains `"tiktok-chunks"`), `supabase/functions/_shared/platforms/registry.ts`, `supabase/README.md` (TikTok section)

**Interfaces (produced):** `tiktok: ServerAdapter`; `UploadProtocol = "google-resumable" | "relay" | "tiktok-chunks"`; `TIKTOK_CHUNK = 10 * 1024 * 1024`; `chunkPlan(videoSize: number): { chunkSize: number; totalChunkCount: number }`.

- [ ] **Step 1: Failing tests** — `__tests__/tiktok.test.ts` (reuse the `ctx(responses, env)` fake-fetch helper pattern from `youtube.test.ts`; env `TIKTOK_CLIENT_KEY: "ck"`, `TIKTOK_CLIENT_SECRET: "cs"`):

```ts
test("authUrl uses the web flow with comma-separated scopes", () => {
  const u = new URL(tiktok.authUrl(ctx([]).ctx, { state: "st", codeChallenge: "unused" }));
  expect(u.origin + u.pathname).toBe("https://www.tiktok.com/v2/auth/authorize/");
  expect(Object.fromEntries(u.searchParams)).toEqual({ client_key: "ck", response_type: "code", scope: "user.info.basic,video.upload", redirect_uri: REDIRECT, state: "st" });
});

test("exchange and refresh map tokens; refresh returns the rotated refresh token", async () => {
  const a = ctx([ok({ access_token: "at", refresh_token: "rt", expires_in: 86400, scope: "user.info.basic,video.upload", open_id: "o1" })]);
  const t = await tiktok.exchange(a.ctx, { code: "c", codeVerifier: "unused" });
  expect(a.calls[0].url).toBe("https://open.tiktokapis.com/v2/oauth/token/");
  expect(form(a.calls[0].init)).toEqual({ client_key: "ck", client_secret: "cs", code: "c", grant_type: "authorization_code", redirect_uri: REDIRECT });
  expect(t).toMatchObject({ accessToken: "at", refreshToken: "rt", scopes: "user.info.basic,video.upload" });
  const b = ctx([ok({ access_token: "at2", refresh_token: "rt2", expires_in: 86400, scope: "s" })]);
  expect(await tiktok.refresh(b.ctx, "rt")).toMatchObject({ accessToken: "at2", refreshToken: "rt2" });
  expect(form(b.calls[0].init)).toEqual({ client_key: "ck", client_secret: "cs", grant_type: "refresh_token", refresh_token: "rt" });
});

test("token errors arrive flat (even with HTTP 200) and keep TikTok's description", async () => {
  const flat = { error: "invalid_grant", error_description: "Authorization code is expired.", log_id: "x" };
  await expect(tiktok.exchange(ctx([ok(flat)]).ctx, { code: "c", codeVerifier: "" })).rejects.toMatchObject({ platform: "tiktok", status: 400, message: "Authorization code is expired." });
  await expect(tiktok.refresh(ctx([new Response(JSON.stringify(flat), { status: 400 })]).ctx, "rt")).rejects.toMatchObject({ status: 400 });
});

test("revoke posts the access token", async () => {
  const { ctx: c, calls } = ctx([ok({})]);
  await tiktok.revoke(c, { accessToken: "at", refreshToken: "rt" });
  expect(calls[0].url).toBe("https://open.tiktokapis.com/v2/oauth/revoke/");
  expect(form(calls[0].init)).toEqual({ client_key: "ck", client_secret: "cs", token: "at" });
});

test("profile reads display name and avatar", async () => {
  const { ctx: c, calls } = ctx([ok({ data: { user: { open_id: "o1", display_name: "Mo", avatar_url: "https://a/1.jpg" } }, error: { code: "ok", message: "" } })]);
  expect(await tiktok.profile(c, "at")).toEqual({ accountId: "o1", displayName: "Mo", avatarUrl: "https://a/1.jpg" });
  expect(calls[0].url).toBe("https://open.tiktokapis.com/v2/user/info/?fields=open_id,avatar_url,display_name");
  expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer at");
});

test.each([
  [3_000_000, { chunkSize: 3_000_000, totalChunkCount: 1 }],
  [10 * 1024 * 1024, { chunkSize: 10 * 1024 * 1024, totalChunkCount: 1 }],
  [10 * 1024 * 1024 + 1, { chunkSize: 10 * 1024 * 1024, totalChunkCount: 1 }],
  [25 * 1024 * 1024, { chunkSize: 10 * 1024 * 1024, totalChunkCount: 2 }],
  [30 * 1024 * 1024, { chunkSize: 10 * 1024 * 1024, totalChunkCount: 3 }],
])("chunkPlan(%i)", (size, plan) => { expect(chunkPlan(size)).toEqual(plan); });

test("prepare opens an inbox upload and hands the phone the pre-signed address", async () => {
  const { ctx: c, calls } = ctx([ok({ data: { publish_id: "v_inbox_file~v2.123", upload_url: "https://open-upload.tiktokapis.com/video/?upload_id=1&upload_token=x" }, error: { code: "ok", message: "" } })]);
  const r = await tiktok.prepare(c, "at", { ...INPUT, fileSize: 25 * 1024 * 1024 });
  expect(calls[0].url).toBe("https://open.tiktokapis.com/v2/post/publish/inbox/video/init/");
  expect(calls[0].init.headers).toMatchObject({ Authorization: "Bearer at", "Content-Type": "application/json; charset=UTF-8" });
  expect(JSON.parse(calls[0].init.body as string)).toEqual({ source_info: { source: "FILE_UPLOAD", video_size: 25 * 1024 * 1024, chunk_size: 10 * 1024 * 1024, total_chunk_count: 2 } });
  expect(r).toEqual({ protocol: "tiktok-chunks", uploadUrl: "https://open-upload.tiktokapis.com/video/?upload_id=1&upload_token=x", uploadHeaders: {}, chunkSize: 10 * 1024 * 1024, ref: { publishId: "v_inbox_file~v2.123" } });
});

test("API errors keep TikTok's message (or its code) whether the HTTP status is 200 or not", async () => {
  const body = (code: string, message = "") => ({ data: {}, error: { code, message, log_id: "l" } });
  await expect(tiktok.prepare(ctx([ok(body("spam_risk_too_many_pending_share"))]).ctx, "at", INPUT)).rejects.toMatchObject({ platform: "tiktok", status: 400, reason: "spam_risk_too_many_pending_share", message: "TikTok allows 5 unfinished drafts a day. Open TikTok and post or delete some first." });
  await expect(tiktok.prepare(ctx([new Response(JSON.stringify(body("access_token_invalid", "The access token is invalid.")), { status: 401 })]).ctx, "at", INPUT)).rejects.toMatchObject({ status: 401, message: "The access token is invalid." });
  await expect(tiktok.prepare(ctx([new Response(JSON.stringify(body("rate_limit_exceeded")), { status: 429 })]).ctx, "at", INPUT)).rejects.toMatchObject({ status: 429, message: "rate_limit_exceeded" });
  await expect(tiktok.prepare(ctx([ok({ data: {}, error: { code: "ok" } })]).ctx, "at", INPUT)).rejects.toMatchObject({ message: "TikTok did not return an upload address." });
});

test("finalize and status read the post status", async () => {
  const st = (status: string, extra = {}) => ok({ data: { status, ...extra }, error: { code: "ok", message: "" } });
  const s = { ref: { publishId: "p1" }, input: INPUT, clientResult: null, account: { accountId: "o1", displayName: "Mo", avatarUrl: null } };
  const a = ctx([st("PROCESSING_UPLOAD")]);
  expect(await tiktok.finalize(a.ctx, "at", s)).toEqual({ status: "processing" });
  expect(a.calls[0].url).toBe("https://open.tiktokapis.com/v2/post/publish/status/fetch/");
  expect(JSON.parse(a.calls[0].init.body as string)).toEqual({ publish_id: "p1" });
  expect(await tiktok.status(ctx([st("SEND_TO_USER_INBOX")]).ctx, "at", { publishId: "p1" })).toEqual({ status: "done", url: null });
  expect(await tiktok.status(ctx([st("PUBLISH_COMPLETE")]).ctx, "at", { publishId: "p1" })).toEqual({ status: "done", url: null });
  await expect(tiktok.status(ctx([st("FAILED", { fail_reason: "file_format_check_failed" })]).ctx, "at", { publishId: "p1" })).rejects.toMatchObject({ status: 400, reason: "file_format_check_failed", message: "TikTok couldn't use this video: file_format_check_failed." });
  await expect(tiktok.status(ctx([]).ctx, "at", {})).rejects.toMatchObject({ message: "TikTok upload reference is missing." });
});

test("auth errors and secrets", () => {
  expect(tiktok.secrets).toEqual(["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"]);
  const e = (status: number, reason: string) => Object.assign(new PlatformError("tiktok", status, "m"), { reason });
  expect(tiktok.isAuthError!(e(400, "scope_not_authorized"))).toBe(true);
  expect(tiktok.isAuthError!(e(200, "access_token_invalid"))).toBe(true);
  expect(tiktok.isAuthError!(e(403, "spam_risk_too_many_posts"))).toBe(false);
});
```

- [ ] **Step 2: Run** — `npm run test:server` → FAIL.

- [ ] **Step 3: Implement** `platforms/tiktok.ts`

```ts
import { PlatformError } from "../errors.ts";
import type { AdapterCtx, PublishResult, ServerAdapter, Tokens } from "../types.ts";
import { FORM, formBody } from "./http.ts";

const API = "https://open.tiktokapis.com";
/** Inbox upload only: the user finishes the post inside TikTok. Direct Post (video.publish) waits for TikTok's audit. */
const SCOPES = "user.info.basic,video.upload";
/** TikTok: chunks of 5–64 MB, sent in order; the last chunk carries the remainder. */
export const TIKTOK_CHUNK = 10 * 1024 * 1024;
const AUTH_CODES = ["access_token_invalid", "scope_not_authorized"];
const FRIENDLY: Record<string, string> = {
  spam_risk_too_many_pending_share: "TikTok allows 5 unfinished drafts a day. Open TikTok and post or delete some first.",
};

const key = (c: AdapterCtx) => c.env.get("TIKTOK_CLIENT_KEY") ?? "";
const secret = (c: AdapterCtx) => c.env.get("TIKTOK_CLIENT_SECRET") ?? "";

export function chunkPlan(videoSize: number): { chunkSize: number; totalChunkCount: number } {
  const chunkSize = Math.min(TIKTOK_CHUNK, videoSize);
  return { chunkSize, totalChunkCount: Math.max(1, Math.floor(videoSize / chunkSize)) };
}

async function body(res: Response): Promise<Record<string, unknown>> {
  try { return ((await res.json()) ?? {}) as Record<string, unknown>; } catch { return {}; }
}
function fail(status: number, code: string, message: string): never {
  const e = new PlatformError("tiktok", status, FRIENDLY[code] ?? (message || code));
  e.reason = code;
  throw e;
}
/** OAuth endpoints answer with a flat `{ error, error_description }`, sometimes with HTTP 200. */
async function oauthJson(res: Response): Promise<Record<string, unknown>> {
  const b = await body(res);
  if (!res.ok || typeof b.error === "string") fail(res.ok ? 400 : res.status, String(b.error ?? "error"), String(b.error_description ?? ""));
  return b;
}
/** API endpoints wrap everything in `{ data, error: { code, message } }`; `code: "ok"` is success, whatever the HTTP status. */
async function apiJson(res: Response): Promise<Record<string, unknown>> {
  const b = await body(res);
  const err = (b.error ?? {}) as { code?: unknown; message?: unknown };
  const code = typeof err.code === "string" ? err.code : res.ok ? "ok" : `http_${res.status}`;
  if (!res.ok || code !== "ok") fail(res.ok ? 400 : res.status, code, typeof err.message === "string" ? err.message : "");
  return (b.data ?? {}) as Record<string, unknown>;
}
const toTokens = (b: Record<string, unknown>): Tokens => ({
  accessToken: String(b.access_token ?? ""), refreshToken: typeof b.refresh_token === "string" ? b.refresh_token : null,
  expiresAt: typeof b.expires_in === "number" ? new Date(Date.now() + b.expires_in * 1000).toISOString() : null, scopes: String(b.scope ?? ""),
});
const authed = (accessToken: string) => ({ Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json; charset=UTF-8" });

async function fetchStatus(c: AdapterCtx, accessToken: string, ref: Record<string, unknown>): Promise<PublishResult> {
  if (typeof ref.publishId !== "string" || !ref.publishId) throw new PlatformError("tiktok", 502, "TikTok upload reference is missing.");
  const data = await apiJson(await c.fetch(`${API}/v2/post/publish/status/fetch/`, { method: "POST", headers: authed(accessToken), body: JSON.stringify({ publish_id: ref.publishId }) }));
  if (data.status === "FAILED") {
    const reason = typeof data.fail_reason === "string" ? data.fail_reason : "unknown";
    const e = new PlatformError("tiktok", 400, `TikTok couldn't use this video: ${reason}.`);
    e.reason = reason;
    throw e;
  }
  // Inbox uploads end at SEND_TO_USER_INBOX: the user finishes the post in TikTok, so there is no link to return.
  return data.status === "SEND_TO_USER_INBOX" || data.status === "PUBLISH_COMPLETE" ? { status: "done", url: null } : { status: "processing" };
}

export const tiktok: ServerAdapter = {
  id: "tiktok",
  secrets: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"],

  // TikTok's web flow has no PKCE; the client secret stays on the server and `state` protects the redirect.
  authUrl(c, { state }) {
    return `https://www.tiktok.com/v2/auth/authorize/?${new URLSearchParams({ client_key: key(c), response_type: "code", scope: SCOPES, redirect_uri: c.redirectUri, state })}`;
  },
  async exchange(c, { code }) {
    const res = await c.fetch(`${API}/v2/oauth/token/`, { method: "POST", headers: FORM, body: formBody({ client_key: key(c), client_secret: secret(c), code, grant_type: "authorization_code", redirect_uri: c.redirectUri }) });
    return toTokens(await oauthJson(res));
  },
  // The refresh token rotates: the returned one must replace the stored one.
  async refresh(c, refreshToken) {
    const res = await c.fetch(`${API}/v2/oauth/token/`, { method: "POST", headers: FORM, body: formBody({ client_key: key(c), client_secret: secret(c), grant_type: "refresh_token", refresh_token: refreshToken }) });
    return toTokens(await oauthJson(res));
  },
  async revoke(c, t) {
    await c.fetch(`${API}/v2/oauth/revoke/`, { method: "POST", headers: FORM, body: formBody({ client_key: key(c), client_secret: secret(c), token: t.accessToken }) });
  },
  async profile(c, accessToken) {
    const data = await apiJson(await c.fetch(`${API}/v2/user/info/?fields=open_id,avatar_url,display_name`, { headers: { Authorization: `Bearer ${accessToken}` } }));
    const u = (data.user ?? {}) as { open_id?: unknown; display_name?: unknown; avatar_url?: unknown };
    if (typeof u.open_id !== "string") throw new PlatformError("tiktok", 502, "TikTok did not return the account.");
    return { accountId: u.open_id, displayName: typeof u.display_name === "string" && u.display_name ? u.display_name : "TikTok account", avatarUrl: typeof u.avatar_url === "string" ? u.avatar_url : null };
  },
  async prepare(c, accessToken, input) {
    const plan = chunkPlan(input.fileSize);
    const data = await apiJson(await c.fetch(`${API}/v2/post/publish/inbox/video/init/`, {
      method: "POST", headers: authed(accessToken),
      body: JSON.stringify({ source_info: { source: "FILE_UPLOAD", video_size: input.fileSize, chunk_size: plan.chunkSize, total_chunk_count: plan.totalChunkCount } }),
    }));
    if (typeof data.upload_url !== "string" || typeof data.publish_id !== "string") throw new PlatformError("tiktok", 502, "TikTok did not return an upload address.");
    // The upload address is pre-signed (valid for one hour): the phone uploads to it directly, with no token.
    return { protocol: "tiktok-chunks", uploadUrl: data.upload_url, uploadHeaders: {}, chunkSize: plan.chunkSize, ref: { publishId: data.publish_id } };
  },
  finalize: (c, accessToken, s) => fetchStatus(c, accessToken, s.ref),
  status: (c, accessToken, ref) => fetchStatus(c, accessToken, ref),
  isAuthError: (e) => AUTH_CODES.includes(e.reason ?? ""),
};
```
`registry.ts`: add `tiktok`. `types.ts`: extend `UploadProtocol`. Check how `PlatformError.reason` is declared in `errors.ts` (added in 4A) and follow it. Confirm in `handlers/session.ts` that a `PlatformError` with status 400 thrown by `status`/`finalize` is treated as a final rejection and a 429 as retryable — the status values chosen above rely on that.

`supabase/README.md` — add a "TikTok" section in the same plain style as the YouTube one: create the developer app (Login Kit + Content Posting API with upload), the redirect URI (the same `oauth-callback` URL), where the client key and secret are, `supabase secrets set TIKTOK_CLIENT_KEY=… TIKTOK_CLIENT_SECRET=…`, sandbox + adding your own account as a target user (can take up to an hour), and "What to expect": the video arrives in your TikTok inbox as a draft — open TikTok to add the caption and post; at most 5 unfinished drafts per day; nothing is public until you post it in TikTok; none of this has run against live TikTok yet. Mark any portal label you could not confirm as "may be named slightly differently".

- [ ] **Step 4: Verify** — `npm run test:server`; `npm run typecheck`.
- [ ] **Step 5: Commit**

```powershell
git add supabase/functions/_shared supabase/README.md
git commit -m "feat(server): TikTok adapter — connect and send to the TikTok inbox"
```

---

### Task 2: `tiktok-chunks` upload protocol on the phone

**Files:**
- Modify: `src/publish/upload.ts`, `src/publish/api.ts` (`UploadProtocol`), `src/publish/runPost.ts`, `src/publish/usePost.ts` (real deps), tests `src/publish/__tests__/{upload,runPost}.test.ts`

**Interfaces (produced):**
```ts
/** TikTok's pre-signed upload: sequential PUTs; chunkSize bytes each, the last chunk carries the remainder. Never resumable. */
export function uploadTikTokChunks(url: string, a: UploadArgs): Promise<void>
export function tiktokChunkRanges(total: number, chunkSize: number): Array<{ start: number; end: number }>   // end exclusive
// api.ts
export type UploadProtocol = "google-resumable" | "relay" | "tiktok-chunks";
// runPost.ts: PostDeps gains uploadTikTokChunks: typeof uploadTikTokChunks
```

- [ ] **Step 1: Failing tests** — append to `upload.test.ts` (same `reader`/`args`/`r` helpers; `data` is 10 bytes):

```ts
test("tiktokChunkRanges matches TikTok's plan: floor(total / chunk) chunks, the last takes the remainder", () => {
  expect(tiktokChunkRanges(10, 4)).toEqual([{ start: 0, end: 4 }, { start: 4, end: 10 }]);
  expect(tiktokChunkRanges(10, 10)).toEqual([{ start: 0, end: 10 }]);
  expect(tiktokChunkRanges(12, 4)).toEqual([{ start: 0, end: 4 }, { start: 4, end: 8 }, { start: 8, end: 12 }]);
  expect(tiktokChunkRanges(3, 10)).toEqual([{ start: 0, end: 3 }]);
});

test("uploads each chunk in order; 206 continues, 201 completes", async () => {
  fetchMock.mockResolvedValueOnce(r(206)).mockResolvedValueOnce(r(201));
  const a = args();
  await uploadTikTokChunks("https://up/x?token=1", a);
  expect(fetchMock.mock.calls.map((c) => [c[0], c[1].method, c[1].headers["Content-Range"], c[1].body.length])).toEqual([
    ["https://up/x?token=1", "PUT", "bytes 0-3/10", 4], ["https://up/x?token=1", "PUT", "bytes 4-9/10", 6]]);
  expect(fetchMock.mock.calls[0][1].headers["Content-Type"]).toBe("video/mp4");
  expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
  expect(a.onProgress.mock.calls.map((c) => c[0])).toEqual([0.4, 1]);
});

test("a dropped chunk is retried in place, then gives up without offering resume", async () => {
  fetchMock.mockRejectedValueOnce(new TypeError("Network request failed")).mockResolvedValueOnce(r(206)).mockResolvedValueOnce(r(201));
  const a = args();
  await uploadTikTokChunks("https://up/x", a);
  expect(fetchMock.mock.calls.map((c) => c[1].headers["Content-Range"])).toEqual(["bytes 0-3/10", "bytes 0-3/10", "bytes 4-9/10"]);
  expect(a.sleep).toHaveBeenCalledWith(1000);
  fetchMock.mockReset(); fetchMock.mockRejectedValue(new TypeError("Network request failed"));
  await expect(uploadTikTokChunks("https://up/x", args())).rejects.toMatchObject({ resumable: false, message: "The connection dropped. Post again to restart the TikTok upload." });
  expect(fetchMock).toHaveBeenCalledTimes(4);
});

test("TikTok's refusals are final and explained", async () => {
  fetchMock.mockResolvedValueOnce(r(403));
  await expect(uploadTikTokChunks("https://up/x", args())).rejects.toMatchObject({ resumable: false, message: "The TikTok upload link expired. Post again." });
  fetchMock.mockResolvedValueOnce(r(416));
  await expect(uploadTikTokChunks("https://up/x", args())).rejects.toMatchObject({ message: "TikTok lost track of the upload. Post again." });
  fetchMock.mockResolvedValueOnce(r(400, {}, "bad range"));
  await expect(uploadTikTokChunks("https://up/x", args())).rejects.toMatchObject({ message: "bad range" });
});

test("a 201 before the last chunk, or a 206 on the last chunk, is not success", async () => {
  fetchMock.mockResolvedValueOnce(r(201));
  await expect(uploadTikTokChunks("https://up/x", args())).rejects.toMatchObject({ message: "TikTok ended the upload early. Post again." });
  fetchMock.mockReset(); fetchMock.mockResolvedValueOnce(r(206)).mockResolvedValueOnce(r(206));
  await expect(uploadTikTokChunks("https://up/x", args())).rejects.toMatchObject({ message: "TikTok did not confirm the upload. Post again." });
});

test("cancel, empty file and unreadable file behave like the other uploaders", async () => {
  const ac = new AbortController(); ac.abort();
  await expect(uploadTikTokChunks("https://up/x", args({ signal: ac.signal }))).rejects.toMatchObject({ message: "Upload cancelled." });
  await expect(uploadTikTokChunks("https://up/x", args({ reader: { size: 0, read: jest.fn(), close: jest.fn() } }))).rejects.toMatchObject({ message: "The video file is empty." });
  await expect(uploadTikTokChunks("https://up/x", args({ reader: { size: 10, read: () => { throw new Error("io"); }, close: jest.fn() } }))).rejects.toMatchObject({ message: "Couldn't read the video file." });
  expect(fetchMock).not.toHaveBeenCalled();
});
```

`runPost.test.ts` — add: a `tiktok-chunks` plan calls `deps.uploadTikTokChunks(uploadUrl, args)` (not the other uploaders) and finalizes with `clientResult: null`; a `tiktok-chunks` plan without `uploadUrl` is "The server sent an unexpected upload plan."; a non-resumable upload failure leaves the row `failed`, `resumable: false`, and returns no resume info that would skip the upload.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** in `upload.ts` (reuse `readChunk`, `sleepOrAbort`, `cancelled`, `MAX_ATTEMPTS`; follow the file's existing style):

```ts
export function tiktokChunkRanges(total: number, chunkSize: number): Array<{ start: number; end: number }> {
  const size = Math.min(chunkSize, total), count = Math.max(1, Math.floor(total / size));
  return Array.from({ length: count }, (_, i) => ({ start: i * size, end: i === count - 1 ? total : (i + 1) * size }));
}

const again = (what: string) => new UploadError(`${what} Post again.`, false);

/**
 * TikTok's pre-signed upload address: the chunks go in order, 206 = keep going, 201 = everything received.
 * TikTok offers no way to ask how far an upload got, so a failed upload is restarted from a fresh address (never "resumed").
 */
export async function uploadTikTokChunks(url: string, a: UploadArgs): Promise<void> {
  const total = a.reader.size, sleep = a.sleep ?? wait;
  if (!(total > 0)) throw new UploadError("The video file is empty.", false);
  const ranges = tiktokChunkRanges(total, a.chunkSize);
  for (let i = 0; i < ranges.length; i++) {
    const { start, end } = ranges[i], last = i === ranges.length - 1;
    const bytes = readChunk(a.reader, start, end - start);
    for (let attempts = 0; ; ) {
      if (a.signal.aborted) throw cancelled();
      let res: Awaited<ReturnType<typeof fetch>> | null = null;
      try {
        res = await fetch(url, { method: "PUT", headers: { "Content-Type": a.mimeType, "Content-Range": `bytes ${start}-${end - 1}/${total}` }, body: bytes as unknown as BodyInit, signal: a.signal });
      } catch { if (a.signal.aborted) throw cancelled(); }
      if (res && res.status === 201) { if (!last) throw again("TikTok ended the upload early."); break; }
      if (res && res.status === 206) { if (last) throw again("TikTok did not confirm the upload."); break; }
      if (res && res.status === 403) throw again("The TikTok upload link expired.");
      if (res && res.status === 416) throw again("TikTok lost track of the upload.");
      if (res && res.status >= 400 && res.status < 500) throw new UploadError(await platformText(res, `Upload failed (${res.status}).`), false);
      if (++attempts > MAX_ATTEMPTS) throw new UploadError("The connection dropped. Post again to restart the TikTok upload.", false);
      await sleepOrAbort(1000 * 2 ** (attempts - 1), a.signal, sleep);
    }
    a.onProgress(end / total);
  }
}
```
(The empty-file and abort checks must run before any read so the last test's expectations hold; reorder as needed and keep every loop path advancing, sleeping or throwing.)

`api.ts`: extend `UploadProtocol`. `runPost.ts`: `planIsValid` requires `uploadUrl` for `tiktok-chunks` too; dispatch `if (p.protocol === "tiktok-chunks") await deps.uploadTikTokChunks(p.uploadUrl ?? "", args);`; `PostDeps` gains `uploadTikTokChunks`. `usePost.ts`: add it to the real deps. Update every test fixture that builds `PostDeps`.

- [ ] **Step 4: Verify** — `npx.cmd jest src/publish`; `npm run typecheck`; `npm test`.
- [ ] **Step 5: Commit**

```powershell
git add src/publish
git commit -m "feat(publish): TikTok chunked upload protocol"
```

---

### Task 3: TikTok on the Post screen, docs

**Files:**
- Create: `src/publish/adapters/tiktok.ts`
- Modify: `src/publish/adapters/{types,index}.ts`, `src/publish/usePostForm.ts`, `src/publish/components/{PostRow,PostScreenBody}.tsx` (as needed), tests `src/publish/__tests__/{adapters,PostScreen}.test.tsx`, `README.md`, `AGENTS.md` (only if a rule changed), `docs/superpowers/specs/2026-10-02-phase-4-direct-posting-design.md`

**Interfaces (produced):**
```ts
export interface ClientAdapter {
  id: PlatformId;
  /** Longest caption the platform accepts, or null when the platform does not receive the caption at all. */
  captionMax: number | null;
  defaultOptions(title: string): Record<string, unknown>;
  validate(video: VideoInfo, caption: string, options: Record<string, unknown>): string | null;
  note(video: VideoInfo): string | null;
  /** Shown on a finished row that has no link (e.g. a TikTok draft). */
  doneNote?: string;
  /** False when the platform has no per-post options (no "options" button). Default true. */
  hasOptions?: boolean;
}
```

**Behaviour:**
- `adapters/tiktok.ts`: `captionMax: null`; `hasOptions: false`; `defaultOptions: () => ({})`; `validate`: duration > 600 s → "TikTok accepts videos up to 10 minutes."; size > 4 GB → "TikTok accepts videos up to 4 GB."; mime not `video/mp4` / `video/quicktime` / `video/webm` → "TikTok accepts MP4, MOV or WebM videos."; else null. `note`: "Clipy sends the video to your TikTok inbox. Open TikTok to add the caption and post it (up to 5 unfinished drafts a day)." `doneNote`: "Sent to TikTok — open TikTok to finish posting."
- YouTube adapter: `hasOptions` stays true (explicit or default).
- Caption counter: uses the smallest non-null `captionMax` among ticked platforms; when every ticked platform has `captionMax: null`, show only the length (no limit, never red) and add a muted line under the field: "TikTok doesn't receive this caption — you'll write it in TikTok." whenever TikTok is ticked.
- A row without options has no options button; tapping it does nothing special.
- A `done` row with no `url`: show `row.message` if present, else the adapter's `doneNote`, else "Done". No "View" button.
- The post record for TikTok is saved with `url: null` (already supported).

- [ ] **Step 1: Failing tests**
  - `adapters.test.ts`: the TikTok adapter's defaults, each validation sentence, note and doneNote; `clientAdapters` now has `youtube` and `tiktok`.
  - `PostScreen.test.tsx`: with TikTok available + connected — its row is ticked by default with its note and no options button (`queryByRole("button", { name: "TikTok options" })` is null); with only TikTok ticked the counter shows no limit and the "doesn't receive this caption" line is visible; with YouTube + TikTok ticked the limit is YouTube's 5000; a TikTok row `done` with `url: null` shows "Sent to TikTok — open TikTok to finish posting." and no "View on TikTok" button; an 11-minute video shows "TikTok accepts videos up to 10 minutes." and TikTok is not posted while YouTube still is; pressing Post with both ticked sends two jobs (`{ platform: "tiktok", caption, options: {} }` alongside YouTube's).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** per the Behaviour list (kit components and tokens only).
- [ ] **Step 4: Docs** — `README.md` posting section: TikTok works as "send to TikTok inbox", why (TikTok keeps un-audited apps private-only), the 5-drafts limit, that X / Instagram / Facebook are still to come. Phase 4 spec: Status line → `4A + 4B (TikTok inbox) implemented 2026-10-02 — unverified against live services; 4C–4D pending`; in §10 "TikTok" add: "Direct Post is deferred until the app is audited (it is restricted to private accounts and private posts before that); 4B ships the inbox route only. A dropped TikTok upload restarts from a fresh address — TikTok has no resume query."
- [ ] **Step 5: Full verification** — `npm run typecheck`; `npm test`; `npx.cmd expo-doctor`; `npm ls --all | Select-String invalid` (empty).
- [ ] **Step 6: Commit**

```powershell
git add src/publish README.md docs/superpowers/specs/2026-10-02-phase-4-direct-posting-design.md
git commit -m "feat(post): TikTok on the Post screen — send to inbox, no caption, draft note"
```

**Device checklist (after the TikTok developer app exists):** Accounts → Connect TikTok → row shows the display name → Post a video → tick TikTok → Post → Uploading % → "Sent to TikTok — open TikTok to finish posting." → the draft appears in the TikTok inbox.
