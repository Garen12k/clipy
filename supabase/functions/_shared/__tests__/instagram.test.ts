import { PlatformError } from "../errors.ts";
import { instagram } from "../platforms/instagram.ts";
import { GRAPH } from "../platforms/meta.ts";
import { adapters } from "../platforms/registry.ts";
import type { AdapterCtx } from "../types.ts";
import { INPUT } from "./fakes.ts";

const REDIRECT = "https://ref.supabase.co/functions/v1/oauth-callback";
function ctx(responses: Array<Response | (() => Response)>, env: Record<string, string> = {}): { ctx: AdapterCtx; calls: Array<{ url: string; init: RequestInit }> } {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const all = { META_APP_ID: "app", META_APP_SECRET: "sec", ...env };
  const fetchFake = (async (url: string, init: RequestInit = {}) => { calls.push({ url: String(url), init }); const r = responses.shift()!; return typeof r === "function" ? r() : r; }) as unknown as typeof fetch;
  return { ctx: { fetch: fetchFake, env: { get: (n) => (all as Record<string, string>)[n] }, redirectUri: REDIRECT }, calls };
}
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const fail = (status: number, error: Record<string, unknown>) => new Response(JSON.stringify({ error }), { status });
const form = (init: RequestInit) => Object.fromEntries(new URLSearchParams(init.body as string));
const query = (url: string) => Object.fromEntries(new URL(url).searchParams);
const path = (url: string) => url.split("?")[0];
const SCOPES = "instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement";
const UPLOAD = "https://rupload.facebook.com/ig-api-upload/v25.0/c1";
const NO_IG = "No Instagram professional account is linked to your Facebook Page. Link one in Instagram (Settings → Account type and tools), then connect again.";
const account = { accountId: "ig1", displayName: "@me", avatarUrl: null };
const REF = { containerId: "c1", igUserId: "ig1" };
const igMe = (ig: unknown) => ok({ id: "p1", ...(ig === undefined ? {} : { instagram_business_account: ig }) });

test("registered, secrets and authUrl scopes", () => {
  expect(adapters.instagram).toBe(instagram);
  expect(adapters.facebook?.id).toBe("facebook");
  expect(instagram.id).toBe("instagram");
  expect(instagram.secrets).toEqual(["META_APP_ID", "META_APP_SECRET"]);
  const u = new URL(instagram.authUrl(ctx([]).ctx, { state: "st", codeChallenge: "unused" }));
  expect(u.origin + u.pathname).toBe("https://www.facebook.com/v25.0/dialog/oauth");
  expect(Object.fromEntries(u.searchParams)).toEqual({ client_id: "app", redirect_uri: REDIRECT, state: "st", response_type: "code", scope: SCOPES });
  const withConfig = new URL(instagram.authUrl(ctx([], { META_LOGIN_CONFIG_ID: "cfg" }).ctx, { state: "st", codeChallenge: "" }));
  expect(withConfig.searchParams.get("config_id")).toBe("cfg");
  expect(withConfig.searchParams.has("scope")).toBe(false);
});

const tokenCalls = () => [ok({ access_token: "short" }), ok({ access_token: "long", expires_in: 5183944 })];
const ig = (id: string) => ({ id, username: `u_${id}`, profile_picture_url: null });

test("exchange picks the first Page with a linked Instagram account and returns its token with no expiry", async () => {
  const { ctx: c, calls } = ctx([...tokenCalls(), ok({ data: [
    { id: "p0", name: "No IG", access_token: "ptok0", tasks: ["MANAGE", "CREATE_CONTENT"] },
    { id: "p1", name: "With IG", access_token: "ptok1", tasks: ["CREATE_CONTENT"], instagram_business_account: ig("ig1") },
    { id: "p2", name: "Also IG", access_token: "ptok2", tasks: ["CREATE_CONTENT"], instagram_business_account: ig("ig2") },
  ] })]);
  expect(await instagram.exchange(c, { code: "code1", codeVerifier: "unused" })).toEqual({ accessToken: "ptok1", refreshToken: null, expiresAt: null, scopes: SCOPES });
  expect(calls).toHaveLength(3);
});

