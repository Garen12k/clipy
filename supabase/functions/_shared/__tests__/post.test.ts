import { PlatformError } from "../errors.ts";
import { postFinalize } from "../handlers/postFinalize.ts";
import { postPrepare } from "../handlers/postPrepare.ts";
import { postStatus } from "../handlers/postStatus.ts";
import { MAX_RELAY_BYTES, postUpload } from "../handlers/postUpload.ts";
import { saveTokens } from "../tokens.ts";
import { fakeAdapter, fakeDeps, INPUT, tokens, USER } from "./fakes.ts";

const profile = { accountId: "UC123", displayName: "My Channel", avatarUrl: null };
const body = { platform: "youtube", ...INPUT };
async function connected(over = {}) { const deps = fakeDeps(over); await saveTokens(deps, USER, "youtube", tokens(), profile); return deps; }

test("prepare opens a platform session and stores ours", async () => {
  const deps = await connected();
  const r = await postPrepare(deps, USER, body);
  expect(r).toEqual({ sessionId: expect.any(String), protocol: "google-resumable", uploadUrl: "https://upload.test/session", uploadHeaders: {}, chunkSize: 8388608 });
  expect(deps.adapters.youtube!.prepare).toHaveBeenCalledWith(expect.anything(), "access-1", INPUT);
  expect(await deps.db.getSession(r.sessionId)).toMatchObject({ userId: USER, platform: "youtube", status: "uploading", ref: { k: 1 }, input: INPUT });
});

test.each([
  [{ ...body, platform: "myspace" }], [{ ...body, fileSize: 0 }], [{ ...body, fileSize: "big" }], [{ ...body, durationSec: -1 }],
  [{ ...body, mimeType: "" }], [{ ...body, caption: 5 }], [{ ...body, options: null }],
])("prepare rejects bad input %#", async (bad) => {
  await expect(postPrepare(await connected(), USER, bad)).rejects.toMatchObject({ status: 400, code: "bad_request" });
});

test("prepare needs a connected account", async () => {
  await expect(postPrepare(fakeDeps(), USER, body)).rejects.toMatchObject({ code: "not_connected" });
});

test("a platform auth failure during prepare becomes reconnect", async () => {
  const adapter = fakeAdapter({ prepare: jest.fn(async () => { throw new PlatformError("youtube", 401, "Invalid Credentials"); }) });
  const deps = await connected({ adapters: { youtube: adapter } });
  await expect(postPrepare(deps, USER, body)).rejects.toMatchObject({ status: 401, code: "reconnect" });
  expect((await deps.db.getAccount(USER, "youtube"))!.meta.needsReconnect).toBe(true);
});

test("finalize publishes, records the link, and is idempotent", async () => {
  const deps = await connected();
  const { sessionId } = await postPrepare(deps, USER, body);
  expect(await postFinalize(deps, USER, { sessionId, clientResult: '{"id":"abc123XYZ_-"}' })).toEqual({ status: "done", url: "https://youtu.be/abc123XYZ_-" });
  expect(deps.adapters.youtube!.finalize).toHaveBeenCalledWith(expect.anything(), "access-1",
    { ref: { k: 1 }, input: INPUT, clientResult: '{"id":"abc123XYZ_-"}', account: { accountId: "UC123", displayName: "My Channel", avatarUrl: null } });
  expect(await postFinalize(deps, USER, { sessionId, clientResult: null })).toEqual({ status: "done", url: "https://youtu.be/abc123XYZ_-" });
  expect(deps.adapters.youtube!.finalize).toHaveBeenCalledTimes(1);
});

test("finalize that is still processing leaves the session processing; status then polls the adapter", async () => {
  const adapter = fakeAdapter({ finalize: jest.fn(async () => ({ status: "processing" as const })), status: jest.fn(async () => ({ status: "done" as const, url: "https://x.test/1" })) });
  const deps = await connected({ adapters: { youtube: adapter } });
  const { sessionId } = await postPrepare(deps, USER, body);
  expect(await postFinalize(deps, USER, { sessionId, clientResult: null })).toEqual({ status: "processing" });
  expect((await deps.db.getSession(sessionId))!.status).toBe("processing");
  expect(await postStatus(deps, USER, { sessionId })).toEqual({ status: "done", url: "https://x.test/1" });
  expect((await deps.db.getSession(sessionId))!).toMatchObject({ status: "done", url: "https://x.test/1" });
});

test("a platform failure in finalize is stored and rethrown verbatim", async () => {
  const adapter = fakeAdapter({ finalize: jest.fn(async () => { throw new PlatformError("youtube", 400, "The video has been rejected."); }) });
  const deps = await connected({ adapters: { youtube: adapter } });
  const { sessionId } = await postPrepare(deps, USER, body);
  await expect(postFinalize(deps, USER, { sessionId, clientResult: null })).rejects.toMatchObject({ message: "The video has been rejected." });
  expect(await deps.db.getSession(sessionId)).toMatchObject({ status: "failed", error: "The video has been rejected." });
});

test("someone else's session is not found", async () => {
  const deps = await connected();
  const { sessionId } = await postPrepare(deps, USER, body);
  await expect(postFinalize(deps, "other-user", { sessionId, clientResult: null })).rejects.toMatchObject({ status: 404, code: "not_found" });
  await expect(postStatus(deps, "other-user", { sessionId })).rejects.toMatchObject({ code: "not_found" });
  await expect(postUpload(deps, "other-user", { sessionId, offset: 0, total: 10 }, new Uint8Array(1))).rejects.toMatchObject({ code: "not_found" });
});

test("relay upload forwards the chunk, saves the new ref and returns the next offset", async () => {
  const relayChunk = jest.fn(async () => ({ nextOffset: 3, ref: { k: 2 } }));
  const deps = await connected({ adapters: { youtube: fakeAdapter({ relayChunk }) } });
  const { sessionId } = await postPrepare(deps, USER, body);
  const chunk = new Uint8Array([1, 2, 3]);
  expect(await postUpload(deps, USER, { sessionId, offset: "0", total: "20000000" }, chunk)).toEqual({ nextOffset: 3 });
  expect(relayChunk).toHaveBeenCalledWith(expect.anything(), "access-1", { k: 1 }, { offset: 0, total: 20000000, body: chunk });
  expect((await deps.db.getSession(sessionId))!.ref).toEqual({ k: 2 });
});

test("relay upload refuses oversized or empty chunks, bad offsets, and platforms that upload directly", async () => {
  const deps = await connected({ adapters: { youtube: fakeAdapter({ relayChunk: jest.fn() }) } });
  const { sessionId } = await postPrepare(deps, USER, body);
  await expect(postUpload(deps, USER, { sessionId, offset: 0, total: 10 }, new Uint8Array(MAX_RELAY_BYTES + 1))).rejects.toMatchObject({ status: 413, code: "too_large" });
  await expect(postUpload(deps, USER, { sessionId, offset: 0, total: 10 }, new Uint8Array(0))).rejects.toMatchObject({ code: "bad_request" });
  await expect(postUpload(deps, USER, { sessionId, offset: -1, total: 10 }, new Uint8Array(1))).rejects.toMatchObject({ code: "bad_request" });
  const direct = await connected();
  const s = await postPrepare(direct, USER, body);
  await expect(postUpload(direct, USER, { sessionId: s.sessionId, offset: 0, total: 10 }, new Uint8Array(1))).rejects.toMatchObject({ code: "bad_request" });
});
