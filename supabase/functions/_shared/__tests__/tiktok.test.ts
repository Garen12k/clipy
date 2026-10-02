import { PlatformError } from "../errors.ts";
import { chunkPlan, tiktok } from "../platforms/tiktok.ts";
import type { AdapterCtx } from "../types.ts";
import { INPUT } from "./fakes.ts";

const REDIRECT = "https://ref.supabase.co/functions/v1/oauth-callback";
function ctx(responses: Array<Response | (() => Response)>, env: Record<string, string> = {}): { ctx: AdapterCtx; calls: Array<{ url: string; init: RequestInit }> } {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const all = { TIKTOK_CLIENT_KEY: "ck", TIKTOK_CLIENT_SECRET: "cs", ...env };
  const fetchFake = (async (url: string, init: RequestInit = {}) => { calls.push({ url: String(url), init }); const r = responses.shift()!; return typeof r === "function" ? r() : r; }) as unknown as typeof fetch;
  return { ctx: { fetch: fetchFake, env: { get: (n) => (all as Record<string, string>)[n] }, redirectUri: REDIRECT }, calls };
}
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const form = (init: RequestInit) => Object.fromEntries(new URLSearchParams(init.body as string));

test("authUrl uses the web flow with comma-separated scopes", () => {
  const u = new URL(tiktok.authUrl(ctx([]).ctx, { state: "st", codeChallenge: "unused" }));
  expect(u.origin + u.pathname).toBe("https://www.tiktok.com/v2/auth/authorize/");
  expect(Object.fromEntries(u.searchParams)).toEqual({ client_key: "ck", response_type: "code", scope: "user.info.basic,video.upload", redirect_uri: REDIRECT, state: "st" });
});

test("exchange and refresh map tokens; refresh returns the rotated refresh token", async () => {
  const a = ctx([ok({ access_token: "at", refresh_token: "rt", expires_in: 86400, scope: "user.info.basic,video.upload", open_id: "o1" })]);
  const before = Date.now();
  const t = await tiktok.exchange(a.ctx, { code: "c", codeVerifier: "unused" });
  expect(a.calls[0].url).toBe("https://open.tiktokapis.com/v2/oauth/token/");
  expect(a.calls[0].init.method).toBe("POST");
  expect(form(a.calls[0].init)).toEqual({ client_key: "ck", client_secret: "cs", code: "c", grant_type: "authorization_code", redirect_uri: REDIRECT });
  expect(t).toMatchObject({ accessToken: "at", refreshToken: "rt", scopes: "user.info.basic,video.upload" });
  expect(new Date(t.expiresAt!).getTime()).toBeGreaterThanOrEqual(before + 86400_000 - 5);
  const b = ctx([ok({ access_token: "at2", refresh_token: "rt2", expires_in: 86400, scope: "s" })]);
  expect(await tiktok.refresh(b.ctx, "rt")).toMatchObject({ accessToken: "at2", refreshToken: "rt2" });
  expect(form(b.calls[0].init)).toEqual({ client_key: "ck", client_secret: "cs", grant_type: "refresh_token", refresh_token: "rt" });
});

test("token errors arrive flat (even with HTTP 200) and keep TikTok's description", async () => {
  const flat = { error: "invalid_grant", error_description: "Authorization code is expired.", log_id: "x" };
  await expect(tiktok.exchange(ctx([ok(flat)]).ctx, { code: "c", codeVerifier: "" })).rejects.toMatchObject({ platform: "tiktok", status: 400, reason: "invalid_grant", message: "Authorization code is expired." });
  await expect(tiktok.refresh(ctx([new Response(JSON.stringify(flat), { status: 400 })]).ctx, "rt")).rejects.toMatchObject({ status: 400 });
  // A 5xx from the token endpoint stays a 5xx, so a refresh failure reads as "try again", not "reconnect".
  await expect(tiktok.refresh(ctx([new Response("oops", { status: 503 })]).ctx, "rt")).rejects.toMatchObject({ status: 503 });
  // No access token in a 200 body is not a success.
  await expect(tiktok.exchange(ctx([ok({})]).ctx, { code: "c", codeVerifier: "" })).rejects.toMatchObject({ status: 502 });
});

test("no thrown message carries the client secret or a token", async () => {
  const err = (await tiktok.exchange(ctx([ok({ error: "invalid_client" })]).ctx, { code: "c", codeVerifier: "" }).catch((e: unknown) => e)) as PlatformError;
  expect(err.message).toBe("invalid_client");
  expect(JSON.stringify({ ...err, message: err.message })).not.toContain('"cs"');
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
  expect(await tiktok.profile(ctx([ok({ data: { user: { open_id: "o2" } }, error: { code: "ok" } })]).ctx, "at")).toEqual({ accountId: "o2", displayName: "TikTok account", avatarUrl: null });
  await expect(tiktok.profile(ctx([ok({ data: {}, error: { code: "ok" } })]).ctx, "at")).rejects.toMatchObject({ message: "TikTok did not return the account." });
});