test("exchange prefers a Page the user can post for (media_publish needs MANAGE or CREATE_CONTENT on the Page)", async () => {
  const { ctx: c } = ctx([...tokenCalls(), ok({ data: [
    { id: "p0", name: "Ads only", access_token: "ptok0", tasks: ["ADVERTISE"], instagram_business_account: ig("ig0") },
    { id: "p1", name: "Mine", access_token: "ptok1", tasks: ["MANAGE"], instagram_business_account: ig("ig1") },
  ] })]);
  expect((await instagram.exchange(c, { code: "c", codeVerifier: "" })).accessToken).toBe("ptok1");
  // With no such Page, the first Page with Instagram is still used (Meta then says what is missing).
  const only = ctx([...tokenCalls(), ok({ data: [{ id: "p0", name: "Ads only", access_token: "ptok0", tasks: ["ADVERTISE"], instagram_business_account: ig("ig0") }] })]);
  expect((await instagram.exchange(only.ctx, { code: "c", codeVerifier: "" })).accessToken).toBe("ptok0");
});

test("exchange with no Page linked to Instagram explains what to do", async () => {
  const c = ctx([...tokenCalls(), ok({ data: [{ id: "p0", name: "No IG", access_token: "ptok0", tasks: ["CREATE_CONTENT"] }] })]);
  await expect(instagram.exchange(c.ctx, { code: "c", codeVerifier: "" })).rejects.toMatchObject({ platform: "instagram", status: 400, code: "platform_error", message: NO_IG });
  await expect(instagram.exchange(ctx([...tokenCalls(), ok({ data: [] })]).ctx, { code: "c", codeVerifier: "" })).rejects.toMatchObject({ status: 400, message: NO_IG });
});

test("refresh is never possible: reconnect; revoke makes no call", async () => {
  await expect(instagram.refresh(ctx([]).ctx, "x")).rejects.toMatchObject({ platform: "instagram", status: 401 });
  const { ctx: c, calls } = ctx([]);
  await instagram.revoke(c, { accessToken: "ptok", refreshToken: null });
  expect(calls).toHaveLength(0);
});

test("profile reads the Instagram account linked to the Page", async () => {
  const { ctx: c, calls } = ctx([igMe({ id: "ig1", username: "me", profile_picture_url: "https://pic/ig1.jpg" })]);
  expect(await instagram.profile(c, "ptok")).toEqual({ accountId: "ig1", displayName: "@me", avatarUrl: "https://pic/ig1.jpg" });
  expect(path(calls[0].url)).toBe(`${GRAPH}/me`);
  expect(query(calls[0].url)).toEqual({ fields: "instagram_business_account{id,username,profile_picture_url}", access_token: "ptok" });
  expect(await instagram.profile(ctx([igMe({ id: "ig2", username: "x" })]).ctx, "ptok")).toEqual({ accountId: "ig2", displayName: "@x", avatarUrl: null });
});

test("profile without a linked Instagram account explains what to do", async () => {
  await expect(instagram.profile(ctx([igMe(undefined)]).ctx, "ptok")).rejects.toMatchObject({ platform: "instagram", status: 400, message: NO_IG });
  await expect(instagram.profile(ctx([igMe(null)]).ctx, "ptok")).rejects.toMatchObject({ status: 400, message: NO_IG });
  await expect(instagram.profile(ctx([igMe({ username: "x" })]).ctx, "ptok")).rejects.toMatchObject({ status: 400, message: NO_IG });
});

