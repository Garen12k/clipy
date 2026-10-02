import { PlatformError } from "../errors.ts";
import { exchangeForPages, graph, GRAPH, META_SECRETS, metaAuthUrl, metaIsAuthError, RUPLOAD_HOST, ruploadHeaders } from "../platforms/meta.ts";
import type { AdapterCtx } from "../types.ts";

const REDIRECT = "https://ref.supabase.co/functions/v1/oauth-callback";
function ctx(responses: Array<Response | (() => Response)>, env: Record<string, string> = {}): { ctx: AdapterCtx; calls: Array<{ url: string; init: RequestInit }> } {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const all = { META_APP_ID: "app", META_APP_SECRET: "sec", ...env };
  const fetchFake = (async (url: string, init: RequestInit = {}) => { calls.push({ url: String(url), init }); const r = responses.shift()!; return typeof r === "function" ? r() : r; }) as unknown as typeof fetch;
  return { ctx: { fetch: fetchFake, env: { get: (n) => (all as Record<string, string>)[n] }, redirectUri: REDIRECT }, calls };
}
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const res = (body: unknown, status: number) => new Response(JSON.stringify(body), { status });
const form = (init: RequestInit) => Object.fromEntries(new URLSearchParams(init.body as string));
const query = (url: string) => Object.fromEntries(new URL(url).searchParams);
const metaErr = (code: number, message = "Meta says no", extra: Record<string, unknown> = {}) => ({ error: { message, type: "OAuthException", code, fbtrace_id: "t", ...extra } });

test("constants", () => {
  expect(GRAPH).toBe("https://graph.facebook.com/v25.0");
  expect(RUPLOAD_HOST).toBe("rupload.facebook.com");
  expect(META_SECRETS).toEqual(["META_APP_ID", "META_APP_SECRET"]);
});

test("metaAuthUrl asks for scopes when no Login for Business configuration is set", () => {
  const u = new URL(metaAuthUrl(ctx([]).ctx, "st", ["pages_show_list", "pages_manage_posts"]));
  expect(u.origin + u.pathname).toBe("https://www.facebook.com/v25.0/dialog/oauth");
  expect(Object.fromEntries(u.searchParams)).toEqual({ client_id: "app", redirect_uri: REDIRECT, state: "st", response_type: "code", scope: "pages_show_list,pages_manage_posts" });
});

test("metaAuthUrl uses config_id (and no scope) when META_LOGIN_CONFIG_ID is set", () => {
  const u = new URL(metaAuthUrl(ctx([], { META_LOGIN_CONFIG_ID: "cfg1" }).ctx, "st", ["pages_show_list"]));
  expect(Object.fromEntries(u.searchParams)).toEqual({ client_id: "app", redirect_uri: REDIRECT, state: "st", response_type: "code", config_id: "cfg1" });
});

test("graph GET puts params and access_token in the query", async () => {
  const { ctx: c, calls } = ctx([ok({ id: "1" })]);
  expect(await graph<{ id: string }>(c, "facebook", "/me", { token: "tok", params: { fields: "id,name" } })).toEqual({ id: "1" });
  expect(calls[0].url.split("?")[0]).toBe(`${GRAPH}/me`);
  expect(query(calls[0].url)).toEqual({ fields: "id,name", access_token: "tok" });
  expect(calls[0].init.method).toBe("GET");
  expect(calls[0].init.body).toBeUndefined();
});

test("graph POST puts params and access_token in a form body, not the URL", async () => {
  const { ctx: c, calls } = ctx([ok({ success: true })]);
  await graph(c, "facebook", "/1/video_reels", { method: "POST", token: "tok", params: { upload_phase: "start" } });
  expect(calls[0].url).toBe(`${GRAPH}/1/video_reels`);
  expect(calls[0].init.method).toBe("POST");
  expect(calls[0].init.headers).toMatchObject({ "Content-Type": "application/x-www-form-urlencoded" });
  expect(form(calls[0].init)).toEqual({ upload_phase: "start", access_token: "tok" });
});

