import { deleteAccount, DELETE_FAILED } from "../handlers/deleteAccount.ts";
import { saveTokens } from "../tokens.ts";
import type { Deps, OAuthStateRow, PostSessionRow } from "../types.ts";
import { fakeAdapter, fakeDeps, INPUT, tokens, USER } from "./fakes.ts";

const OTHER = "22222222-2222-2222-2222-222222222222";
const profile = { accountId: "UC123", displayName: "My Channel", avatarUrl: null };
const state = (s: string, userId: string): OAuthStateRow => ({ state: s, userId, platform: "youtube", codeVerifier: "v", returnUrl: "clipy://oauth", expiresAt: "2026-10-02T10:10:00.000Z" });
const session = (userId: string): Omit<PostSessionRow, "id"> => ({ userId, platform: "youtube", ref: {}, input: INPUT, status: "uploading", url: null, error: null });

/** Two users, each with two connected accounts, a pending connect and a post session. */
async function world(over: Partial<Deps> = {}) {
  const deps = fakeDeps({ adapters: { youtube: fakeAdapter(), x: fakeAdapter({ id: "x", secrets: [] }) }, ...over });
  for (const u of [USER, OTHER]) {
    await saveTokens(deps, u, "youtube", tokens({ accessToken: `yt-${u}` }), profile);
    await saveTokens(deps, u, "x", tokens({ accessToken: `x-${u}` }), profile);
    await deps.db.putState(state(`state-${u}`, u));
  }
  const mine = await deps.db.createSession(session(USER));
  const theirs = await deps.db.createSession(session(OTHER));
  return { deps, mine, theirs };
}