test("prepare creates a resumable Reels container and hands the phone Meta's upload host with the documented headers", async () => {
  const { ctx: c, calls } = ctx([igMe({ id: "ig1", username: "me" }), ok({ id: "c1", uri: UPLOAD })]);
  const r = await instagram.prepare(c, "ptok", INPUT);
  expect(calls).toHaveLength(2);
  expect(path(calls[0].url)).toBe(`${GRAPH}/me`);
  expect(query(calls[0].url)).toEqual({ fields: "instagram_business_account{id,username,profile_picture_url}", access_token: "ptok" });
  expect(calls[1].url).toBe(`${GRAPH}/ig1/media`);
  expect(calls[1].init.method).toBe("POST");
  expect(form(calls[1].init)).toEqual({ media_type: "REELS", upload_type: "resumable", caption: "Beach day", share_to_feed: "true", access_token: "ptok" });
  expect(r).toEqual({
    protocol: "meta-rupload", uploadUrl: UPLOAD,
    uploadHeaders: { Authorization: "OAuth ptok", offset: "0", file_size: String(INPUT.fileSize) },
    chunkSize: INPUT.fileSize, ref: { containerId: "c1", igUserId: "ig1" },
    wait: { maxSeconds: 600, resumeOnTimeout: true },
  });
});

test("prepare cuts the caption at 2200 whole characters (never half an emoji)", async () => {
  const caption = "😀".repeat(2201);
  const { ctx: c, calls } = ctx([igMe({ id: "ig1", username: "me" }), ok({ id: "c1", uri: UPLOAD })]);
  await instagram.prepare(c, "ptok", { ...INPUT, caption });
  const sent = form(calls[1].init).caption;
  expect(Array.from(sent)).toHaveLength(2200);
  expect(sent).toBe("😀".repeat(2200));
  const mixed = "a".repeat(2199) + "😀b";
  const m = ctx([igMe({ id: "ig1", username: "me" }), ok({ id: "c1", uri: UPLOAD })]);
  await instagram.prepare(m.ctx, "ptok", { ...INPUT, caption: mixed });
  expect(form(m.calls[1].init).caption).toBe("a".repeat(2199) + "😀");
});

test("prepare without a linked Instagram account makes no container", async () => {
  const { ctx: c, calls } = ctx([igMe(undefined)]);
  await expect(instagram.prepare(c, "ptok", INPUT)).rejects.toMatchObject({ status: 400, message: NO_IG });
  expect(calls).toHaveLength(1);
});

test("prepare without id or uri is a 502", async () => {
  await expect(instagram.prepare(ctx([igMe({ id: "ig1" }), ok({ uri: UPLOAD })]).ctx, "ptok", INPUT)).rejects.toMatchObject({ status: 502, message: "Instagram did not return an upload address." });
  await expect(instagram.prepare(ctx([igMe({ id: "ig1" }), ok({ id: "c1" })]).ctx, "ptok", INPUT)).rejects.toMatchObject({ status: 502, message: "Instagram did not return an upload address." });
});

test.each([
  "https://evil.example/ig-api-upload/v25.0/c1",
  "https://rupload.facebook.com.evil.example/x",
  "http://rupload.facebook.com/ig-api-upload/v25.0/c1",
  "https://rupload.facebook.com@evil.example/",
  "https://rupload.facebook.com\\@evil.example/x",
  "https://graph.facebook.com/v25.0/c1",
])("prepare with a non-rupload uri %j rejects (502) with neither the URL nor the token in the error", async (uri) => {
  const e = (await instagram.prepare(ctx([igMe({ id: "ig1" }), ok({ id: "c1", uri })]).ctx, "ptok-0123456789abcdef", INPUT).catch((x: unknown) => x)) as PlatformError;
  expect(e).toBeInstanceOf(PlatformError);
  expect(e).toMatchObject({ platform: "instagram", status: 502, message: "Meta returned an unexpected upload address." });
  const all = JSON.stringify({ ...e, message: e.message });
  expect(all).not.toContain("ptok");
  expect(all).not.toContain(uri);
  expect(all).not.toContain("evil");
});

