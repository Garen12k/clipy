import { ApiError, PlatformError } from "../errors.ts";
import { DIRECT_SCOPE, knownToLackDirect, NEEDS_PERMISSION, scopeList, tiktok, TIKTOK_PRIVACY, TIKTOK_TITLE_MAX } from "../platforms/tiktok.ts";
import type { AdapterCtx } from "../types.ts";
import { INPUT } from "./fakes.ts";

type Call = { url: string; init: RequestInit };
function ctx(responses: Response[]): { ctx: AdapterCtx; calls: Call[] } {
  const calls: Call[] = [];
  const f = (async (url: string, init: RequestInit = {}) => { calls.push({ url: String(url), init }); return responses.shift()!; }) as unknown as typeof fetch;
  const ENV: Record<string, string> = { TIKTOK_CLIENT_KEY: "ck", TIKTOK_CLIENT_SECRET: "cs" };
  return { ctx: { fetch: f, env: { get: (n) => ENV[n] }, redirectUri: "https://ref.supabase.co/functions/v1/oauth-callback" }, calls };
}
const ok = (data: unknown) => new Response(JSON.stringify({ data, error: { code: "ok", message: "" } }), { status: 200 });
const err = (code: string, message = "", status = 200) => new Response(JSON.stringify({ data: {}, error: { code, message, log_id: "l" } }), { status });
const CREATOR = { creator_avatar_url: "https://p16.tiktokcdn.com/a.jpeg", creator_username: "sunny", creator_nickname: "Sunny", privacy_level_options: ["FOLLOWER_OF_CREATOR", "MUTUAL_FOLLOW_FRIENDS", "SELF_ONLY"], comment_disabled: false, duet_disabled: true, stitch_disabled: true, max_video_post_duration_sec: 300 };
const creator = (over = {}) => ok({ ...CREATOR, ...over });
const INIT = () => ok({ publish_id: "v_pub_file~v2.9", upload_url: "https://open-upload.tiktokapis.com/video/?upload_id=9&upload_token=y" });
const OPTS = { mode: "direct", privacy: "SELF_ONLY", allowComment: true, allowDuet: false, allowStitch: false, brandOrganic: false, brandContent: false };
const input = (over: Record<string, unknown> = {}, options: Record<string, unknown> = {}) => ({ ...INPUT, fileSize: 25 * 1024 * 1024, caption: "  Beach day #sun  ", ...over, options: { ...OPTS, ...options } });
const CREATOR_URL = "https://open.tiktokapis.com/v2/post/publish/creator_info/query/";
const INIT_URL = "https://open.tiktokapis.com/v2/post/publish/video/init/";

test("the scope list and the shortcut", () => {
  expect(DIRECT_SCOPE).toBe("video.publish");
  expect(scopeList("user.info.basic,video.upload")).toEqual(["user.info.basic", "video.upload"]);
  expect(scopeList(" user.info.basic video.upload,, video.publish ")).toEqual(["user.info.basic", "video.upload", "video.publish"]);
  expect(knownToLackDirect("user.info.basic,video.upload")).toBe(true);
  expect(knownToLackDirect("user.info.basic,video.upload,video.publish")).toBe(false);
  // Unknown or unreadable: never a verdict.
  expect(knownToLackDirect("")).toBe(false);
  expect(knownToLackDirect("something-else")).toBe(false);
  expect(TIKTOK_PRIVACY).toEqual(["PUBLIC_TO_EVERYONE", "FOLLOWER_OF_CREATOR", "MUTUAL_FOLLOW_FRIENDS", "SELF_ONLY"]);
  expect(TIKTOK_TITLE_MAX).toBe(2200);
});

test("authUrl asks for the direct permission too", () => {
  expect(new URL(tiktok.authUrl(ctx([]).ctx, { state: "st", codeChallenge: "" })).searchParams.get("scope")).toBe("user.info.basic,video.upload,video.publish");
});

