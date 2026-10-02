import { PlatformError } from "../errors.ts";
import { facebook } from "../platforms/facebook.ts";
import { GRAPH } from "../platforms/meta.ts";
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
const form = (init: RequestInit) => Object.fromEntries(new URLSearchParams(init.body as string));
const query = (url: string) => Object.fromEntries(new URL(url).searchParams);
const SCOPES = "pages_show_list,pages_read_engagement,pages_manage_posts";
const UPLOAD = "https://rupload.facebook.com/video-upload/v25.0/vid1";
const account = { accountId: "p1", displayName: "Page", avatarUrl: null };

test("secrets and authUrl scopes", () => {
  expect(facebook.id).toBe("facebook");
  expect(facebook.secrets).toEqual(["META_APP_ID", "META_APP_SECRET"]);
  const u = new URL(facebook.authUrl(ctx([]).ctx, { state: "st", codeChallenge: "unused" }));
  expect(u.origin + u.pathname).toBe("https://www.facebook.com/v25.0/dialog/oauth");
  expect(Object.fromEntries(u.searchParams)).toEqual({ client_id: "app", redirect_uri: REDIRECT, state: "st", response_type: "code", scope: SCOPES });
});

const tokenCalls = () => [ok({ access_token: "short" }), ok({ access_token: "long", expires_in: 5183944 })];

test("exchange picks the first Page the user can create content on and returns its token with no expiry", async () => {
  const { ctx: c, calls } = ctx([...tokenCalls(), ok({ data: [
    { id: "p0", name: "Ads only", access_token: "ptok0", tasks: ["ADVERTISE"] },
    { id: "p1", name: "Mine", access_token: "ptok1", tasks: ["MANAGE", "CREATE_CONTENT"] },
    { id: "p2", name: "Also mine", access_token: "ptok2", tasks: ["CREATE_CONTENT"] },
  ] })]);
  expect(await facebook.exchange(c, { code: "code1", codeVerifier: "unused" })).toEqual({ accessToken: "ptok1", refreshToken: null, expiresAt: null, scopes: SCOPES });
  expect(calls).toHaveLength(3);
  expect(query(calls[0].url)).toMatchObject({ code: "code1" });
});

test("exchange with no Page the user can post to explains what to do", async () => {
  const c = ctx([...tokenCalls(), ok({ data: [{ id: "p0", name: "Ads only", access_token: "ptok0", tasks: ["ADVERTISE"] }] })]);
  await expect(facebook.exchange(c.ctx, { code: "c", codeVerifier: "" })).rejects.toMatchObject({
    platform: "facebook", status: 400, code: "platform_error",
    message: "No Facebook Page you can post to was found. Create a Page (or pick it in the Facebook dialog) and connect again.",
  });
  await expect(facebook.exchange(ctx([...tokenCalls(), ok({ data: [] })]).ctx, { code: "c", codeVerifier: "" })).rejects.toMatchObject({ status: 400 });
});

test("refresh is never possible: reconnect", async () => {
  await expect(facebook.refresh(ctx([]).ctx, "x")).rejects.toMatchObject({ platform: "facebook", status: 401, message: "Reconnect Facebook in Accounts." });
});

test("revoke makes no call", async () => {
  const { ctx: c, calls } = ctx([]);
  await facebook.revoke(c, { accessToken: "ptok", refreshToken: null });
  expect(calls).toHaveLength(0);
});

test("profile reads the Page behind the Page token", async () => {
  const { ctx: c, calls } = ctx([ok({ id: "p1", name: "My Page", picture: { data: { url: "https://pic/p1.jpg" } } })]);
  expect(await facebook.profile(c, "ptok")).toEqual({ accountId: "p1", displayName: "My Page", avatarUrl: "https://pic/p1.jpg" });
  expect(calls[0].url.split("?")[0]).toBe(`${GRAPH}/me`);
  expect(query(calls[0].url)).toEqual({ fields: "id,name,picture{url}", access_token: "ptok" });
  expect(await facebook.profile(ctx([ok({ id: "p2" })]).ctx, "ptok")).toEqual({ accountId: "p2", displayName: "Facebook Page", avatarUrl: null });
  await expect(facebook.profile(ctx([ok({})]).ctx, "ptok")).rejects.toMatchObject({ status: 502 });
});

