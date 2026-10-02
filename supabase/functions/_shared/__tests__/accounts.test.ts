import { disconnect, listAccounts } from "../handlers/accounts.ts";
import { saveTokens } from "../tokens.ts";
import { fakeDeps, tokens, USER } from "./fakes.ts";

const profile = { accountId: "UC123", displayName: "My Channel", avatarUrl: "https://img.test/a.jpg" };

test("lists all five platforms in order with availability and connection", async () => {
  const deps = fakeDeps();
  await saveTokens(deps, USER, "youtube", tokens(), profile);
  const { platforms } = await listAccounts(deps, USER);
  expect(platforms.map((p) => p.id)).toEqual(["youtube", "tiktok", "instagram", "facebook", "x"]);
  expect(platforms[0]).toEqual({ id: "youtube", available: true, connected: true, name: "My Channel", avatarUrl: "https://img.test/a.jpg", needsReconnect: false });
  expect(platforms[1]).toEqual({ id: "tiktok", available: false, connected: false, name: null, avatarUrl: null, needsReconnect: false });
});

test("needsReconnect comes from the account meta", async () => {
  const deps = fakeDeps();
  await saveTokens(deps, USER, "youtube", tokens(), profile, { needsReconnect: true });
  expect((await listAccounts(deps, USER)).platforms[0].needsReconnect).toBe(true);
});

test("disconnect revokes with the decrypted tokens and deletes the row even if revoke fails", async () => {
  const deps = fakeDeps();
  (deps.adapters.youtube!.revoke as jest.Mock).mockRejectedValueOnce(new Error("network"));
  await saveTokens(deps, USER, "youtube", tokens(), profile);
  expect(await disconnect(deps, USER, "youtube")).toEqual({ ok: true });
  expect(deps.adapters.youtube!.revoke).toHaveBeenCalledWith(expect.anything(), { accessToken: "access-1", refreshToken: "refresh-1" });
  expect(await deps.db.getAccount(USER, "youtube")).toBeNull();
});

test("disconnect of an unknown platform is a bad request; of a missing account is a no-op", async () => {
  await expect(disconnect(fakeDeps(), USER, "myspace")).rejects.toMatchObject({ code: "bad_request" });
  expect(await disconnect(fakeDeps(), USER, "youtube")).toEqual({ ok: true });
});
