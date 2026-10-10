/**
 * The fix wave after the review of Post now: the server switch (`TIKTOK_DIRECT_POST`), what an unrecognised refusal says, which
 * 401 may flag an account, and a status call that is refused without a verdict.
 */
import { ApiError, PlatformError } from "../errors.ts";
import { postPrepare } from "../handlers/postPrepare.ts";
import { postStatus } from "../handlers/postStatus.ts";
import { DIRECT_OFF, NEEDS_PERMISSION, tiktok } from "../platforms/tiktok.ts";
import { saveTokens } from "../tokens.ts";
import type { AdapterCtx } from "../types.ts";
import { fakeDeps, INPUT, tokens, USER } from "./fakes.ts";

type Call = { url: string; init: RequestInit };
function ctx(responses: Response[], env: Record<string, string> = { TIKTOK_DIRECT_POST: "true" }): { ctx: AdapterCtx; calls: Call[]; fetch: typeof fetch; env: { get(n: string): string | undefined } } {
  const calls: Call[] = [];
  const f = (async (url: string, init: RequestInit = {}) => { calls.push({ url: String(url), init }); return responses.shift()!; }) as unknown as typeof fetch;
  const all: Record<string, string> = { TIKTOK_CLIENT_KEY: "ck", TIKTOK_CLIENT_SECRET: "cs", ...env };
  const e = { get: (n: string) => all[n] };
  return { ctx: { fetch: f, env: e, redirectUri: "https://ref.supabase.co/functions/v1/oauth-callback" }, calls, fetch: f, env: e };
}
const ok = (data: unknown) => new Response(JSON.stringify({ data, error: { code: "ok", message: "" } }), { status: 200 });
const err = (code: string, message = "", status = 200) => new Response(JSON.stringify({ data: {}, error: { code, message, log_id: "l" } }), { status });
const CREATOR = { creator_username: "sunny", creator_nickname: "Sunny", privacy_level_options: ["SELF_ONLY"], comment_disabled: false, duet_disabled: true, stitch_disabled: true, max_video_post_duration_sec: 300 };
const OPTS = { mode: "direct", privacy: "SELF_ONLY", allowComment: false, allowDuet: false, allowStitch: false, brandOrganic: false, brandContent: false };
const input = () => ({ ...INPUT, options: { ...OPTS } });
const GENERIC = "TikTok didn't accept this. Try again later, or choose Send as draft in the TikTok options.";
const FULL = "user.info.basic,video.upload,video.publish";
const TOKEN = "secret-access-token";
let logged: jest.SpyInstance;
beforeEach(() => { logged = jest.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => logged.mockRestore());

describe("the switch is off (the secret absent, or anything but true)", () => {
  test.each([[{}], [{ TIKTOK_DIRECT_POST: "false" }], [{ TIKTOK_DIRECT_POST: "1" }]])("env %j: creator info and a direct prepare are refused in one plain sentence, before any call", async (env) => {
    expect(DIRECT_OFF).toBe("Posting straight to TikTok isn't switched on yet. Choose Send as draft.");
    const a = ctx([], env);
    for (const run of [() => tiktok.creatorInfo!(a.ctx, TOKEN, { scopes: FULL }), () => tiktok.prepare(a.ctx, TOKEN, input()), () => tiktok.prepare(a.ctx, TOKEN, { ...INPUT, options: { mode: "direct" } })]) {
      const e = await run().catch((x: unknown) => x);
      expect(e).toBeInstanceOf(ApiError);
      expect(e).not.toBeInstanceOf(PlatformError);
      expect(e).toMatchObject({ status: 409, code: "direct_off", message: DIRECT_OFF });
    }
    expect(a.calls).toHaveLength(0);
  });
  test("a draft does not read the switch: the inbox call goes out as ever", async () => {
    const a = ctx([ok({ publish_id: "p1", upload_url: "https://open-upload.tiktokapis.com/video/?upload_id=1" })], {});
    await tiktok.prepare(a.ctx, TOKEN, { ...INPUT, options: {} });
    expect(a.calls.map((c) => c.url)).toEqual(["https://open.tiktokapis.com/v2/post/publish/inbox/video/init/"]);
  });
  test("through post-prepare: the refusal reaches the phone with its code, opens no session and flags nothing", async () => {
    const a = ctx([], {});
    const deps = fakeDeps({ env: a.env, fetch: a.fetch, adapters: { tiktok } });
    await saveTokens(deps, USER, "tiktok", tokens({ scopes: FULL }), { accountId: "o1", displayName: "Mo", avatarUrl: null });
    await expect(postPrepare(deps, USER, { platform: "tiktok", ...INPUT, options: { ...OPTS } })).rejects.toMatchObject({ status: 409, code: "direct_off", message: DIRECT_OFF });
    expect(a.calls).toHaveLength(0);
    expect((await deps.db.getAccount(USER, "tiktok"))!.meta.needsReconnect).toBeUndefined();
  });
  test("a direct post already under way is still asked about after the switch goes off", async () => {
    const a = ctx([ok({ status: "PUBLISH_COMPLETE" })], {});
    expect(await tiktok.status(a.ctx, TOKEN, { publishId: "p9", direct: true })).toEqual({ status: "done", url: null });
  });
});

describe("an unrecognised refusal on a direct call", () => {
  test.each([["some_new_code", "Raw words from TikTok", 400], ["some_new_code", "", 403], ["another_one", "Raw words from TikTok", 200]])("%s (%j, HTTP %i) is one plain sentence; the code goes to the log only", async (code, raw, http) => {
    for (const responses of [[err(code, raw, http)], [ok(CREATOR), err(code, raw, http)]]) {
      const e = await tiktok.prepare(ctx(responses).ctx, TOKEN, input()).catch((x: unknown) => x) as PlatformError;
      expect(e).toMatchObject({ code: "platform_error", reason: code, message: GENERIC });
    }
    const said = JSON.stringify(logged.mock.calls);
    expect(said).toContain(code);
    expect(said).not.toContain("Raw words");
    expect(said).not.toContain(TOKEN);
  });
  test("a refusal with no readable body is the same sentence, never a bare http_403", async () => {
    await expect(tiktok.creatorInfo!(ctx([new Response("<html>", { status: 403 })]).ctx, TOKEN, { scopes: "" })).rejects.toMatchObject({ status: 403, reason: "http_403", message: GENERIC });
  });
  test("a code that is not a plain word is not written to the log as it came", async () => {
    await tiktok.creatorInfo!(ctx([err("x\ninjected line <script>", "", 400)]).ctx, TOKEN, { scopes: "" }).catch(() => {});
    expect(JSON.stringify(logged.mock.calls)).not.toContain("injected");
  });
  test("the draft path keeps TikTok's own words, as before", async () => {
    await expect(tiktok.prepare(ctx([err("invalid_param", "video_size is wrong", 400)]).ctx, TOKEN, { ...INPUT, options: {} })).rejects.toMatchObject({ message: "video_size is wrong" });
    expect(logged).not.toHaveBeenCalled();
  });
});

describe("a 401 on a direct call", () => {
  test.each([["a code TikTok does not document", () => err("something_else", "x", 401)], ["no readable body", () => new Response("nope", { status: 401 })]])("%s is a missing permission, never an auth error: the draft account must not be flagged", async (_n, res) => {
    for (const responses of [[res()], [ok(CREATOR), res()]]) {
      const e = await tiktok.prepare(ctx(responses).ctx, TOKEN, input()).catch((x: unknown) => x);
      expect(e).not.toBeInstanceOf(PlatformError);
      expect(e).toMatchObject({ status: 403, code: "needs_permission", message: NEEDS_PERMISSION });
    }
  });
  test("access_token_invalid is still the auth error, at either call", async () => {
    for (const responses of [[err("access_token_invalid", "bad", 401)], [ok(CREATOR), err("access_token_invalid", "bad", 200)]]) {
      const e = await tiktok.prepare(ctx(responses).ctx, TOKEN, input()).catch((x: unknown) => x) as PlatformError;
      expect(e).toBeInstanceOf(PlatformError);
      expect(e.status).toBe(401);
      expect(tiktok.isAuthError!(e)).toBe(true);
    }
  });
  test("on the draft path any 401 is what it was", async () => {
    const e = await tiktok.prepare(ctx([new Response("nope", { status: 401 })]).ctx, TOKEN, { ...INPUT, options: {} }).catch((x: unknown) => x) as PlatformError;
    expect(e).toBeInstanceOf(PlatformError);
    expect(e.status).toBe(401);
  });
});

describe("a direct post's status call refused without a verdict", () => {
  const ref = { publishId: "p9", direct: true };
  const UNKNOWN = "TikTok couldn't confirm this post. Check your TikTok profile before posting again.";
  test.each([["invalid_publish_id", 400], ["some_new_code", 403], ["invalid_param", 200]])("%s (HTTP %i): the outcome is unknown, said so, with its own code", async (code, http) => {
    const e = await tiktok.status(ctx([err(code, "raw words", http)]).ctx, TOKEN, ref).catch((x: unknown) => x) as PlatformError;
    expect(e).toBeInstanceOf(PlatformError);
    expect(e).toMatchObject({ code: "outcome_unknown", reason: code, message: UNKNOWN });
    expect(e.status).toBeGreaterThanOrEqual(400);
    expect(e.status).toBeLessThan(500);
  });
  test("a verdict (FAILED), a busy TikTok and an invalid token are what they were", async () => {
    await expect(tiktok.status(ctx([ok({ status: "FAILED", fail_reason: "spam_risk" })]).ctx, TOKEN, ref)).rejects.toMatchObject({ code: "platform_error", message: "TikTok refused this post." });
    await expect(tiktok.status(ctx([err("rate_limit_exceeded", "", 429)]).ctx, TOKEN, ref)).rejects.toMatchObject({ code: "platform_unavailable" });
    const auth = await tiktok.status(ctx([err("access_token_invalid", "bad", 401)]).ctx, TOKEN, ref).catch((x: unknown) => x) as PlatformError;
    expect(auth.status).toBe(401);
    expect(auth.code).toBe("platform_error");
  });
  test("a draft's status refusal keeps TikTok's words and code", async () => {
    await expect(tiktok.status(ctx([err("invalid_publish_id", "raw words", 400)]).ctx, TOKEN, { publishId: "p9" })).rejects.toMatchObject({ code: "platform_error", message: "raw words" });
  });
  test("through post-status: the phone gets outcome_unknown once, the session is failed, and TikTok is not asked again", async () => {
    const a = ctx([err("invalid_publish_id", "raw words", 400)]);
    const deps = fakeDeps({ env: a.env, fetch: a.fetch, adapters: { tiktok } });
    await saveTokens(deps, USER, "tiktok", tokens({ scopes: FULL }), { accountId: "o1", displayName: "Mo", avatarUrl: null });
    const sessionId = await deps.db.createSession({ userId: USER, platform: "tiktok", ref, input: input(), status: "processing", url: null, error: null });
    await expect(postStatus(deps, USER, { sessionId })).rejects.toMatchObject({ code: "outcome_unknown", message: UNKNOWN });
    expect(await deps.db.getSession(sessionId)).toMatchObject({ status: "failed", error: UNKNOWN });
    await expect(postStatus(deps, USER, { sessionId })).rejects.toMatchObject({ message: UNKNOWN });
    expect(a.calls).toHaveLength(1);
  });
});