test("prepare starts a Reel upload and hands the phone Meta's upload host with the documented headers", async () => {
  const { ctx: c, calls } = ctx([ok({ id: "p1" }), ok({ video_id: "vid1", upload_url: UPLOAD })]);
  const r = await facebook.prepare(c, "ptok", INPUT);
  expect(calls).toHaveLength(2);
  expect(calls[0].url.split("?")[0]).toBe(`${GRAPH}/me`);
  expect(query(calls[0].url)).toEqual({ fields: "id", access_token: "ptok" });
  expect(calls[1].url).toBe(`${GRAPH}/p1/video_reels`);
  expect(calls[1].init.method).toBe("POST");
  expect(form(calls[1].init)).toEqual({ upload_phase: "start", access_token: "ptok" });
  expect(r).toEqual({
    protocol: "meta-rupload", uploadUrl: UPLOAD,
    uploadHeaders: { Authorization: "OAuth ptok", offset: "0", file_size: String(INPUT.fileSize) },
    chunkSize: INPUT.fileSize, ref: { videoId: "vid1", pageId: "p1" },
    wait: { maxSeconds: 300, intervalSeconds: 10, resumeOnTimeout: false },
  });
});

test("prepare returns the canonical (checked) upload address", async () => {
  const canonical = "https://rupload.facebook.com/video-upload/vid1?a=1";
  const r = await facebook.prepare(ctx([ok({ id: "p1" }), ok({ video_id: "vid1", upload_url: canonical })]).ctx, "ptok", INPUT);
  expect(r.uploadUrl).toBe(new URL(canonical).href);
  expect(r.uploadUrl).toBe(canonical);
});

test.each([
  "https://evil.example/video-upload/vid1",
  "https://rupload.facebook.com.evil.example/x",
  "http://rupload.facebook.com/video-upload/vid1",
  "https://rupload.facebook.com@evil.example/",
  "https://rupload.facebook.com\\@evil.example/x",
  "https://RUPLOAD.facebook.com/x",
])("prepare with a hostile upload_url %j rejects (502) with neither the URL nor the token in the error", async (upload_url) => {
  const e = (await facebook.prepare(ctx([ok({ id: "p1" }), ok({ video_id: "vid1", upload_url })]).ctx, "ptok-0123456789abcdef", INPUT).catch((x: unknown) => x)) as PlatformError;
  expect(e).toBeInstanceOf(PlatformError);
  expect(e).toMatchObject({ platform: "facebook", status: 502, message: "Meta returned an unexpected upload address." });
  const all = JSON.stringify({ ...e, message: e.message });
  expect(all).not.toContain("ptok");
  expect(all).not.toContain(upload_url);
  expect(all).not.toContain("evil");
});

test("prepare without video_id or upload_url is a 502", async () => {
  await expect(facebook.prepare(ctx([ok({ id: "p1" }), ok({ upload_url: UPLOAD })]).ctx, "ptok", INPUT)).rejects.toMatchObject({ status: 502, message: "Facebook did not return an upload address." });
  await expect(facebook.prepare(ctx([ok({ id: "p1" }), ok({ video_id: "vid1" })]).ctx, "ptok", INPUT)).rejects.toMatchObject({ status: 502, message: "Facebook did not return an upload address." });
});

const st = (video_status: string, extra: Record<string, unknown> = {}) => ok({ id: "vid1", status: { video_status, ...extra } });

test("finalize sends the finish call with the caption, then reads the status", async () => {
  const s = { ref: { videoId: "vid1", pageId: "p1" }, input: INPUT, clientResult: null, account };
  const a = ctx([ok({ success: true }), st("processing", { processing_phase: { status: "in_progress" } })]);
  expect(await facebook.finalize(a.ctx, "ptok", s)).toEqual({ status: "processing" });
  expect(a.calls[0].url).toBe(`${GRAPH}/p1/video_reels`);
  expect(a.calls[0].init.method).toBe("POST");
  expect(form(a.calls[0].init)).toEqual({ video_id: "vid1", upload_phase: "finish", video_state: "PUBLISHED", description: "Beach day", access_token: "ptok" });
  expect(a.calls[1].url.split("?")[0]).toBe(`${GRAPH}/vid1`);
  expect(query(a.calls[1].url)).toEqual({ fields: "status", access_token: "ptok" });
  const b = ctx([ok({ success: true }), st("ready", { publishing_phase: { status: "complete", publish_status: "published" } })]);
  expect(await facebook.finalize(b.ctx, "ptok", s)).toEqual({ status: "done", url: "https://www.facebook.com/reel/vid1" });
});

test("finalize with a missing reference is final", async () => {
  await expect(facebook.finalize(ctx([]).ctx, "ptok", { ref: {}, input: INPUT, clientResult: null, account })).rejects.toMatchObject({ status: 502, code: "platform_error" });
});