let errors: jest.SpyInstance;
beforeEach(() => { errors = jest.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => errors.mockRestore());

test("removes every row of the caller — accounts, pending connects, post sessions — and then the sign-in itself", async () => {
  const { deps, mine } = await world();
  expect(await deleteAccount(deps, USER)).toEqual({ ok: true });
  expect(await deps.db.listAccounts(USER)).toEqual([]);
  expect(await deps.db.takeState(`state-${USER}`)).toBeNull();
  expect(await deps.db.getSession(mine)).toBeNull();
  expect(deps.deleteAuthUser).toHaveBeenCalledTimes(1);
  expect(deps.deleteAuthUser).toHaveBeenCalledWith(USER);
});

test("only the caller: another user's rows and sign-in are untouched", async () => {
  const { deps, theirs } = await world();
  await deleteAccount(deps, USER);
  expect((await deps.db.listAccounts(OTHER)).map((a) => a.platform).sort()).toEqual(["x", "youtube"]);
  expect(await deps.db.getSession(theirs)).not.toBeNull();
  expect(await deps.db.takeState(`state-${OTHER}`)).not.toBeNull();
  expect(deps.deleteAuthUser).not.toHaveBeenCalledWith(OTHER);
  for (const id of ["youtube", "x"] as const) {
    const revoke = deps.adapters[id]!.revoke as jest.Mock;
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith(expect.anything(), { accessToken: `${id === "youtube" ? "yt" : "x"}-${USER}`, refreshToken: "refresh-1" });
  }
});

test("the order: each platform is asked to forget the connection, then the rows go, then the sign-in — last", async () => {
  const log: string[] = [];
  const { deps } = await world();
  for (const id of ["youtube", "x"] as const) (deps.adapters[id]!.revoke as jest.Mock).mockImplementation(async () => { log.push("revoke"); });
  const wipe = deps.db.deleteUserData.bind(deps.db);
  deps.db.deleteUserData = async (u) => { log.push("rows"); await wipe(u); };
  (deps.deleteAuthUser as jest.Mock).mockImplementation(async () => { log.push("user"); return null; });
  await deleteAccount(deps, USER);
  expect(log).toEqual(["revoke", "revoke", "rows", "user"]);
});

test("the sign-in could not be deleted: the caller is told it failed, never ok", async () => {
  const { deps } = await world();
  (deps.deleteAuthUser as jest.Mock).mockResolvedValue({ status: 500, code: "unexpected_failure" });
  await expect(deleteAccount(deps, USER)).rejects.toMatchObject({ status: 500, code: "delete_failed", message: DELETE_FAILED });
  (deps.deleteAuthUser as jest.Mock).mockRejectedValue(new Error("network"));
  await expect(deleteAccount(deps, USER)).rejects.toMatchObject({ status: 500, code: "delete_failed", message: DELETE_FAILED });
  expect(DELETE_FAILED).toBe("Couldn't delete the account. Try again.");
});

test("a retry after such a failure finishes the job", async () => {
  const { deps } = await world();
  (deps.deleteAuthUser as jest.Mock).mockResolvedValueOnce({ status: 500 });
  await expect(deleteAccount(deps, USER)).rejects.toMatchObject({ code: "delete_failed" });
  expect(await deleteAccount(deps, USER)).toEqual({ ok: true });
  expect(deps.deleteAuthUser).toHaveBeenCalledTimes(2);
});

test("the rows could not be deleted: it failed, and the sign-in is not touched", async () => {
  const { deps } = await world();
  deps.db.deleteUserData = async () => { throw new Error("db down"); };
  await expect(deleteAccount(deps, USER)).rejects.toMatchObject({ status: 500, code: "delete_failed", message: DELETE_FAILED });
  expect(deps.deleteAuthUser).not.toHaveBeenCalled();
});

test("a sign-in that is already gone (a second call with a token still valid) is a success", async () => {
  const { deps } = await world();
  (deps.deleteAuthUser as jest.Mock).mockResolvedValue({ status: 404, code: "user_not_found" });
  expect(await deleteAccount(deps, USER)).toEqual({ ok: true });
});

test("a platform that refuses to forget does not block the deletion", async () => {
  const { deps } = await world();
  (deps.adapters.youtube!.revoke as jest.Mock).mockRejectedValue(new Error("network"));
  (deps.adapters.x!.revoke as jest.Mock).mockRejectedValue(new Error("401"));
  expect(await deleteAccount(deps, USER)).toEqual({ ok: true });
  expect(await deps.db.listAccounts(USER)).toEqual([]);
  expect(deps.deleteAuthUser).toHaveBeenCalledWith(USER);
});

test("a platform that never answers is given a short time, then the deletion goes on", async () => {
  const { deps } = await world();
  (deps.adapters.x!.revoke as jest.Mock).mockImplementation(() => new Promise(() => {}));
  expect(await deleteAccount(deps, USER, 20)).toEqual({ ok: true });
  expect(await deps.db.listAccounts(USER)).toEqual([]);
  expect(deps.deleteAuthUser).toHaveBeenCalledWith(USER);
});

test("the accounts could not even be listed: nothing is revoked, the deletion goes on", async () => {
  const { deps } = await world();
  deps.db.listAccounts = async () => { throw new Error("db hiccup"); };
  expect(await deleteAccount(deps, USER)).toEqual({ ok: true });
  expect(deps.deleteAuthUser).toHaveBeenCalledWith(USER);
});

test("nobody signed in: 401, and nothing is deleted", async () => {
  const { deps } = await world();
  const wipe = jest.fn();
  deps.db.deleteUserData = wipe;
  for (const nobody of ["", null, undefined]) await expect(deleteAccount(deps, nobody as unknown as string)).rejects.toMatchObject({ status: 401, code: "unauthorized" });
  expect(wipe).not.toHaveBeenCalled();
  expect(deps.deleteAuthUser).not.toHaveBeenCalled();
});

test("nothing of a token reaches the log", async () => {
  const { deps } = await world();
  (deps.adapters.x!.revoke as jest.Mock).mockRejectedValue(new Error("refused"));
  (deps.deleteAuthUser as jest.Mock).mockResolvedValue({ status: 500, code: "unexpected_failure" });
  await expect(deleteAccount(deps, USER)).rejects.toMatchObject({ code: "delete_failed" });
  const said = JSON.stringify(errors.mock.calls.map((c) => c.map((v: unknown) => (v instanceof Error ? v.message : v))));
  expect(said).not.toMatch(/yt-|x-1111|refresh-1|access-/);
});

test("memoryDb.deleteUserData removes that user's rows of all three tables and nobody else's", async () => {
  const { deps, mine, theirs } = await world();
  await deps.db.deleteUserData(USER);
  expect(await deps.db.listAccounts(USER)).toEqual([]);
  expect(await deps.db.getSession(mine)).toBeNull();
  expect(await deps.db.takeState(`state-${USER}`)).toBeNull();
  expect(await deps.db.listAccounts(OTHER)).toHaveLength(2);
  expect(await deps.db.getSession(theirs)).not.toBeNull();
});
