/**
 * PROOF: the TikTok draft (inbox) path as it was before Direct Post existed. Written against the untouched code and never edited
 * to make a change pass: a red test here means the change broke drafts.
 */
import { postPrepare } from "../handlers/postPrepare.ts";
import { tiktok } from "../platforms/tiktok.ts";
import { saveTokens } from "../tokens.ts";
import type { AdapterCtx } from "../types.ts";
import { fakeDeps, INPUT, tokens, USER } from "./fakes.ts";

type Call = { url: string; init: RequestInit };
function scripted(responses: Response[]): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const f = (async (url: string, init: RequestInit = {}) => { calls.push({ url: String(url), init }); return responses.shift()!; }) as unknown as typeof fetch;
  return { fetch: f, calls };
}
const ENV: Record<string, string> = { TIKTOK_CLIENT_KEY: "ck", TIKTOK_CLIENT_SECRET: "cs" };
const env = { get: (n: string) => ENV[n] };
const ctxOf = (f: typeof fetch): AdapterCtx => ({ fetch: f, env, redirectUri: "https://ref.supabase.co/functions/v1/oauth-callback" });
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const err = (code: string, message = "", status = 200) => new Response(JSON.stringify({ data: {}, error: { code, message, log_id: "l" } }), { status });
const URL_UP = "https://open-upload.tiktokapis.com/video/?upload_id=1&upload_token=x";
const inboxOk = () => ok({ data: { publish_id: "v_inbox_file~v2.1", upload_url: URL_UP }, error: { code: "ok", message: "" } });
const SIZE = 25 * 1024 * 1024;
const BODY = { source_info: { source: "FILE_UPLOAD", video_size: SIZE, chunk_size: 10 * 1024 * 1024, total_chunk_count: 2 } };
const RESULT = { protocol: "tiktok-chunks", uploadUrl: URL_UP, uploadHeaders: {}, chunkSize: 10 * 1024 * 1024, ref: { publishId: "v_inbox_file~v2.1" } };

test.each([
  [{}], [{ mode: "draft" }], [{ mode: "Direct" }], [{ mode: 1 }], [{ mode: null }], [{ privacy: "SELF_ONLY", allowComment: true }],
])("PROOF: options %j take the inbox route: one call, the same body, the same five keys", async (options) => {
  const s = scripted([inboxOk()]);
  const r = await tiktok.prepare(ctxOf(s.fetch), "at", { ...INPUT, fileSize: SIZE, caption: "A caption that drafts never send", options: options as Record<string, unknown> });
  expect(s.calls).toHaveLength(1);
  expect(s.calls[0].url).toBe("https://open.tiktokapis.com/v2/post/publish/inbox/video/init/");
  expect(s.calls[0].init.method).toBe("POST");
  expect(s.calls[0].init.headers).toEqual({ Authorization: "Bearer at", "Content-Type": "application/json; charset=UTF-8" });
  expect(JSON.parse(s.calls[0].init.body as string)).toEqual(BODY);
  expect(r).toEqual(RESULT);
  expect(Object.keys(r).sort()).toEqual(["chunkSize", "protocol", "ref", "uploadHeaders", "uploadUrl"]);
});

test.each([
  ["spam_risk_too_many_pending_share", "At most 5", 403, "TikTok allows 5 unfinished drafts a day. Open TikTok and post or delete some first.", "platform_error"],
  ["spam_risk_too_many_posts", "Too many posts", 403, "Too many posts", "platform_error"],
  ["spam_risk_user_banned_from_posting", "Banned", 403, "Banned", "platform_error"],
  ["reached_active_user_cap", "Cap", 403, "Cap", "platform_error"],
  ["unaudited_client_can_only_post_to_private_accounts", "Private only", 403, "Private only", "platform_error"],
  ["privacy_level_option_mismatch", "Mismatch", 400, "Mismatch", "platform_error"],
  ["invalid_param", "chunk_size is invalid", 400, "chunk_size is invalid", "platform_error"],
  ["rate_limit_exceeded", "", 429, "TikTok is busy — wait a minute, then try again.", "platform_unavailable"],
  ["internal_error", "", 500, "TikTok is having trouble — try again.", "platform_unavailable"],
  ["scope_not_authorized", "No scope", 401, "No scope", "platform_error"],
  ["access_token_invalid", "Bad token", 401, "Bad token", "platform_error"],
])("PROOF: a draft init that TikTok answers with %s (inside a 200) keeps its status, words and code", async (code, message, status, said, clipy) => {
  const s = scripted([err(code, message)]);
  await expect(tiktok.prepare(ctxOf(s.fetch), "at", INPUT)).rejects.toMatchObject({ platform: "tiktok", status, reason: code, message: said, code: clipy });
  expect(s.calls).toHaveLength(1);
});

