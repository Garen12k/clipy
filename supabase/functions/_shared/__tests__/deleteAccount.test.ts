import { appleCodeOf, deleteAccount, DELETE_FAILED, REVOKE_BUDGET_MS } from "../handlers/deleteAccount.ts";
import { saveTokens } from "../tokens.ts";
import type { Deps, OAuthStateRow, PostSessionRow } from "../types.ts";
import { appleKey, fakeAdapter, fakeDeps, INPUT, tokens, USER } from "./fakes.ts";

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

describe("Sign in with Apple: revoked before the sign-in goes, never blocking it", () => {
  const CODE = "c0de1234.0.abcd.EfGh-ij_k";
  const answer = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status });
  let logs: jest.SpyInstance;
  beforeEach(() => { logs = jest.spyOn(console, "log").mockImplementation(() => {}); });
  afterEach(() => logs.mockRestore());
  /** The world, with the switch on (both secrets). */
  async function appleOn() {
    const { pem } = await appleKey();
    const env = new Map([["YOUTUBE_CLIENT_ID", "cid"], ["YOUTUBE_CLIENT_SECRET", "secret"], ["APPLE_REVOKE_KEY", pem], ["APPLE_KEY_ID", "ABC123DEFG"]]);
    return world({ env: { get: (n: string) => env.get(n) } });
  }
  const fetchOf = (deps: Deps) => deps.fetch as unknown as jest.Mock;

  test("no code: Apple is never asked — the deletion is today's, even with the switch on", async () => {
    const { deps, mine } = await appleOn();
    expect(await deleteAccount(deps, USER)).toEqual({ ok: true });
    expect(fetchOf(deps)).not.toHaveBeenCalled();
    expect(await deps.db.listAccounts(USER)).toEqual([]);
    expect(await deps.db.getSession(mine)).toBeNull();
    expect(deps.deleteAuthUser).toHaveBeenCalledWith(USER);
    expect(errors).not.toHaveBeenCalled();
  });

  test("a code with the switch off: Apple is never asked, and everything else is as without a code", async () => {
    const { deps, mine } = await world();
    expect(await deleteAccount(deps, USER, REVOKE_BUDGET_MS, CODE)).toEqual({ ok: true });
    expect(fetchOf(deps)).not.toHaveBeenCalled();
    expect(await deps.db.listAccounts(USER)).toEqual([]);
    expect(await deps.db.getSession(mine)).toBeNull();
    expect(deps.deleteAuthUser).toHaveBeenCalledTimes(1);
    expect(errors).not.toHaveBeenCalled();
  });

  test("a code with the switch on: exchanged and revoked BEFORE the rows and the sign-in go", async () => {
    const { deps } = await appleOn();
    const log: string[] = [];
    fetchOf(deps).mockImplementation(async (url: string) => {
      log.push(url.endsWith("/auth/token") ? "apple-token" : "apple-revoke");
      return url.endsWith("/auth/token") ? answer(200, { access_token: "apple-access", refresh_token: "apple-refresh" }) : answer(200);
    });
    const wipe = deps.db.deleteUserData.bind(deps.db);
    deps.db.deleteUserData = async (u) => { log.push("rows"); await wipe(u); };
    (deps.deleteAuthUser as jest.Mock).mockImplementation(async () => { log.push("user"); return null; });
    expect(await deleteAccount(deps, USER, REVOKE_BUDGET_MS, CODE)).toEqual({ ok: true });
    expect(log).toEqual(["apple-token", "apple-revoke", "rows", "user"]);
    expect(logs).toHaveBeenCalledWith("apple revoke: done");
  });

  test("Apple refuses: the deletion goes on and is ok", async () => {
    const { deps } = await appleOn();
    fetchOf(deps).mockResolvedValue(answer(400, { error: "invalid_grant" }));
    expect(await deleteAccount(deps, USER, REVOKE_BUDGET_MS, CODE)).toEqual({ ok: true });
    expect(await deps.db.listAccounts(USER)).toEqual([]);
    expect(deps.deleteAuthUser).toHaveBeenCalledWith(USER);
  });

  test("Apple never answers: it shares the platforms' budget, then the deletion goes on", async () => {
    const { deps } = await appleOn();
    fetchOf(deps).mockImplementation(() => new Promise(() => {}));
    expect(await deleteAccount(deps, USER, 20, CODE)).toEqual({ ok: true });
    expect(deps.deleteAuthUser).toHaveBeenCalledWith(USER);
  });

  test("the accounts cannot be listed: Apple is still asked, and the deletion goes on", async () => {
    const { deps } = await appleOn();
    deps.db.listAccounts = async () => { throw new Error("db hiccup"); };
    fetchOf(deps).mockResolvedValueOnce(answer(200, { refresh_token: "apple-refresh" })).mockResolvedValueOnce(answer(200));
    expect(await deleteAccount(deps, USER, REVOKE_BUDGET_MS, CODE)).toEqual({ ok: true });
    expect(fetchOf(deps)).toHaveBeenCalledTimes(2);
    expect(deps.deleteAuthUser).toHaveBeenCalledWith(USER);
  });

  test("the sign-in could not be deleted after a revoke: still delete_failed, and the retry may carry no code", async () => {
    const { deps } = await appleOn();
    fetchOf(deps).mockResolvedValueOnce(answer(200, { refresh_token: "apple-refresh" })).mockResolvedValueOnce(answer(200));
    (deps.deleteAuthUser as jest.Mock).mockResolvedValueOnce({ status: 500 });
    await expect(deleteAccount(deps, USER, REVOKE_BUDGET_MS, CODE)).rejects.toMatchObject({ code: "delete_failed", message: DELETE_FAILED });
    expect(await deleteAccount(deps, USER)).toEqual({ ok: true });
  });

  test("nothing of the code or Apple's tokens reaches the log", async () => {
    const { deps } = await appleOn();
    fetchOf(deps).mockResolvedValueOnce(answer(200, { access_token: "apple-access", refresh_token: "apple-refresh" })).mockResolvedValueOnce(answer(400, { error: "invalid_request" }));
    (deps.deleteAuthUser as jest.Mock).mockResolvedValue({ status: 500, code: "unexpected_failure" });
    await expect(deleteAccount(deps, USER, REVOKE_BUDGET_MS, CODE)).rejects.toMatchObject({ code: "delete_failed" });
    const text = JSON.stringify([...errors.mock.calls, ...logs.mock.calls]);
    for (const s of [CODE, "apple-refresh", "apple-access", "eyJ"]) expect(text).not.toContain(s);
  });

  test("appleCodeOf: the body's appleCode when it is a plain code, else null — nothing else of the body is read", () => {
    expect(appleCodeOf({ appleCode: CODE })).toBe(CODE);
    expect(appleCodeOf({ appleCode: CODE, userId: "someone-else" })).toBe(CODE);
    for (const bad of [null, undefined, "", "c", 7, [], {}, { appleCode: "" }, { appleCode: 7 }, { appleCode: null }, { appleCode: "has space" },
      { appleCode: "line\nbreak" }, { appleCode: "é" }, { appleCode: "x".repeat(2049) }]) expect(appleCodeOf(bad)).toBeNull();
    expect(appleCodeOf({ appleCode: "x".repeat(2048) })).toBe("x".repeat(2048));
  });
});