test("status: processing, ready, published, error", async () => {
  const ref = { videoId: "vid1", pageId: "p1" };
  expect(await facebook.status(ctx([st("processing")]).ctx, "ptok", ref)).toEqual({ status: "processing" });
  expect(await facebook.status(ctx([st("upload_complete")]).ctx, "ptok", ref)).toEqual({ status: "processing" });
  expect(await facebook.status(ctx([st("ready")]).ctx, "ptok", ref)).toEqual({ status: "done", url: "https://www.facebook.com/reel/vid1" });
  expect(await facebook.status(ctx([st("processing", { publishing_phase: { publish_status: "published" } })]).ctx, "ptok", ref)).toEqual({ status: "done", url: "https://www.facebook.com/reel/vid1" });
  await expect(facebook.status(ctx([st("error")]).ctx, "ptok", ref)).rejects.toMatchObject({ status: 400, code: "platform_error", reason: "error", message: "Facebook couldn't process this video." });
  await expect(facebook.status(ctx([st("error", { processing_phase: { status: "error", error: { message: "Video is too long." } } })]).ctx, "ptok", ref))
    .rejects.toMatchObject({ status: 400, message: "Facebook couldn't process this video. Video is too long." });
  await expect(facebook.status(ctx([st("expired")]).ctx, "ptok", ref)).rejects.toMatchObject({ status: 400, reason: "expired" });
  await expect(facebook.status(ctx([st("upload_failed")]).ctx, "ptok", ref)).rejects.toMatchObject({ status: 400, reason: "upload_failed" });
  await expect(facebook.status(ctx([]).ctx, "ptok", {})).rejects.toMatchObject({ code: "platform_error" });
});

test.each([
  ["uploading_phase", { uploading_phase: { status: "error", errors: [{ message: "Upload was cut short." }] } }, "Upload was cut short."],
  ["processing_phase", { processing_phase: { status: "error", error: { message: "Unsupported codec." } } }, "Unsupported codec."],
  ["publishing_phase", { publishing_phase: { status: "error", error: { message: "Publishing failed." } } }, "Publishing failed."],
])("a %s in error fails at once (no polling until the wait runs out)", async (phase, extra, detail) => {
  await expect(facebook.status(ctx([st("processing", extra)]).ctx, "ptok", { videoId: "vid1", pageId: "p1" }))
    .rejects.toMatchObject({ status: 400, code: "platform_error", reason: `${phase}_error`, message: `Facebook couldn't process this video. ${detail}` });
  await expect(facebook.status(ctx([st("processing", { [phase]: { status: "error" } })]).ctx, "ptok", { videoId: "vid1", pageId: "p1" }))
    .rejects.toMatchObject({ status: 400, message: "Facebook couldn't process this video." });
});

test("a temporary Graph failure in status is platform_unavailable", async () => {
  await expect(facebook.status(ctx([new Response(JSON.stringify({ error: { code: 2, message: "Service temporarily unavailable" } }), { status: 500 })]).ctx, "ptok", { videoId: "v", pageId: "p" }))
    .rejects.toMatchObject({ status: 503, code: "platform_unavailable" });
});