test("graph error code 190 → 401 with reason 190", async () => {
  await expect(graph(ctx([res(metaErr(190, "Error validating access token"), 400)]).ctx, "facebook", "/me", { token: "tok" }))
    .rejects.toMatchObject({ platform: "facebook", status: 401, reason: "190", message: "Error validating access token" });
});
test("graph error code 102 → 401", async () => {
  await expect(graph(ctx([res(metaErr(102), 400)]).ctx, "facebook", "/me")).rejects.toMatchObject({ status: 401, reason: "102" });
});
test.each([4, 17, 32, 613, 80001, 80005, 341])("graph rate-limit code %i → 429 platform_unavailable", async (code) => {
  await expect(graph(ctx([res(metaErr(code), 400)]).ctx, "facebook", "/me")).rejects.toMatchObject({ status: 429, code: "platform_unavailable", reason: String(code) });
});
test.each([1, 2])("graph service code %i → 503 platform_unavailable", async (code) => {
  await expect(graph(ctx([res(metaErr(code), 500)]).ctx, "facebook", "/me")).rejects.toMatchObject({ status: 503, code: "platform_unavailable", reason: String(code) });
});
test("graph error code 100 keeps the HTTP status", async () => {
  await expect(graph(ctx([res(metaErr(100, "Invalid parameter"), 400)]).ctx, "facebook", "/me")).rejects.toMatchObject({ status: 400, code: "platform_error", reason: "100", message: "Invalid parameter" });
  await expect(graph(ctx([res(metaErr(100), 403)]).ctx, "facebook", "/me")).rejects.toMatchObject({ status: 403 });
});
test("an error object inside HTTP 200 is a 400", async () => {
  await expect(graph(ctx([ok(metaErr(100, "Bad"))]).ctx, "facebook", "/me")).rejects.toMatchObject({ status: 400, reason: "100", message: "Bad" });
});
test("error_user_msg is preferred over message", async () => {
  await expect(graph(ctx([res(metaErr(368, "tech", { error_user_msg: "Your post goes against our Community Standards." }), 400)]).ctx, "facebook", "/me"))
    .rejects.toMatchObject({ status: 400, message: "Your post goes against our Community Standards." });
});
test("a non-JSON failure keeps the HTTP status and says so", async () => {
  await expect(graph(ctx([new Response("<html>oops</html>", { status: 502 })]).ctx, "facebook", "/me")).rejects.toMatchObject({ status: 502, code: "platform_unavailable", message: "Meta returned 502" });
});
test("a network failure never carries the request URL (it may hold the app secret)", async () => {
  const c = ctx([() => { throw new TypeError("error sending request for url (https://graph.facebook.com/v25.0/oauth/access_token?client_secret=sec)"); }]);
  const e = (await graph(c.ctx, "facebook", "/oauth/access_token", { params: { client_secret: "sec" } }).catch((x: unknown) => x)) as PlatformError;
  expect(e).toBeInstanceOf(PlatformError);
  expect(e).toMatchObject({ status: 503, code: "platform_unavailable" });
  expect(e.message).not.toContain("sec");
  expect(e.message).not.toContain("graph.facebook.com");
});
test("a Meta message that echoes a secret or token is redacted", async () => {
  const c = ctx([res(metaErr(100, "Bad value secretvalue123 for token tokenvalue456"), 400)]);
  const e = (await graph(c.ctx, "facebook", "/x", { token: "tokenvalue456", params: { client_secret: "secretvalue123" } }).catch((x: unknown) => x)) as PlatformError;
  expect(e.message).not.toContain("secretvalue123");
  expect(e.message).not.toContain("tokenvalue456");
});

const PAGES = {
  data: [
    { id: "p1", name: "Page One", access_token: "ptok1", tasks: ["ANALYZE", "ADVERTISE"], picture: { data: { url: "https://pic/1.jpg" } } },
    { id: "p2", name: "Page Two", access_token: "ptok2", tasks: ["CREATE_CONTENT", "MANAGE"], picture: { data: { url: "https://pic/2.jpg" } }, instagram_business_account: { id: "ig1", username: "mo.ig", profile_picture_url: "https://pic/ig.jpg" } },
    { id: "p3", name: "Page Three", access_token: "ptok3", tasks: ["CREATE_CONTENT"] },
  ],
  paging: { cursors: { before: "a", after: "b" } },
};