describe("creatorInfo", () => {
  test("asks TikTok with no body and maps the answer", async () => {
    const a = ctx([creator()]);
    expect(await tiktok.creatorInfo!(a.ctx, "at", { scopes: "user.info.basic,video.upload,video.publish" })).toEqual({
      nickname: "Sunny", username: "sunny", avatarUrl: "https://p16.tiktokcdn.com/a.jpeg",
      privacyOptions: ["FOLLOWER_OF_CREATOR", "MUTUAL_FOLLOW_FRIENDS", "SELF_ONLY"], commentDisabled: false, duetDisabled: true, stitchDisabled: true, maxDurationSec: 300 });
    expect(a.calls).toHaveLength(1);
    expect(a.calls[0].url).toBe(CREATOR_URL);
    expect(a.calls[0].init.method).toBe("POST");
    expect(a.calls[0].init.headers).toEqual({ Authorization: "Bearer at", "Content-Type": "application/json; charset=UTF-8" });
    expect(a.calls[0].init.body).toBeUndefined();
  });
  test("keeps only the four known privacy values, in the app's order; odd values fall back", async () => {
    const a = ctx([creator({ privacy_level_options: ["SELF_ONLY", "SOMETHING_NEW", "PUBLIC_TO_EVERYONE"], creator_nickname: "", creator_avatar_url: "http://insecure/a.jpg", max_video_post_duration_sec: "600", comment_disabled: "yes" })]);
    expect(await tiktok.creatorInfo!(a.ctx, "at", { scopes: "" })).toMatchObject({ nickname: "sunny", avatarUrl: null, privacyOptions: ["PUBLIC_TO_EVERYONE", "SELF_ONLY"], commentDisabled: false, maxDurationSec: 600 });
    const b = ctx([creator({ creator_nickname: null, creator_username: null })]);
    expect(await tiktok.creatorInfo!(b.ctx, "at", { scopes: "" })).toMatchObject({ nickname: "TikTok account", username: null });
  });
  test("no usable privacy list is a temporary failure, never an empty choice", async () => {
    await expect(tiktok.creatorInfo!(ctx([creator({ privacy_level_options: [] })]).ctx, "at", { scopes: "" })).rejects.toMatchObject({ status: 502, code: "platform_unavailable", message: "TikTok did not say who can see the post." });
    await expect(tiktok.creatorInfo!(ctx([creator({ privacy_level_options: "SELF_ONLY" })]).ctx, "at", { scopes: "" })).rejects.toMatchObject({ status: 502 });
  });
  test("a stored grant known to lack the permission answers without calling TikTok", async () => {
    const a = ctx([]);
    const e = await tiktok.creatorInfo!(a.ctx, "at", { scopes: "user.info.basic,video.upload" }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).not.toBeInstanceOf(PlatformError);
    expect(e).toMatchObject({ status: 403, code: "needs_permission", message: NEEDS_PERMISSION });
    expect(NEEDS_PERMISSION).toBe("Reconnect TikTok to allow posting directly, or choose Send as draft in the TikTok options.");
    expect(a.calls).toHaveLength(0);
  });
  test.each([["scope_not_authorized", 401], ["scope_not_authorized", 200], ["scope_permission_missed", 400]])("TikTok's %s (HTTP %i) is needs_permission, not an auth error", async (code, status) => {
    const e = await tiktok.creatorInfo!(ctx([err(code, "x", status)]).ctx, "at", { scopes: "" }).catch((x: unknown) => x) as ApiError;
    expect(e).not.toBeInstanceOf(PlatformError);
    expect(e).toMatchObject({ status: 403, code: "needs_permission", message: NEEDS_PERMISSION });
  });
  test("an invalid token is still an auth error (reconnect)", async () => {
    const e = await tiktok.creatorInfo!(ctx([err("access_token_invalid", "bad", 401)]).ctx, "at", { scopes: "" }).catch((x: unknown) => x) as PlatformError;
    expect(e).toBeInstanceOf(PlatformError);
    expect(e.status).toBe(401);
    expect(tiktok.isAuthError!(e)).toBe(true);
  });
  test.each([
    ["spam_risk_too_many_posts", "TikTok says this account has posted too much today. Try again tomorrow, or post from TikTok."],
    ["spam_risk_user_banned_from_posting", "TikTok has stopped this account from posting for now. Open TikTok to see why."],
    ["reached_active_user_cap", "Clipy has reached TikTok's daily limit of accounts that can post. Try again tomorrow, or choose Send as draft in the TikTok options."],
  ])("%s inside a 200 is a plain refusal", async (code, said) => {
    await expect(tiktok.creatorInfo!(ctx([err(code, "raw")]).ctx, "at", { scopes: "" })).rejects.toMatchObject({ status: 403, code: "platform_error", reason: code, message: said });
  });
  test("busy and failing are temporary, in today's words", async () => {
    await expect(tiktok.creatorInfo!(ctx([err("rate_limit_exceeded", "", 429)]).ctx, "at", { scopes: "" })).rejects.toMatchObject({ code: "platform_unavailable", message: "TikTok is busy — wait a minute, then try again." });
    await expect(tiktok.creatorInfo!(ctx([new Response("down", { status: 503 })]).ctx, "at", { scopes: "" })).rejects.toMatchObject({ code: "platform_unavailable", message: "TikTok is having trouble — try again." });
  });
});

