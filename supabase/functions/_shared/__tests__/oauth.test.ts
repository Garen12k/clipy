import { challengeFor } from "../pkce.ts";
import { oauthCallback } from "../handlers/oauthCallback.ts";
import { oauthStart } from "../handlers/oauthStart.ts";
import { PlatformError } from "../errors.ts";
import { fakeAdapter, fakeDeps, USER } from "./fakes.ts";

const RETURN = "exp://192.168.1.142:8090/--/oauth";
const cb = (q: string) => new URL(`https://ref.supabase.co/functions/v1/oauth-callback?${q}`);

test("start stores a single-use state with a PKCE verifier and returns the platform URL", async () => {
  const deps = fakeDeps();
  const { authUrl } = await oauthStart(deps, USER, { platform: "youtube", returnUrl: RETURN });
  const state = new URL(authUrl).searchParams.get("state")!;
  const call = (deps.adapters.youtube!.authUrl as jest.Mock).mock.calls[0][1];
  const row = (await deps.db.takeState(state))!;
  expect(row).toMatchObject({ userId: USER, platform: "youtube", returnUrl: RETURN, expiresAt: "2026-10-02T10:10:00.000Z" });
  expect(call.codeChallenge).toBe(await challengeFor(row.codeVerifier));
});

test.each([
  [{ platform: "myspace", returnUrl: RETURN }, "bad_request"],
  [{ platform: "youtube", returnUrl: "https://evil.example/steal" }, "bad_request"],
  [{ platform: "tiktok", returnUrl: RETURN }, "unavailable"],
])("start rejects %j", async (body, code) => {
  await expect(oauthStart(fakeDeps(), USER, body)).rejects.toMatchObject({ code });
});

test.each([
  ["a fragment", `${RETURN}#frag`],
  ["an over-long address", `exp://${"a".repeat(501)}`],
])("start rejects a returnUrl with %s", async (_n, returnUrl) => {
  await expect(oauthStart(fakeDeps(), USER, { platform: "youtube", returnUrl })).rejects.toMatchObject({ code: "bad_request" });
});

test("a returnUrl that already has a query is accepted and the callback appends with &", async () => {
  const deps = fakeDeps();
  const returnUrl = "exp://h/--/oauth?x=1";
  const { authUrl } = await oauthStart(deps, USER, { platform: "youtube", returnUrl });
  const state = new URL(authUrl).searchParams.get("state")!;
  const { redirect } = await oauthCallback(deps, cb(`code=abc&state=${state}`));
  expect(redirect).toBe("exp://h/--/oauth?x=1&status=ok&platform=youtube");
});

test("start reports unavailable when a secret is missing", async () => {
  const deps = fakeDeps({ env: { get: () => undefined } });
  await expect(oauthStart(deps, USER, { platform: "youtube", returnUrl: RETURN })).rejects.toMatchObject({ status: 409, code: "unavailable" });
});

test("callback exchanges the code, saves the account and returns to the app", async () => {
  const deps = fakeDeps();
  const { authUrl } = await oauthStart(deps, USER, { platform: "youtube", returnUrl: RETURN });
  const state = new URL(authUrl).searchParams.get("state")!;
  const { redirect } = await oauthCallback(deps, cb(`code=abc&state=${state}`));
  expect(redirect).toBe(`${RETURN}?status=ok&platform=youtube`);
  expect(deps.adapters.youtube!.exchange).toHaveBeenCalledWith(expect.anything(), { code: "abc", codeVerifier: expect.any(String) });
  expect(await deps.db.getAccount(USER, "youtube")).toMatchObject({ accountId: "UC123", displayName: "My Channel" });
  expect(await deps.db.takeState(state)).toBeNull();
});

test("callback: the user said no", async () => {
  const deps = fakeDeps();
  const { authUrl } = await oauthStart(deps, USER, { platform: "youtube", returnUrl: RETURN });
  const state = new URL(authUrl).searchParams.get("state")!;
  const { redirect } = await oauthCallback(deps, cb(`error=access_denied&state=${state}`));
  expect(redirect).toBe(`${RETURN}?status=cancelled&platform=youtube`);
});

