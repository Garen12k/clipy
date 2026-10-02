import { decrypt, importKey } from "../crypto.ts";
import { ApiError, PlatformError } from "../errors.ts";
import { accessTokenFor, saveTokens } from "../tokens.ts";
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

test("expired with no refresh token -> reconnect", async () => {
  const deps = fakeDeps();
  await saveTokens(deps, USER, "youtube", tokens({ refreshToken: null, expiresAt: "2026-10-02T09:00:00.000Z" }), profile);
  await expect(accessTokenFor(deps, USER, "youtube")).rejects.toBeInstanceOf(ApiError);
});