describe("prepare, direct", () => {
  test("asks the creator FIRST, then opens the post with the caption as its title", async () => {
    const a = ctx([creator(), INIT()]);
    const r = await tiktok.prepare(a.ctx, "at", input());
    expect(a.calls.map((c) => c.url)).toEqual([CREATOR_URL, INIT_URL]);
    expect(a.calls[1].init.method).toBe("POST");
    expect(a.calls[1].init.headers).toEqual({ Authorization: "Bearer at", "Content-Type": "application/json; charset=UTF-8" });
    expect(JSON.parse(a.calls[1].init.body as string)).toEqual({
      post_info: { title: "Beach day #sun", privacy_level: "SELF_ONLY", disable_duet: true, disable_comment: false, disable_stitch: true, brand_content_toggle: false, brand_organic_toggle: false },
      source_info: { source: "FILE_UPLOAD", video_size: 25 * 1024 * 1024, chunk_size: 10 * 1024 * 1024, total_chunk_count: 2 },
    });
    expect(r).toEqual({ protocol: "tiktok-chunks", uploadUrl: "https://open-upload.tiktokapis.com/video/?upload_id=9&upload_token=y", uploadHeaders: {}, chunkSize: 10 * 1024 * 1024,
      ref: { publishId: "v_pub_file~v2.9", direct: true }, wait: { maxSeconds: 300, intervalSeconds: 5, resumeOnTimeout: false }, publishes: true });
  });
  test("an empty caption sends no title; the brand toggles pass through", async () => {
    const a = ctx([creator({ privacy_level_options: ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "SELF_ONLY"], duet_disabled: false, stitch_disabled: false }), INIT()]);
    await tiktok.prepare(a.ctx, "at", input({ caption: "   " }, { privacy: "PUBLIC_TO_EVERYONE", allowDuet: true, allowStitch: true, allowComment: false, brandOrganic: true, brandContent: true }));
    expect(JSON.parse(a.calls[1].init.body as string).post_info).toEqual({ privacy_level: "PUBLIC_TO_EVERYONE", disable_duet: false, disable_comment: true, disable_stitch: false, brand_content_toggle: true, brand_organic_toggle: true });
  });
  test.each([
    [{ privacy: undefined }], [{ privacy: "EVERYONE" }], [{ allowComment: "yes" }], [{ allowDuet: undefined }], [{ allowStitch: 1 }], [{ brandOrganic: null }], [{ brandContent: undefined }],
  ])("options of the wrong shape %j are refused before any call", async (bad) => {
    const a = ctx([]);
    await expect(tiktok.prepare(a.ctx, "at", input({}, bad))).rejects.toMatchObject({ status: 400, code: "bad_request", message: "The TikTok options are incomplete." });
    expect(a.calls).toHaveLength(0);
  });
  test("a caption over the limit is refused before any call, never cut", async () => {
    const a = ctx([]);
    await expect(tiktok.prepare(a.ctx, "at", input({ caption: "x".repeat(2201) }))).rejects.toMatchObject({ status: 400, code: "options_refused", message: "TikTok captions can be up to 2200 characters." });
    expect(a.calls).toHaveLength(0);
    const b = ctx([creator(), INIT()]);
    await tiktok.prepare(b.ctx, "at", input({ caption: "x".repeat(2200) }));
    expect(b.calls).toHaveLength(2);
  });
  const PRIVACY_GONE = "TikTok no longer offers that choice of who can see it. Open the TikTok options and choose again.";
  test.each([
    ["a privacy the creator is not offered", {}, { privacy: "PUBLIC_TO_EVERYONE" }, {}, PRIVACY_GONE],
    ["branded content with Only me", {}, { brandContent: true }, {}, "Branded content visibility cannot be set to private."],
    ["comments allowed but turned off", { comment_disabled: true }, {}, {}, "Comments are turned off in your TikTok settings. Open the TikTok options and try again."],
    ["duet allowed but turned off", {}, { allowDuet: true }, {}, "Duet is turned off in your TikTok settings. Open the TikTok options and try again."],
    ["stitch allowed but turned off", {}, { allowStitch: true }, {}, "Stitch is turned off in your TikTok settings. Open the TikTok options and try again."],
    ["a video longer than this creator may post", {}, {}, { durationSec: 301 }, "This TikTok account can post videos up to 5 minutes."],
    ["a video longer than an odd limit", { max_video_post_duration_sec: 90 }, {}, { durationSec: 91 }, "This TikTok account can post videos up to 90 seconds."],
    ["a video longer than one minute", { max_video_post_duration_sec: 60 }, {}, { durationSec: 61 }, "This TikTok account can post videos up to 1 minute."],
  ])("refused against the FRESH creator info: %s — and nothing is opened", async (_n, creatorOver, options, inputOver, said) => {
    const a = ctx([creator(creatorOver)]);
    const e = await tiktok.prepare(a.ctx, "at", input(inputOver, options)).catch((x: unknown) => x) as ApiError;
    expect(e).not.toBeInstanceOf(PlatformError);
    expect(e).toMatchObject({ status: 400, code: "options_refused", message: said });
    expect(a.calls.map((c) => c.url)).toEqual([CREATOR_URL]);
  });
  test("exactly at the creator's limit is allowed", async () => {
    const a = ctx([creator(), INIT()]);
    await tiktok.prepare(a.ctx, "at", input({ durationSec: 300 }));
    expect(a.calls).toHaveLength(2);
  });
  test.each([
    ["unaudited_client_can_only_post_to_private_accounts", 403, "platform_error", "TikTok only lets Clipy post to private accounts for now. Set your TikTok account to private, or choose Send as draft in the TikTok options."],
    ["privacy_level_option_mismatch", 403, "platform_error", PRIVACY_GONE],
    ["spam_risk_too_many_posts", 403, "platform_error", "TikTok says this account has posted too much today. Try again tomorrow, or post from TikTok."],
    ["reached_active_user_cap", 403, "platform_error", "Clipy has reached TikTok's daily limit of accounts that can post. Try again tomorrow, or choose Send as draft in the TikTok options."],
    ["rate_limit_exceeded", 429, "platform_unavailable", "TikTok is busy — wait a minute, then try again."],
    ["invalid_param", 400, "platform_error", "title is too long"],
  ])("init refused with %s, inside a 200 or with its own status", async (code, status, clipy, said) => {
    for (const http of [200, status]) {
      await expect(tiktok.prepare(ctx([creator(), err(code, "title is too long", http)]).ctx, "at", input())).rejects.toMatchObject({ status, code: clipy, reason: code, message: said });
    }
  });
  test("a missing permission at either call is needs_permission and is never an auth error", async () => {
    for (const responses of [[err("scope_not_authorized", "x", 401)], [creator(), err("scope_not_authorized", "x", 401)]]) {
      const e = await tiktok.prepare(ctx(responses).ctx, "at", input()).catch((x: unknown) => x) as ApiError;
      expect(e).not.toBeInstanceOf(PlatformError);
      expect(e).toMatchObject({ status: 403, code: "needs_permission", message: NEEDS_PERMISSION });
    }
  });
  test("no upload address is a failure", async () => {
    await expect(tiktok.prepare(ctx([creator(), ok({})]).ctx, "at", input())).rejects.toMatchObject({ message: "TikTok did not return an upload address." });
  });
});