test.each([
  [3_000_000, { chunkSize: 3_000_000, totalChunkCount: 1 }],
  [10 * 1024 * 1024, { chunkSize: 10 * 1024 * 1024, totalChunkCount: 1 }],
  [10 * 1024 * 1024 + 1, { chunkSize: 10 * 1024 * 1024, totalChunkCount: 1 }],
  [25 * 1024 * 1024, { chunkSize: 10 * 1024 * 1024, totalChunkCount: 2 }],
  [30 * 1024 * 1024, { chunkSize: 10 * 1024 * 1024, totalChunkCount: 3 }],
  // TikTok's own example: 50,000,123 bytes in 10,000,000-byte chunks is 5 chunks; ours are 10 MiB.
  [50_000_123, { chunkSize: 10 * 1024 * 1024, totalChunkCount: 4 }],
])("chunkPlan(%i)", (size, plan) => { expect(chunkPlan(size)).toEqual(plan); });

test("prepare opens an inbox upload and hands the phone the pre-signed address", async () => {
  const { ctx: c, calls } = ctx([ok({ data: { publish_id: "v_inbox_file~v2.123", upload_url: "https://open-upload.tiktokapis.com/video/?upload_id=1&upload_token=x" }, error: { code: "ok", message: "" } })]);
  const r = await tiktok.prepare(c, "at", { ...INPUT, fileSize: 25 * 1024 * 1024 });
  expect(calls[0].url).toBe("https://open.tiktokapis.com/v2/post/publish/inbox/video/init/");
  expect(calls[0].init.method).toBe("POST");
  expect(calls[0].init.headers).toMatchObject({ Authorization: "Bearer at", "Content-Type": "application/json; charset=UTF-8" });
  expect(JSON.parse(calls[0].init.body as string)).toEqual({ source_info: { source: "FILE_UPLOAD", video_size: 25 * 1024 * 1024, chunk_size: 10 * 1024 * 1024, total_chunk_count: 2 } });
  expect(r).toEqual({ protocol: "tiktok-chunks", uploadUrl: "https://open-upload.tiktokapis.com/video/?upload_id=1&upload_token=x", uploadHeaders: {}, chunkSize: 10 * 1024 * 1024, ref: { publishId: "v_inbox_file~v2.123" } });
});

test("API errors keep TikTok's message (or its code) whether the HTTP status is 200 or not", async () => {
  const body = (code: string, message = "") => ({ data: {}, error: { code, message, log_id: "l" } });
  const pending = "TikTok allows 5 unfinished drafts a day. Open TikTok and post or delete some first.";
  // Documented as HTTP 403; an error code inside a 200 gets the status TikTok documents for that code.
  await expect(tiktok.prepare(ctx([new Response(JSON.stringify(body("spam_risk_too_many_pending_share", "At most 5")), { status: 403 })]).ctx, "at", INPUT)).rejects.toMatchObject({ platform: "tiktok", status: 403, reason: "spam_risk_too_many_pending_share", message: pending });
  await expect(tiktok.prepare(ctx([ok(body("spam_risk_too_many_pending_share"))]).ctx, "at", INPUT)).rejects.toMatchObject({ status: 403, reason: "spam_risk_too_many_pending_share", message: pending });
  await expect(tiktok.prepare(ctx([new Response(JSON.stringify(body("access_token_invalid", "The access token is invalid.")), { status: 401 })]).ctx, "at", INPUT)).rejects.toMatchObject({ status: 401, message: "The access token is invalid." });
  await expect(tiktok.prepare(ctx([ok(body("access_token_invalid"))]).ctx, "at", INPUT)).rejects.toMatchObject({ status: 401 });
  await expect(tiktok.prepare(ctx([new Response(JSON.stringify(body("rate_limit_exceeded")), { status: 429 })]).ctx, "at", INPUT)).rejects.toMatchObject({ status: 429, message: "rate_limit_exceeded" });
  await expect(tiktok.prepare(ctx([ok(body("rate_limit_exceeded"))]).ctx, "at", INPUT)).rejects.toMatchObject({ status: 429 });
  await expect(tiktok.prepare(ctx([ok(body("invalid_param", "chunk_size is invalid"))]).ctx, "at", INPUT)).rejects.toMatchObject({ status: 400, message: "chunk_size is invalid" });
  await expect(tiktok.prepare(ctx([new Response("<html>bad gateway</html>", { status: 502 })]).ctx, "at", INPUT)).rejects.toMatchObject({ status: 502, reason: "http_502" });
  await expect(tiktok.prepare(ctx([ok({ data: {}, error: { code: "ok" } })]).ctx, "at", INPUT)).rejects.toMatchObject({ message: "TikTok did not return an upload address." });
});

test("finalize and status read the post status", async () => {
  const st = (status: string, extra = {}) => ok({ data: { status, ...extra }, error: { code: "ok", message: "" } });
  const s = { ref: { publishId: "p1" }, input: INPUT, clientResult: null, account: { accountId: "o1", displayName: "Mo", avatarUrl: null } };
  const a = ctx([st("PROCESSING_UPLOAD")]);
  expect(await tiktok.finalize(a.ctx, "at", s)).toEqual({ status: "processing" });
  expect(a.calls[0].url).toBe("https://open.tiktokapis.com/v2/post/publish/status/fetch/");
  expect(a.calls[0].init.headers).toMatchObject({ Authorization: "Bearer at" });
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
  expect(tiktok.isAuthError!(e(400, "scope_permission_missed"))).toBe(true);
  expect(tiktok.isAuthError!(e(403, "spam_risk_too_many_posts"))).toBe(false);
  // A video that failed because access was removed is a final failure, not a reconnect loop.
  expect(tiktok.isAuthError!(e(400, "auth_removed"))).toBe(false);
});