describe("after finish, only Meta's own failure report is final (no second Reel)", () => {
  const s = { ref: { videoId: "vid1", pageId: "p1" }, input: INPUT, clientResult: null, account };
  const ref = { videoId: "vid1", pageId: "p1" };
  const graphError = (status: number, code: number, message = "Meta said no") => new Response(JSON.stringify({ error: { code, message } }), { status });
  const REEL = { status: "done", url: "https://www.facebook.com/reel/vid1" };

  test("finish OK, then the status read is refused (#100, 400): processing, not failed", async () => {
    const a = ctx([ok({ success: true }), graphError(400, 100, "Unsupported get request.")]);
    expect(await facebook.finalize(a.ctx, "ptok", s)).toEqual({ status: "processing" });
    expect(a.calls).toHaveLength(2);
  });
  test("finish OK, then the status read fails temporarily or cannot be reached: processing", async () => {
    expect(await facebook.finalize(ctx([ok({ success: true }), graphError(500, 2)]).ctx, "ptok", s)).toEqual({ status: "processing" });
    expect(await facebook.finalize(ctx([ok({ success: true }), () => { throw new TypeError("network down"); }]).ctx, "ptok", s)).toEqual({ status: "processing" });
  });
  test("finish OK, then an auth error on the status read still asks to reconnect", async () => {
    await expect(facebook.finalize(ctx([ok({ success: true }), graphError(400, 190)]).ctx, "ptok", s)).rejects.toMatchObject({ status: 401 });
  });
  test("finish OK, then Meta reports an error phase: final", async () => {
    await expect(facebook.finalize(ctx([ok({ success: true }), st("error")]).ctx, "ptok", s)).rejects.toMatchObject({ status: 400, code: "platform_error", reason: "error" });
  });

  test("a second finish refused after the first succeeded: the status decides (processing or done), never failed", async () => {
    const refused = () => graphError(400, 100, "Video already finished.");
    const a = ctx([refused(), st("processing", { publishing_phase: { status: "in_progress" } })]);
    expect(await facebook.finalize(a.ctx, "ptok", s)).toEqual({ status: "processing" });
    expect(a.calls).toHaveLength(2);
    expect(a.calls[1].url.split("?")[0]).toBe(`${GRAPH}/vid1`);
    expect(await facebook.finalize(ctx([refused(), st("processing")]).ctx, "ptok", s)).toEqual({ status: "processing" });
    expect(await facebook.finalize(ctx([refused(), st("ready")]).ctx, "ptok", s)).toEqual(REEL);
    expect(await facebook.finalize(ctx([refused(), st("processing", { publishing_phase: { status: "complete", publish_status: "published" } })]).ctx, "ptok", s)).toEqual(REEL);
  });
  test("a refused finish whose status read also fails is temporary, with the finish error's words", async () => {
    const e = facebook.finalize(ctx([graphError(400, 100, "Video already finished."), graphError(400, 100, "Unsupported get request.")]).ctx, "ptok", s);
    await expect(e).rejects.toMatchObject({ status: 503, code: "platform_unavailable", message: "Video already finished.", reason: "100" });
    await expect(facebook.finalize(ctx([graphError(400, 100, "Nope."), () => { throw new TypeError("down"); }]).ctx, "ptok", s))
      .rejects.toMatchObject({ status: 503, code: "platform_unavailable", message: "Nope." });
  });
  test("a refused finish with a status that says nothing either way is temporary", async () => {
    await expect(facebook.finalize(ctx([graphError(400, 100, "Nope."), st("upload_complete")]).ctx, "ptok", s))
      .rejects.toMatchObject({ status: 503, code: "platform_unavailable", message: "Nope." });
  });
  test("a temporary finish failure stays as it was when the look cannot decide", async () => {
    await expect(facebook.finalize(ctx([graphError(500, 2, "Service temporarily unavailable"), graphError(500, 2)]).ctx, "ptok", s))
      .rejects.toMatchObject({ status: 503, message: "Service temporarily unavailable" });
  });
  test("a refused finish is final only when Meta shows publishing has not started", async () => {
    await expect(facebook.finalize(ctx([graphError(400, 100, "Bad description."), st("upload_complete", { publishing_phase: { status: "not_started" } })]).ctx, "ptok", s))
      .rejects.toMatchObject({ status: 400, code: "platform_error", message: "Bad description.", reason: "100" });
  });
  test("a refused finish with Meta's error phase is final with Meta's report", async () => {
    await expect(facebook.finalize(ctx([graphError(400, 100, "Nope."), st("processing", { processing_phase: { status: "error", error: { message: "Unsupported codec." } } })]).ctx, "ptok", s))
      .rejects.toMatchObject({ status: 400, code: "platform_error", message: "Facebook couldn't process this video. Unsupported codec." });
  });
  test("an auth refusal of finish asks to reconnect without reading the status", async () => {
    const a = ctx([graphError(400, 190, "Session expired.")]);
    await expect(facebook.finalize(a.ctx, "ptok", s)).rejects.toMatchObject({ status: 401 });
    expect(a.calls).toHaveLength(1);
  });

  test("status: an unrecognised Graph 4xx (#100) is temporary (platform_unavailable), with Meta's words", async () => {
    await expect(facebook.status(ctx([graphError(400, 100, "Unsupported get request.")]).ctx, "ptok", ref))
      .rejects.toMatchObject({ status: 503, code: "platform_unavailable", message: "Unsupported get request.", reason: "100" });
    await expect(facebook.status(ctx([new Response("nope", { status: 404 })]).ctx, "ptok", ref)).rejects.toMatchObject({ status: 503, code: "platform_unavailable" });
  });
  test("status: an auth error is still an auth error", async () => {
    const e = (await facebook.status(ctx([graphError(400, 200, "Permission denied.")]).ctx, "ptok", ref).catch((x: unknown) => x)) as PlatformError;
    expect(e).toMatchObject({ status: 400, reason: "200" });
    expect(facebook.isAuthError!(e)).toBe(true);
  });
  test("status: Meta's error phase is final", async () => {
    await expect(facebook.status(ctx([st("processing", { publishing_phase: { status: "error" } })]).ctx, "ptok", ref)).rejects.toMatchObject({ status: 400, code: "platform_error" });
  });
});

test("isAuthError is Meta's", () => {
  const e = (reason: string) => Object.assign(new PlatformError("facebook", 400, "m"), { reason });
  expect(facebook.isAuthError!(e("190"))).toBe(true);
  expect(facebook.isAuthError!(e("200"))).toBe(true);
  expect(facebook.isAuthError!(e("100"))).toBe(false);
});
