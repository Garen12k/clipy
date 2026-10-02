import { decrypt, importKey } from "../crypto.ts";
import { PlatformError } from "../errors.ts";
import { accessTokenFor, saveTokens, withPlatformAuth } from "../tokens.ts";
import { fakeAdapter, fakeDeps, TEST_KEY, tokens, USER } from "./fakes.ts";

const profile = { accountId: "UC123", displayName: "My Channel", avatarUrl: null };

test("saveTokens stores ciphertext, never the token", async () => {
  const deps = fakeDeps();
  await saveTokens(deps, USER, "youtube", tokens(), profile);
  const row = (await deps.db.getAccount(USER, "youtube"))!;
  expect(row.accessTokenEnc).not.toContain("access-1");
  expect(await decrypt(await importKey(TEST_KEY), row.accessTokenEnc)).toBe("access-1");
  expect(await decrypt(await importKey(TEST_KEY), row.refreshTokenEnc!)).toBe("refresh-1");
});

test("a fresh token is returned without refreshing", async () => {
  const deps = fakeDeps();
  await saveTokens(deps, USER, "youtube", tokens(), profile);
  expect((await accessTokenFor(deps, USER, "youtube")).accessToken).toBe("access-1");
  expect(deps.adapters.youtube!.refresh).not.toHaveBeenCalled();
});

test("an expiring token is refreshed, saved, and the old refresh token kept when none is returned", async () => {
  const deps = fakeDeps();
  await saveTokens(deps, USER, "youtube", tokens({ expiresAt: "2026-10-02T10:00:30.000Z" }), profile);
  expect((await accessTokenFor(deps, USER, "youtube")).accessToken).toBe("access-2");
  expect(deps.adapters.youtube!.refresh).toHaveBeenCalledWith(expect.anything(), "refresh-1");
  const row = (await deps.db.getAccount(USER, "youtube"))!;
  const key = await importKey(TEST_KEY);
  expect(await decrypt(key, row.accessTokenEnc)).toBe("access-2");
  expect(await decrypt(key, row.refreshTokenEnc!)).toBe("refresh-1");
  expect(row.expiresAt).toBe("2026-10-02T12:00:00.000Z");
});

test("a rotated refresh token replaces the old one", async () => {
  const adapter = fakeAdapter({ refresh: jest.fn(async () => tokens({ accessToken: "access-3", refreshToken: "refresh-2" })) });
  const deps = fakeDeps({ adapters: { youtube: adapter } });
  await saveTokens(deps, USER, "youtube", tokens({ expiresAt: "2026-10-02T09:00:00.000Z" }), profile);
  await accessTokenFor(deps, USER, "youtube");
  expect(await decrypt(await importKey(TEST_KEY), (await deps.db.getAccount(USER, "youtube"))!.refreshTokenEnc!)).toBe("refresh-2");
});

test("not connected -> 404 not_connected", async () => {
  await expect(accessTokenFor(fakeDeps(), USER, "youtube")).rejects.toMatchObject({ status: 404, code: "not_connected" });
});

test("refresh failure marks the account and throws reconnect", async () => {
  const adapter = fakeAdapter({ refresh: jest.fn(async () => { throw new PlatformError("youtube", 400, "Token has been expired or revoked."); }) });
  const deps = fakeDeps({ adapters: { youtube: adapter } });
  await saveTokens(deps, USER, "youtube", tokens({ expiresAt: "2026-10-02T09:00:00.000Z" }), profile);
  await expect(accessTokenFor(deps, USER, "youtube")).rejects.toMatchObject({ status: 401, code: "reconnect" });
  expect((await deps.db.getAccount(USER, "youtube"))!.meta.needsReconnect).toBe(true);
});

describe("rotating refresh tokens: two requests refreshing at once", () => {
  test("the loser of a refresh race uses the winner's fresh token and does not flag the account", async () => {
    let deps: any;
    const refresh = jest.fn(async () => {
      // Another request refreshed first and saved the rotated pair; ours is now spent.
      await saveTokens(deps, USER, "youtube", tokens({ accessToken: "access-9", refreshToken: "refresh-9", expiresAt: "2026-10-02T12:00:00.000Z" }), profile);
      throw new PlatformError("youtube", 400, "Value passed for the token was invalid.");
    });
    deps = fakeDeps({ adapters: { youtube: fakeAdapter({ refresh }) } });
    await saveTokens(deps, USER, "youtube", tokens({ expiresAt: "2026-10-02T09:00:00.000Z" }), profile);
    const r = await accessTokenFor(deps, USER, "youtube");
    expect(r.accessToken).toBe("access-9");
    expect(r.account.expiresAt).toBe("2026-10-02T12:00:00.000Z");
    const row = (await deps.db.getAccount(USER, "youtube"))!;
    expect(row.meta.needsReconnect).toBeUndefined();
    expect(await decrypt(await importKey(TEST_KEY), row.refreshTokenEnc!)).toBe("refresh-9");
  });

  test("a genuine invalid grant (row unchanged) still flags the account and throws reconnect", async () => {
    const refresh = jest.fn(async () => { throw new PlatformError("youtube", 401, "invalid_grant"); });
    const deps = fakeDeps({ adapters: { youtube: fakeAdapter({ refresh }) } });
    await saveTokens(deps, USER, "youtube", tokens({ expiresAt: "2026-10-02T09:00:00.000Z" }), profile);
    await expect(accessTokenFor(deps, USER, "youtube")).rejects.toMatchObject({ status: 401, code: "reconnect" });
    expect((await deps.db.getAccount(USER, "youtube"))!.meta.needsReconnect).toBe(true);
  });

  test("a changed row that is still expiring is not trusted: reconnect, flagged on the newest row", async () => {
    let deps: any;
    const refresh = jest.fn(async () => {
      await saveTokens(deps, USER, "youtube", tokens({ accessToken: "access-9", refreshToken: "refresh-9", expiresAt: "2026-10-02T09:30:00.000Z" }), profile);
      throw new PlatformError("youtube", 400, "invalid");
    });
    deps = fakeDeps({ adapters: { youtube: fakeAdapter({ refresh }) } });
    await saveTokens(deps, USER, "youtube", tokens({ expiresAt: "2026-10-02T09:00:00.000Z" }), profile);
    await expect(accessTokenFor(deps, USER, "youtube")).rejects.toMatchObject({ code: "reconnect" });
    const row = (await deps.db.getAccount(USER, "youtube"))!;
    expect(row.meta.needsReconnect).toBe(true);
    expect(await decrypt(await importKey(TEST_KEY), row.refreshTokenEnc!)).toBe("refresh-9");
  });
});

