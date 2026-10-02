import { PlatformError } from "../errors.ts";
import { youtube } from "../platforms/youtube.ts";
import type { AdapterCtx } from "../types.ts";
import { INPUT } from "./fakes.ts";

const REDIRECT = "https://ref.supabase.co/functions/v1/oauth-callback";
function ctx(responses: Array<Response | (() => Response)>, env: Record<string, string> = {}): { ctx: AdapterCtx; calls: Array<{ url: string; init: RequestInit }> } {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const all = { YOUTUBE_CLIENT_ID: "cid", YOUTUBE_CLIENT_SECRET: "sec", ...env };
  const fetchFake = (async (url: string, init: RequestInit = {}) => { calls.push({ url: String(url), init }); const r = responses.shift()!; return typeof r === "function" ? r() : r; }) as unknown as typeof fetch;
  return { ctx: { fetch: fetchFake, env: { get: (n) => (all as Record<string, string>)[n] }, redirectUri: REDIRECT }, calls };
}
const ok = (body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status: 200, headers });
const form = (init: RequestInit) => Object.fromEntries(new URLSearchParams(init.body as string));

test("authUrl asks for offline access with both scopes and the state", () => {
  const u = new URL(youtube.authUrl(ctx([]).ctx, { state: "st", codeChallenge: "ch" }));
  expect(u.origin + u.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
  expect(Object.fromEntries(u.searchParams)).toEqual({
    client_id: "cid", redirect_uri: REDIRECT, response_type: "code", access_type: "offline", prompt: "consent", include_granted_scopes: "true", state: "st",
    scope: "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly",
  });
});

test("exchange posts the code with the secret and maps the tokens", async () => {
  const { ctx: c, calls } = ctx([ok({ access_token: "at", refresh_token: "rt", expires_in: 3600, scope: "a b" })]);
  const before = Date.now();
  const t = await youtube.exchange(c, { code: "the-code", codeVerifier: "unused" });
  expect(calls[0].url).toBe("https://oauth2.googleapis.com/token");
  expect(calls[0].init.method).toBe("POST");
  expect(form(calls[0].init)).toEqual({ code: "the-code", client_id: "cid", client_secret: "sec", redirect_uri: REDIRECT, grant_type: "authorization_code" });
  expect(t).toMatchObject({ accessToken: "at", refreshToken: "rt", scopes: "a b" });
  expect(new Date(t.expiresAt!).getTime()).toBeGreaterThanOrEqual(before + 3600_000 - 5);
});

test("refresh returns a null refresh token when Google sends none", async () => {
  const { ctx: c, calls } = ctx([ok({ access_token: "at2", expires_in: 3600, scope: "a" })]);
  const t = await youtube.refresh(c, "rt");
  expect(form(calls[0].init)).toEqual({ refresh_token: "rt", client_id: "cid", client_secret: "sec", grant_type: "refresh_token" });
  expect(t).toMatchObject({ accessToken: "at2", refreshToken: null });
});

test("token errors surface Google's description", async () => {
  const { ctx: c } = ctx([new Response(JSON.stringify({ error: "invalid_grant", error_description: "Token has been expired or revoked." }), { status: 400 })]);
  await expect(youtube.refresh(c, "rt")).rejects.toMatchObject({ platform: "youtube", status: 400, message: "Token has been expired or revoked." });
});

test("revoke prefers the refresh token", async () => {
  const { ctx: c, calls } = ctx([ok({})]);
  await youtube.revoke(c, { accessToken: "at", refreshToken: "rt" });
  expect(calls[0].url).toBe("https://oauth2.googleapis.com/revoke");
  expect(form(calls[0].init)).toEqual({ token: "rt" });
});

test("profile reads the channel; no channel is a clear error", async () => {
  const one = ctx([ok({ items: [{ id: "UC123", snippet: { title: "My Channel", thumbnails: { default: { url: "https://img/a.jpg" } } } }] })]);
  expect(await youtube.profile(one.ctx, "at")).toEqual({ accountId: "UC123", displayName: "My Channel", avatarUrl: "https://img/a.jpg" });
  expect(one.calls[0].url).toBe("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true");
  expect((one.calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer at");
  await expect(youtube.profile(ctx([ok({ items: [] })]).ctx, "at")).rejects.toMatchObject({ message: "This Google account has no YouTube channel yet." });
});

test("prepare opens a resumable session with clean metadata", async () => {
  const { ctx: c, calls } = ctx([new Response(null, { status: 200, headers: { Location: "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=XYZ" } })]);
  const r = await youtube.prepare(c, "at", { ...INPUT, caption: "Beach <day> #fun", options: { title: "My <best> day", privacy: "unlisted" } });
  expect(calls[0].url).toBe("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status");
  const h = calls[0].init.headers as Record<string, string>;
  expect(h).toMatchObject({ Authorization: "Bearer at", "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Length": "20000000", "X-Upload-Content-Type": "video/mp4" });
  expect(JSON.parse(calls[0].init.body as string)).toEqual({
    snippet: { title: "My best day", description: "Beach day #fun", categoryId: "22" },
    status: { privacyStatus: "unlisted", selfDeclaredMadeForKids: false },
  });
  expect(r).toEqual({ protocol: "google-resumable", uploadUrl: "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=XYZ", uploadHeaders: {}, chunkSize: 8388608, ref: {} });
});

test("prepare defaults: title from the caption (≤100 chars), then a fallback; privacy public", async () => {
  const long = "x".repeat(150);
  const a = ctx([new Response(null, { status: 200, headers: { Location: "https://u/1" } })]);
  await youtube.prepare(a.ctx, "at", { ...INPUT, caption: long, options: {} });
  const body = JSON.parse(a.calls[0].init.body as string);
  expect(body.snippet.title).toHaveLength(100);
  expect(body.status.privacyStatus).toBe("public");
  const b = ctx([new Response(null, { status: 200, headers: { Location: "https://u/2" } })]);
  await youtube.prepare(b.ctx, "at", { ...INPUT, caption: "", options: { privacy: "nonsense" } });
  expect(JSON.parse(b.calls[0].init.body as string)).toMatchObject({ snippet: { title: "Clipy video" }, status: { privacyStatus: "public" } });
});

test("prepare keeps the caption's line breaks, caps the description at 5000 bytes and never cuts an emoji in half", async () => {
  const a = ctx([new Response(null, { status: 200, headers: { Location: "https://u/1" } })]);
  await youtube.prepare(a.ctx, "at", { ...INPUT, caption: "Line one  \n\n  line <two>", options: {} });
  expect(JSON.parse(a.calls[0].init.body as string).snippet).toMatchObject({ title: "Line one line two", description: "Line one\n\nline two" });
  const b = ctx([new Response(null, { status: 200, headers: { Location: "https://u/2" } })]);
  await youtube.prepare(b.ctx, "at", { ...INPUT, caption: "é".repeat(3000), options: { title: "😀".repeat(120) } });
  const s = JSON.parse(b.calls[0].init.body as string).snippet;
  expect(new TextEncoder().encode(s.description).length).toBe(5000);
  expect(Array.from(s.title)).toHaveLength(100);
  expect(s.title).toBe("😀".repeat(100));
});

test("prepare can hand the phone a short-lived token when the fallback switch is on", async () => {
  const { ctx: c } = ctx([new Response(null, { status: 200, headers: { Location: "https://u/1" } })], { YOUTUBE_UPLOAD_TOKEN_ON_PHONE: "true" });
  expect((await youtube.prepare(c, "at", INPUT)).uploadHeaders).toEqual({ Authorization: "Bearer at" });
});

test("prepare surfaces Google's API error message and status", async () => {
  const err = { error: { code: 403, message: "The request cannot be completed because you have exceeded your quota.", errors: [{ reason: "quotaExceeded" }] } };
  const { ctx: c } = ctx([new Response(JSON.stringify(err), { status: 403 })]);
  await expect(youtube.prepare(c, "at", INPUT)).rejects.toMatchObject({ platform: "youtube", status: 403, message: err.error.message });
  await expect(youtube.prepare(ctx([new Response(null, { status: 200 })]).ctx, "at", INPUT)).rejects.toMatchObject({ message: "YouTube did not return an upload address." });
});

test("finalize builds the link from the uploaded video's id and refuses anything odd", async () => {
  const s = { ref: {}, input: INPUT, account: { accountId: "UC1", displayName: "x", avatarUrl: null } };
  expect(await youtube.finalize(ctx([]).ctx, "at", { ...s, clientResult: '{"kind":"youtube#video","id":"abc123XYZ_-"}' })).toEqual({ status: "done", url: "https://youtu.be/abc123XYZ_-" });
  for (const bad of [null, "not json", '{"id":"../../evil"}', "{}"])
    await expect(youtube.finalize(ctx([]).ctx, "at", { ...s, clientResult: bad })).rejects.toMatchObject({ message: "YouTube did not confirm the upload." });
});

test("prepare passes Google's reason along without showing it", async () => {
  const err = { error: { code: 403, message: "Request had insufficient authentication scopes.", errors: [{ message: "Insufficient Permission", domain: "global", reason: "insufficientPermissions" }], status: "PERMISSION_DENIED" } };
  await expect(youtube.prepare(ctx([new Response(JSON.stringify(err), { status: 403 })]).ctx, "at", INPUT))
    .rejects.toMatchObject({ status: 403, reason: "insufficientPermissions", message: err.error.message });
  const details = { error: { code: 403, message: "Request had insufficient authentication scopes.", status: "PERMISSION_DENIED", details: [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "ACCESS_TOKEN_SCOPE_INSUFFICIENT" }] } };
  await expect(youtube.prepare(ctx([new Response(JSON.stringify(details), { status: 403 })]).ctx, "at", INPUT)).rejects.toMatchObject({ reason: "ACCESS_TOKEN_SCOPE_INSUFFICIENT" });
});

describe("isAuthError", () => {
  const e = (status: number, message: string, reason?: string) => { const x = new PlatformError("youtube", status, message); x.reason = reason; return x; };
  test.each([
    ["insufficientPermissions", e(403, "Insufficient Permission", "insufficientPermissions")],
    ["ACCESS_TOKEN_SCOPE_INSUFFICIENT", e(403, "Request had insufficient authentication scopes.", "ACCESS_TOKEN_SCOPE_INSUFFICIENT")],
    ["a message saying insufficient", e(403, "Request had insufficient authentication scopes.")],
  ])("a 403 for %s means reconnect", (_n, err) => { expect(youtube.isAuthError!(err)).toBe(true); });
  test.each([
    ["quotaExceeded", e(403, "The request cannot be completed because you have exceeded your quota.", "quotaExceeded")],
    ["a quota reason even with an 'insufficient' message", e(403, "Insufficient quota.", "quotaExceeded")],
    ["forbidden", e(403, "Forbidden", "forbidden")],
    ["a 400 saying insufficient", e(400, "insufficient data", "badRequest")],
    ["a 500", e(500, "insufficient", "backendError")],
  ])("%s is not an auth error", (_n, err) => { expect(youtube.isAuthError!(err)).toBe(false); });
});

test("secrets", () => { expect(youtube.secrets).toEqual(["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET"]); });