const st = (status_code: string, status?: string) => ok({ id: "c1", status_code, ...(status ? { status } : {}) });
const session = { ref: REF, input: INPUT, clientResult: null, account };

describe.each([
  ["finalize", (c: AdapterCtx, ref: Record<string, unknown>) => instagram.finalize(c, "ptok", { ...session, ref })],
  ["status", (c: AdapterCtx, ref: Record<string, unknown>) => instagram.status(c, "ptok", ref)],
])("%s publishes when ready", (_name, run) => {
  test("IN_PROGRESS: processing, nothing published", async () => {
    const { ctx: c, calls } = ctx([st("IN_PROGRESS", "Uploading")]);
    expect(await run(c, REF)).toEqual({ status: "processing" });
    expect(calls).toHaveLength(1);
    expect(path(calls[0].url)).toBe(`${GRAPH}/c1`);
    expect(query(calls[0].url)).toEqual({ fields: "status_code,status", access_token: "ptok" });
  });

  test("ERROR: final, with Meta's status text", async () => {
    const { ctx: c, calls } = ctx([st("ERROR", "Error: 2207026")]);
    await expect(run(c, REF)).rejects.toMatchObject({ platform: "instagram", status: 400, code: "platform_error", message: "Instagram couldn't process this video. Error: 2207026" });
    expect(calls).toHaveLength(1);
    await expect(run(ctx([st("ERROR")]).ctx, REF)).rejects.toMatchObject({ status: 400, message: "Instagram couldn't process this video." });
  });

  test("EXPIRED: final", async () => {
    const { ctx: c, calls } = ctx([st("EXPIRED")]);
    await expect(run(c, REF)).rejects.toMatchObject({ status: 400, code: "platform_error", message: "Instagram couldn't process this video." });
    expect(calls).toHaveLength(1);
  });

  test("FINISHED: publish once, then read the permalink", async () => {
    const { ctx: c, calls } = ctx([st("FINISHED"), ok({ id: "m1" }), ok({ id: "m1", permalink: "https://www.instagram.com/reel/AbC/" })]);
    expect(await run(c, REF)).toEqual({ status: "done", url: "https://www.instagram.com/reel/AbC/" });
    expect(calls).toHaveLength(3);
    expect(calls[1].url).toBe(`${GRAPH}/ig1/media_publish`);
    expect(calls[1].init.method).toBe("POST");
    expect(form(calls[1].init)).toEqual({ creation_id: "c1", access_token: "ptok" });
    expect(path(calls[2].url)).toBe(`${GRAPH}/m1`);
    expect(query(calls[2].url)).toEqual({ fields: "permalink", access_token: "ptok" });
  });

  test("FINISHED but the permalink call fails: still done, url null, published exactly once", async () => {
    const { ctx: c, calls } = ctx([st("FINISHED"), ok({ id: "m1" }), fail(500, { code: 2, message: "Service temporarily unavailable" })]);
    expect(await run(c, REF)).toEqual({ status: "done", url: null });
    expect(calls.filter((x) => x.url.endsWith("/media_publish"))).toHaveLength(1);
    const noLink = ctx([st("FINISHED"), ok({ id: "m1" }), ok({ id: "m1" })]);
    expect(await run(noLink.ctx, REF)).toEqual({ status: "done", url: null });
  });

  test("PUBLISHED (an earlier answer was lost): done, no publish call", async () => {
    const { ctx: c, calls } = ctx([st("PUBLISHED")]);
    expect(await run(c, REF)).toEqual({ status: "done", url: null });
    expect(calls).toHaveLength(1);
  });

  test("a Graph error 190 during publish needs a reconnect (401)", async () => {
    const e = (await run(ctx([st("FINISHED"), fail(400, { code: 190, message: "Error validating access token" })]).ctx, REF).catch((x: unknown) => x)) as PlatformError;
    expect(e).toMatchObject({ platform: "instagram", status: 401, reason: "190" });
    expect(instagram.isAuthError!(e)).toBe(true);
  });

  test.each([
    ["HTTP 429", fail(429, { message: "Too many calls" })],
    ["HTTP 500", fail(500, { message: "Oops" })],
    ["code 1", fail(400, { code: 1, message: "An unknown error occurred" })],
    ["code 2", fail(400, { code: 2, message: "Service temporarily unavailable" })],
    ["code 4", fail(400, { code: 4, message: "Application request limit reached" })],
    ["code -1 (Instagram server error)", fail(400, { code: -1, error_subcode: 2207001, message: "Fatal" })],
    ["code -2 (download timeout)", fail(400, { code: -2, error_subcode: 2207003, message: "It takes too long to download the media." })],
    ["code 24 (container not found yet)", fail(400, { code: 24, error_subcode: 2207008, message: "The media builder with creation id does not exist or has expired" })],
  ])("a temporary failure of media_publish (%s) is platform_unavailable, so the phone can Resume", async (_n, res) => {
    const e = (await run(ctx([st("FINISHED"), res]).ctx, REF).catch((x: unknown) => x)) as PlatformError;
    expect(e).toBeInstanceOf(PlatformError);
    expect(e.code).toBe("platform_unavailable");
    expect(e.status === 429 || (e.status >= 500 && e.status <= 599)).toBe(true);
  });

  test("Resume after a temporary publish failure: still FINISHED → publishes (once); PUBLISHED → done without publishing", async () => {
    const first = ctx([st("FINISHED"), fail(503, { code: 2, message: "Service temporarily unavailable" })]);
    await expect(run(first.ctx, REF)).rejects.toMatchObject({ code: "platform_unavailable" });
    const again = ctx([st("FINISHED"), ok({ id: "m1" }), ok({ permalink: "https://www.instagram.com/reel/X/" })]);
    expect(await run(again.ctx, REF)).toEqual({ status: "done", url: "https://www.instagram.com/reel/X/" });
    expect(again.calls.filter((x) => x.url.endsWith("/media_publish"))).toHaveLength(1);
    const already = ctx([st("PUBLISHED")]);
    expect(await run(already.ctx, REF)).toEqual({ status: "done", url: null });
    expect(already.calls.filter((x) => x.url.endsWith("/media_publish"))).toHaveLength(0);
  });

  test("media_publish says 'not ready' (9007): keep polling, nothing published", async () => {
    expect(await run(ctx([st("FINISHED"), fail(400, { code: 9007, error_subcode: 2207027, message: "The media is not ready for publishing, please wait" })]).ctx, REF)).toEqual({ status: "processing" });
  });

  test("a final publish refusal (daily limit) keeps Meta's words", async () => {
    await expect(run(ctx([st("FINISHED"), fail(400, { code: 9, error_subcode: 2207042, message: "You reached maximum number of posts that is allowed" })]).ctx, REF))
      .rejects.toMatchObject({ status: 400, code: "platform_error", message: "You reached maximum number of posts that is allowed" });
  });

  test.each([[{}], [{ containerId: "c1" }], [{ igUserId: "ig1" }], [{ containerId: "", igUserId: "ig1" }], [{ containerId: 5, igUserId: "ig1" }]])("a missing reference %j is final (502) and calls nothing", async (ref) => {
    const { ctx: c, calls } = ctx([]);
    await expect(run(c, ref)).rejects.toMatchObject({ platform: "instagram", status: 502, code: "platform_error", message: "Instagram upload reference is missing." });
    expect(calls).toHaveLength(0);
  });
});

test("no token or secret in a publish error message", async () => {
  const token = "ptok-0123456789abcdef";
  const e = (await instagram.status(ctx([st("FINISHED"), fail(400, { code: 100, message: `Invalid parameter access_token=${token}` })]).ctx, token, REF).catch((x: unknown) => x)) as PlatformError;
  expect(e.message).not.toContain(token);
});