describe("status, direct", () => {
  const ref = { publishId: "p9", direct: true };
  const st = (status: string, extra = {}) => ok({ status, ...extra });
  test("processing, then done without a link", async () => {
    expect(await tiktok.status(ctx([st("PROCESSING_UPLOAD")]).ctx, "at", ref)).toEqual({ status: "processing" });
    expect(await tiktok.status(ctx([st("PUBLISH_COMPLETE", { publicaly_available_post_id: [] })]).ctx, "at", ref)).toEqual({ status: "done", url: null });
    expect(await tiktok.finalize(ctx([st("PUBLISH_COMPLETE")]).ctx, "at", { ref, input: input(), clientResult: null, account: { accountId: "o1", displayName: "Mo", avatarUrl: null } })).toEqual({ status: "done", url: null });
  });
  test.each([
    ["spam_risk_text", "TikTok refused the caption. Change it and post again."],
    ["spam_risk", "TikTok refused this post."],
    ["spam_risk_too_many_posts", "TikTok says this account has posted too much today. Try again tomorrow, or post from TikTok."],
    ["spam_risk_user_banned_from_posting", "TikTok has stopped this account from posting for now. Open TikTok to see why."],
    ["auth_removed", "TikTok access was removed while posting. Reconnect TikTok and post again."],
    ["internal", "TikTok had a problem processing the video."],
    ["frame_rate_check_failed", "TikTok couldn't use this video: frame_rate_check_failed."],
  ])("FAILED with %s is final, in plain words", async (reason, said) => {
    await expect(tiktok.status(ctx([st("FAILED", { fail_reason: reason })]).ctx, "at", ref)).rejects.toMatchObject({ status: 400, code: "platform_error", reason, message: said });
  });
});
