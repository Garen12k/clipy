import { ApiError, PlatformError } from "../errors.ts";
import { creatorInfo } from "../handlers/creatorInfo.ts";
import { tiktok } from "../platforms/tiktok.ts";
import { saveTokens } from "../tokens.ts";
import type { CreatorInfo } from "../types.ts";
import { fakeAdapter, fakeDeps, tokens, USER } from "./fakes.ts";

const ENV: Record<string, string> = { TIKTOK_CLIENT_KEY: "ck", TIKTOK_CLIENT_SECRET: "cs", TIKTOK_DIRECT_POST: "true", YOUTUBE_CLIENT_ID: "cid", YOUTUBE_CLIENT_SECRET: "secret" };
const env = { get: (n: string) => ENV[n] };
const INFO: CreatorInfo = { nickname: "Sunny", username: "sunny", avatarUrl: null, privacyOptions: ["SELF_ONLY"], commentDisabled: false, duetDisabled: true, stitchDisabled: true, maxDurationSec: 300 };
const profile = { accountId: "o1", displayName: "Mo", avatarUrl: null };
const fakeTikTok = (creator: jest.Mock) => fakeAdapter({ id: "tiktok", secrets: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"], creatorInfo: creator, isAuthError: tiktok.isAuthError });
async function connected(creator: jest.Mock, scopes = "user.info.basic,video.upload,video.publish") {
  const deps = fakeDeps({ env, adapters: { tiktok: fakeTikTok(creator), youtube: fakeAdapter() } });
  await saveTokens(deps, USER, "tiktok", tokens({ scopes }), profile);
  return deps;
}

test("asks the adapter with the user's token and the stored scopes, and returns its answer as it is", async () => {
  const creator = jest.fn(async () => INFO);
  const deps = await connected(creator);
  expect(await creatorInfo(deps, USER, { platform: "tiktok" })).toEqual(INFO);
  expect(creator).toHaveBeenCalledWith(expect.anything(), "access-1", { scopes: "user.info.basic,video.upload,video.publish" });
});

test.each([[null], [{}], [{ platform: "myspace" }], [{ platform: 5 }]])("an unknown platform %j is a bad request", async (body) => {
  await expect(creatorInfo(await connected(jest.fn()), USER, body)).rejects.toMatchObject({ status: 400, code: "bad_request" });
});

test("a platform without posting details is a bad request; one that is not set up is unavailable; not connected says so", async () => {
  const deps = await connected(jest.fn());
  await expect(creatorInfo(deps, USER, { platform: "youtube" })).rejects.toMatchObject({ status: 400, code: "bad_request", message: "This platform has no posting details." });
  await expect(creatorInfo(fakeDeps({ adapters: { tiktok: fakeTikTok(jest.fn()) } }), USER, { platform: "tiktok" })).rejects.toMatchObject({ status: 409, code: "unavailable" });
  await expect(creatorInfo(fakeDeps({ env, adapters: { tiktok: fakeTikTok(jest.fn()) } }), USER, { platform: "tiktok" })).rejects.toMatchObject({ code: "not_connected" });
});

test("needs_permission passes through and the account is NOT flagged: drafts keep working", async () => {
  const deps = await connected(jest.fn(async () => { throw new ApiError(403, "needs_permission", "Reconnect TikTok to allow posting directly, or choose Send as draft in the TikTok options."); }));
  await expect(creatorInfo(deps, USER, { platform: "tiktok" })).rejects.toMatchObject({ status: 403, code: "needs_permission" });
  expect((await deps.db.getAccount(USER, "tiktok"))!.meta.needsReconnect).toBeUndefined();
});

test("an invalid token is reconnect and flags the account; a plain refusal does neither", async () => {
  const bad = Object.assign(new PlatformError("tiktok", 401, "bad"), { reason: "access_token_invalid" });
  const a = await connected(jest.fn(async () => { throw bad; }));
  await expect(creatorInfo(a, USER, { platform: "tiktok" })).rejects.toMatchObject({ status: 401, code: "reconnect" });
  expect((await a.db.getAccount(USER, "tiktok"))!.meta.needsReconnect).toBe(true);
  const cap = Object.assign(new PlatformError("tiktok", 403, "Cap"), { reason: "reached_active_user_cap" });
  const b = await connected(jest.fn(async () => { throw cap; }));
  await expect(creatorInfo(b, USER, { platform: "tiktok" })).rejects.toMatchObject({ status: 403, code: "platform_error", message: "Cap" });
  expect((await b.db.getAccount(USER, "tiktok"))!.meta.needsReconnect).toBeUndefined();
});

test("end to end with the real adapter: an old grant is told to reconnect without a call to TikTok", async () => {
  const fetchFake = jest.fn();
  const deps = fakeDeps({ env, fetch: fetchFake as unknown as typeof fetch, adapters: { tiktok } });
  await saveTokens(deps, USER, "tiktok", tokens({ scopes: "user.info.basic,video.upload" }), profile);
  await expect(creatorInfo(deps, USER, { platform: "tiktok" })).rejects.toMatchObject({ code: "needs_permission" });
  expect(fetchFake).not.toHaveBeenCalled();
  expect((await deps.db.getAccount(USER, "tiktok"))!.meta.needsReconnect).toBeUndefined();
});

test("end to end with the switch off: one plain refusal, no call to TikTok, the account not flagged — whatever the grant", async () => {
  const OFF: Record<string, string> = { TIKTOK_CLIENT_KEY: "ck", TIKTOK_CLIENT_SECRET: "cs" };
  for (const scopes of ["user.info.basic,video.upload", "user.info.basic,video.upload,video.publish"]) {
    const fetchFake = jest.fn();
    const deps = fakeDeps({ env: { get: (n: string) => OFF[n] }, fetch: fetchFake as unknown as typeof fetch, adapters: { tiktok } });
    await saveTokens(deps, USER, "tiktok", tokens({ scopes }), profile);
    const e = await creatorInfo(deps, USER, { platform: "tiktok" }).catch((x: unknown) => x);
    expect(e).not.toBeInstanceOf(PlatformError);
    expect(e).toMatchObject({ status: 409, code: "direct_off", message: "Posting straight to TikTok isn't switched on yet. Choose Send as draft." });
    expect(fetchFake).not.toHaveBeenCalled();
    expect((await deps.db.getAccount(USER, "tiktok"))!.meta.needsReconnect).toBeUndefined();
  }
});