test("expired with no refresh token -> reconnect", async () => {
  const deps = fakeDeps();
  await saveTokens(deps, USER, "youtube", tokens({ refreshToken: null, expiresAt: "2026-10-02T09:00:00.000Z" }), profile);
  await expect(accessTokenFor(deps, USER, "youtube")).rejects.toMatchObject({ status: 401, code: "reconnect" });
  expect((await deps.db.getAccount(USER, "youtube"))!.meta.needsReconnect).toBe(true);
});

test.each([500, 503, 408, 429])("a platform %i on refresh becomes 502 platform_unreachable and does not flag the account", async (status) => {
  const adapter = fakeAdapter({ refresh: jest.fn(async () => { throw new PlatformError("youtube", status, "down"); }) });
  const deps = fakeDeps({ adapters: { youtube: adapter } });
  await saveTokens(deps, USER, "youtube", tokens({ expiresAt: "2026-10-02T09:00:00.000Z" }), profile);
  const err = await accessTokenFor(deps, USER, "youtube").catch((e: unknown) => e);
  expect(err).toMatchObject({ status: 502, code: "platform_unreachable" });
  expect(err).not.toBeInstanceOf(PlatformError);
  expect((await deps.db.getAccount(USER, "youtube"))!.meta.needsReconnect).toBeUndefined();
});

test("another platform 4xx on refresh is rethrown as the platform's error", async () => {
  const adapter = fakeAdapter({ refresh: jest.fn(async () => { throw new PlatformError("youtube", 403, "Forbidden."); }) });
  const deps = fakeDeps({ adapters: { youtube: adapter } });
  await saveTokens(deps, USER, "youtube", tokens({ expiresAt: "2026-10-02T09:00:00.000Z" }), profile);
  await expect(accessTokenFor(deps, USER, "youtube")).rejects.toMatchObject({ status: 403, code: "platform_error", message: "Forbidden." });
  expect((await deps.db.getAccount(USER, "youtube"))!.meta.needsReconnect).toBeUndefined();
});

describe("withPlatformAuth", () => {
  async function setup(isAuthError?: (e: PlatformError) => boolean) {
    const deps = fakeDeps({ adapters: { youtube: fakeAdapter(isAuthError ? { isAuthError } : {}) } });
    await saveTokens(deps, USER, "youtube", tokens(), profile);
    return { deps, account: (await deps.db.getAccount(USER, "youtube"))! };
  }
  const forbidden = new PlatformError("youtube", 403, "Request had insufficient authentication scopes.");

  test("an error the adapter calls an auth error flags the account and becomes reconnect", async () => {
    const isAuthError = jest.fn(() => true);
    const { deps, account } = await setup(isAuthError);
    await expect(withPlatformAuth(deps, account, async () => { throw forbidden; })).rejects.toMatchObject({ status: 401, code: "reconnect" });
    expect(isAuthError).toHaveBeenCalledWith(forbidden);
    expect((await deps.db.getAccount(USER, "youtube"))!.meta.needsReconnect).toBe(true);
  });

  test("an error the adapter does not call an auth error is rethrown unchanged", async () => {
    const { deps, account } = await setup(() => false);
    await expect(withPlatformAuth(deps, account, async () => { throw forbidden; })).rejects.toBe(forbidden);
    expect((await deps.db.getAccount(USER, "youtube"))!.meta.needsReconnect).toBeUndefined();
  });

  test("without the hook only a 401 is an auth error", async () => {
    const { deps, account } = await setup();
    await expect(withPlatformAuth(deps, account, async () => { throw forbidden; })).rejects.toBe(forbidden);
    await expect(withPlatformAuth(deps, account, async () => { throw new PlatformError("youtube", 401, "Invalid Credentials"); })).rejects.toMatchObject({ code: "reconnect" });
  });
});

test("a network error becomes 502 platform_unreachable and does not flag the account", async () => {
  const adapter = fakeAdapter({ refresh: jest.fn(async () => { throw new TypeError("fetch failed"); }) });
  const deps = fakeDeps({ adapters: { youtube: adapter } });
  await saveTokens(deps, USER, "youtube", tokens({ expiresAt: "2026-10-02T09:00:00.000Z" }), profile);
  await expect(accessTokenFor(deps, USER, "youtube")).rejects.toMatchObject({ status: 502, code: "platform_unreachable" });
  expect((await deps.db.getAccount(USER, "youtube"))!.meta.needsReconnect).toBeUndefined();
});