test("PROOF: a draft's status and finalize answer and fail in the same words", async () => {
  const st = (status: string, extra = {}) => ok({ data: { status, ...extra }, error: { code: "ok", message: "" } });
  const ref = { publishId: "p1" };
  const fin = { ref, input: INPUT, clientResult: null, account: { accountId: "o1", displayName: "Mo", avatarUrl: null } };
  const a = scripted([st("PROCESSING_UPLOAD")]);
  expect(await tiktok.finalize(ctxOf(a.fetch), "at", fin)).toEqual({ status: "processing" });
  expect(a.calls[0].url).toBe("https://open.tiktokapis.com/v2/post/publish/status/fetch/");
  expect(JSON.parse(a.calls[0].init.body as string)).toEqual({ publish_id: "p1" });
  expect(await tiktok.status(ctxOf(scripted([st("SEND_TO_USER_INBOX")]).fetch), "at", ref)).toEqual({ status: "done", url: null });
  expect(await tiktok.status(ctxOf(scripted([st("PUBLISH_COMPLETE", { publicaly_available_post_id: [7300000000000000000] })]).fetch), "at", ref)).toEqual({ status: "done", url: null });
  for (const reason of ["file_format_check_failed", "spam_risk_text", "spam_risk", "auth_removed", "spam_risk_too_many_posts"]) {
    await expect(tiktok.status(ctxOf(scripted([st("FAILED", { fail_reason: reason })]).fetch), "at", ref))
      .rejects.toMatchObject({ status: 400, code: "platform_error", reason, message: `TikTok couldn't use this video: ${reason}.` });
  }
  await expect(tiktok.status(ctxOf(scripted([st("FAILED", { fail_reason: "internal" })]).fetch), "at", ref)).rejects.toMatchObject({ message: "TikTok had a problem processing the video." });
});

async function connected(responses: Response[]) {
  const s = scripted(responses);
  const deps = fakeDeps({ env, fetch: s.fetch, adapters: { tiktok } });
  await saveTokens(deps, USER, "tiktok", tokens({ scopes: "user.info.basic,video.upload" }), { accountId: "o1", displayName: "Mo", avatarUrl: null });
  return { deps, calls: s.calls };
}
const REQUEST = { platform: "tiktok", fileSize: SIZE, durationSec: 21, mimeType: "video/mp4", caption: "Beach day", options: {} };

test("PROOF: post-prepare for a draft answers with exactly the same keys and stores the same session", async () => {
  const { deps, calls } = await connected([inboxOk()]);
  const r = await postPrepare(deps, USER, REQUEST);
  expect(r).toEqual({ sessionId: expect.any(String), ...RESULT, ref: undefined });
  expect(Object.keys(r).sort()).toEqual(["chunkSize", "protocol", "sessionId", "uploadHeaders", "uploadUrl"]);
  expect(calls).toHaveLength(1);
  expect(calls[0].init.headers).toEqual({ Authorization: "Bearer access-1", "Content-Type": "application/json; charset=UTF-8" });
  expect(await deps.db.getSession(r.sessionId)).toMatchObject({ platform: "tiktok", status: "uploading", ref: { publishId: "v_inbox_file~v2.1" }, input: { caption: "Beach day", options: {} } });
});

test("PROOF: a draft refused for a missing permission is `reconnect` and flags the account", async () => {
  const { deps } = await connected([err("scope_not_authorized", "No scope", 401)]);
  await expect(postPrepare(deps, USER, REQUEST)).rejects.toMatchObject({ status: 401, code: "reconnect" });
  expect((await deps.db.getAccount(USER, "tiktok"))!.meta.needsReconnect).toBe(true);
});
