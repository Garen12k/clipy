import { memoryDb } from "../memoryDb.ts";
import { INPUT, USER } from "./fakes.ts";

test("accounts: upsert replaces, list is per user, delete removes", async () => {
  const db = memoryDb();
  const row = { userId: USER, platform: "youtube" as const, accountId: "UC1", displayName: "A", avatarUrl: null, accessTokenEnc: "x", refreshTokenEnc: null, expiresAt: null, scopes: "", meta: {} };
  await db.upsertAccount(row);
  await db.upsertAccount({ ...row, displayName: "B" });
  expect((await db.getAccount(USER, "youtube"))?.displayName).toBe("B");
  expect(await db.listAccounts("someone-else")).toEqual([]);
  await db.deleteAccount(USER, "youtube");
  expect(await db.getAccount(USER, "youtube")).toBeNull();
});

test("states are single use", async () => {
  const db = memoryDb();
  await db.putState({ state: "s1", userId: USER, platform: "youtube", codeVerifier: "v", returnUrl: "exp://x", expiresAt: "2026-10-02T10:10:00.000Z" });
  expect((await db.takeState("s1"))?.codeVerifier).toBe("v");
  expect(await db.takeState("s1")).toBeNull();
});

test("sessions: create, read, patch", async () => {
  const db = memoryDb();
  const id = await db.createSession({ userId: USER, platform: "youtube", ref: {}, input: INPUT, status: "uploading", url: null, error: null });
  await db.updateSession(id, { status: "done", url: "https://youtu.be/x" });
  expect(await db.getSession(id)).toMatchObject({ id, status: "done", url: "https://youtu.be/x" });
  expect(await db.getSession("nope")).toBeNull();
});

test("claimSession moves status once", async () => {
  const db = memoryDb();
  const id = await db.createSession({ userId: USER, platform: "youtube", ref: {}, input: INPUT, status: "uploading", url: null, error: null });
  expect(await db.claimSession(id, "uploading", "processing")).toBe(true);
  expect((await db.getSession(id))!.status).toBe("processing");
  expect(await db.claimSession(id, "uploading", "processing")).toBe(false);
});

test("claimSession cannot move a done session", async () => {
  const db = memoryDb();
  const id = await db.createSession({ userId: USER, platform: "youtube", ref: {}, input: INPUT, status: "done", url: "u", error: null });
  expect(await db.claimSession(id, "processing", "failed")).toBe(false);
  expect((await db.getSession(id))!.status).toBe("done");
});

test("claimSession with a patch sets status and fields together; a lost claim sets neither", async () => {
  const db = memoryDb();
  const id = await db.createSession({ userId: USER, platform: "youtube", ref: {}, input: INPUT, status: "publishing", url: null, error: null });
  expect(await db.claimSession(id, "uploading", "done", { url: "u" })).toBe(false);
  expect(await db.getSession(id)).toMatchObject({ status: "publishing", url: null });
  expect(await db.claimSession(id, "publishing", "done", { url: "u" })).toBe(true);
  expect(await db.getSession(id)).toMatchObject({ status: "done", url: "u" });
});