test("callback: platform failure comes back as an error with the platform's words", async () => {
  const adapter = fakeAdapter({ exchange: jest.fn(async () => { throw new PlatformError("youtube", 400, "Bad Request"); }) });
  const deps = fakeDeps({ adapters: { youtube: adapter } });
  const { authUrl } = await oauthStart(deps, USER, { platform: "youtube", returnUrl: RETURN });
  const state = new URL(authUrl).searchParams.get("state")!;
  const { redirect } = await oauthCallback(deps, cb(`code=abc&state=${state}`));
  expect(redirect).toBe(`${RETURN}?status=error&platform=youtube&message=Bad%20Request`);
});

async function callbackWith(over: Parameters<typeof fakeAdapter>[0], depsOver: Parameters<typeof fakeDeps>[0] = {}) {
  const adapter = fakeAdapter(over);
  const deps = fakeDeps({ adapters: { youtube: adapter }, ...depsOver });
  const { authUrl } = await oauthStart(deps, USER, { platform: "youtube", returnUrl: RETURN });
  const state = new URL(authUrl).searchParams.get("state")!;
  return { adapter, deps, ...(await oauthCallback(deps, cb(`code=abc&state=${state}`))) };
}

test("callback: a failed exchange revokes nothing", async () => {
  const { adapter } = await callbackWith({ exchange: jest.fn(async () => { throw new PlatformError("youtube", 400, "Bad Request"); }) });
  expect(adapter.revoke).not.toHaveBeenCalled();
});

test("callback: profile failing after the exchange revokes the new grant and keeps the platform's message", async () => {
  const { adapter, deps, redirect } = await callbackWith({ profile: jest.fn(async () => { throw new PlatformError("youtube", 400, "This Google account has no YouTube channel yet."); }) });
  expect(adapter.revoke).toHaveBeenCalledWith(expect.anything(), { accessToken: "access-1", refreshToken: "refresh-1" });
  expect(redirect).toBe(`${RETURN}?status=error&platform=youtube&message=${encodeURIComponent("This Google account has no YouTube channel yet.")}`);
  expect(await deps.db.getAccount(USER, "youtube")).toBeNull();
});

test("callback: saving failing after the exchange revokes the new grant", async () => {
  const err = jest.spyOn(console, "error").mockImplementation(() => {});
  const { adapter, redirect } = await callbackWith({}, { key: async () => { throw new Error("TOKEN_ENC_KEY missing"); } });
  expect(adapter.revoke).toHaveBeenCalledWith(expect.anything(), { accessToken: "access-1", refreshToken: "refresh-1" });
  expect(redirect).toBe(`${RETURN}?status=error&platform=youtube&message=${encodeURIComponent("Something went wrong.")}`);
  err.mockRestore();
});

test("callback: a revoke failure never masks the original error", async () => {
  const err = jest.spyOn(console, "error").mockImplementation(() => {});
  const { adapter, redirect } = await callbackWith({
    profile: jest.fn(async () => { throw new PlatformError("youtube", 403, "Channel suspended."); }),
    revoke: jest.fn(async () => { throw new TypeError("fetch failed"); }),
  });
  expect(adapter.revoke).toHaveBeenCalled();
  expect(redirect).toBe(`${RETURN}?status=error&platform=youtube&message=${encodeURIComponent("Channel suspended.")}`);
  expect(JSON.stringify(err.mock.calls)).not.toContain("access-1");
  err.mockRestore();
});

test("callback: unknown or expired state throws (there is nowhere safe to redirect)", async () => {
  await expect(oauthCallback(fakeDeps(), cb("code=abc&state=nope"))).rejects.toMatchObject({ status: 400, code: "bad_state" });
  const deps = fakeDeps();
  await deps.db.putState({ state: "old", userId: USER, platform: "youtube", codeVerifier: "v", returnUrl: RETURN, expiresAt: "2026-10-02T09:59:59.000Z" });
  await expect(oauthCallback(deps, cb("code=abc&state=old"))).rejects.toMatchObject({ code: "bad_state" });
});