test("exchangeForPages: code → short-lived → long-lived user token → /me/accounts, in that order", async () => {
  const { ctx: c, calls } = ctx([
    ok({ access_token: "short", token_type: "bearer", expires_in: 5000 }),
    ok({ access_token: "long", token_type: "bearer", expires_in: 5183944 }),
    ok(PAGES),
  ]);
  const pages = await exchangeForPages(c, "facebook", "the-code");
  expect(calls).toHaveLength(3);
  expect(calls.map((x) => x.init.method)).toEqual(["GET", "GET", "GET"]);
  expect(calls[0].url.split("?")[0]).toBe(`${GRAPH}/oauth/access_token`);
  expect(query(calls[0].url)).toEqual({ client_id: "app", redirect_uri: REDIRECT, client_secret: "sec", code: "the-code" });
  expect(calls[1].url.split("?")[0]).toBe(`${GRAPH}/oauth/access_token`);
  expect(query(calls[1].url)).toEqual({ grant_type: "fb_exchange_token", client_id: "app", client_secret: "sec", fb_exchange_token: "short" });
  expect(calls[2].url.split("?")[0]).toBe(`${GRAPH}/me/accounts`);
  expect(query(calls[2].url)).toEqual({ fields: "id,name,access_token,tasks,picture{url},instagram_business_account{id,username,profile_picture_url}", limit: "100", access_token: "long" });
  expect(pages).toEqual([
    { id: "p1", name: "Page One", accessToken: "ptok1", tasks: ["ANALYZE", "ADVERTISE"], pictureUrl: "https://pic/1.jpg", instagram: null },
    { id: "p2", name: "Page Two", accessToken: "ptok2", tasks: ["CREATE_CONTENT", "MANAGE"], pictureUrl: "https://pic/2.jpg", instagram: { id: "ig1", username: "mo.ig", pictureUrl: "https://pic/ig.jpg" } },
    { id: "p3", name: "Page Three", accessToken: "ptok3", tasks: ["CREATE_CONTENT"], pictureUrl: null, instagram: null },
  ]);
});

test("exchangeForPages: a token response without a token is a 502, and an expired code keeps Meta's text", async () => {
  await expect(exchangeForPages(ctx([ok({})]).ctx, "facebook", "c")).rejects.toMatchObject({ status: 502 });
  await expect(exchangeForPages(ctx([ok({ access_token: "s" }), ok({})]).ctx, "facebook", "c")).rejects.toMatchObject({ status: 502 });
  const e = (await exchangeForPages(ctx([res(metaErr(100, "This authorization code has expired.", { error_subcode: 36007 }), 400)]).ctx, "facebook", "c").catch((x: unknown) => x)) as PlatformError;
  expect(e).toMatchObject({ status: 400, message: "This authorization code has expired." });
  expect(JSON.stringify({ ...e, message: e.message })).not.toContain("sec");
});

test("exchangeForPages skips Page entries without an id or token", async () => {
  const pages = await exchangeForPages(ctx([ok({ access_token: "s" }), ok({ access_token: "l" }), ok({ data: [{ id: "p1", name: "x" }, { access_token: "t" }, { id: "p2", access_token: "t2" }] })]).ctx, "facebook", "c");
  expect(pages).toEqual([{ id: "p2", name: "", accessToken: "t2", tasks: [], pictureUrl: null, instagram: null }]);
});

test("ruploadHeaders returns the documented headers for Meta's upload host", () => {
  expect(ruploadHeaders("tok", 123, "https://rupload.facebook.com/video-upload/v25.0/1")).toEqual({ Authorization: "OAuth tok", offset: "0", file_size: "123" });
  expect(ruploadHeaders("tok", 5, "https://rupload.facebook.com/video-upload/1")).toEqual({ Authorization: "OAuth tok", offset: "0", file_size: "5" });
});

test.each([
  "https://evil.example/x",
  "http://rupload.facebook.com/x",
  "https://rupload.facebook.com.evil.example/x",
  "https://evil.example/rupload.facebook.com",
  "https://evil.example/https://rupload.facebook.com/x",
  "https://rupload.facebook.com@evil.example/",
  "https://user:pw@rupload.facebook.com/x",
  "https://rupload.facebook.com:8443/x",
  "https://xrupload.facebook.com/x",
  "rupload.facebook.com/x",
  "//rupload.facebook.com/x",
  "",
  "not a url",
])("ruploadHeaders refuses %j and never returns the token", (url) => {
  let thrown: unknown;
  try { ruploadHeaders("secret-token", 123, url); } catch (e) { thrown = e; }
  expect(thrown).toBeInstanceOf(Error);
  expect(String((thrown as Error).message)).not.toContain("secret-token");
});

test("metaIsAuthError: token and permission codes reconnect; others do not", () => {
  const e = (reason?: string) => Object.assign(new PlatformError("facebook", 400, "m"), { reason });
  for (const r of ["190", "102", "10", "200", "250", "299"]) expect(metaIsAuthError(e(r))).toBe(true);
  for (const r of ["4", "100", "300", "2", "368", undefined]) expect(metaIsAuthError(e(r))).toBe(false);
});
