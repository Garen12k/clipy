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
  [{ ...body, options: [] }], [{ ...body, fileSize: 1.5 }], [{ ...body, fileSize: 10 * 1024 ** 3 + 1 }], [{ ...body, durationSec: 6 * 3600 + 1 }],
  [{ ...body, mimeType: "image/png" }], [{ ...body, mimeType: "video/" }], [{ ...body, caption: "x".repeat(10_001) }],
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
  await expect(postUpload(deps, "other-user", { sessionId, offset: 0, total: INPUT.fileSize }, new Uint8Array(1))).rejects.toMatchObject({ code: "not_found" });
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

test("finalize twice while processing publishes once; the second call polls status", async () => {
  const adapter = fakeAdapter({ finalize: jest.fn(async () => ({ status: "processing" as const })), status: jest.fn(async () => ({ status: "processing" as const })) });
  const deps = await connected({ adapters: { youtube: adapter } });
  const { sessionId } = await postPrepare(deps, USER, body);
  await postFinalize(deps, USER, { sessionId, clientResult: null });
  expect(await postFinalize(deps, USER, { sessionId, clientResult: null })).toEqual({ status: "processing" });
  expect(adapter.finalize).toHaveBeenCalledTimes(1);
  expect(adapter.status).toHaveBeenCalledTimes(1);
});

test("two simultaneous finalizes publish once", async () => {
  const adapter = fakeAdapter({ finalize: jest.fn(async () => ({ status: "processing" as const })) });
  const deps = await connected({ adapters: { youtube: adapter } });
  const { sessionId } = await postPrepare(deps, USER, body);
  const [a, b] = await Promise.all([postFinalize(deps, USER, { sessionId, clientResult: null }), postFinalize(deps, USER, { sessionId, clientResult: null })]);
  expect(a).toEqual({ status: "processing" });
  expect(["processing", "done"]).toContain(b.status); // the loser sees publishing (processing) or polls status
  expect(adapter.finalize).toHaveBeenCalledTimes(1);
  expect(["processing", "done"]).toContain((await deps.db.getSession(sessionId))!.status);
});

test("reconnect during finalize leaves the session uploading", async () => {
  const adapter = fakeAdapter({ finalize: jest.fn(async () => { throw new PlatformError("youtube", 401, "Invalid Credentials"); }) });
  const deps = await connected({ adapters: { youtube: adapter } });
  const { sessionId } = await postPrepare(deps, USER, body);
  await expect(postFinalize(deps, USER, { sessionId, clientResult: null })).rejects.toMatchObject({ code: "reconnect" });
  expect((await deps.db.getSession(sessionId))!.status).toBe("uploading");
});

test("finalize on a failed session throws the stored message without calling the adapter", async () => {
  const deps = await connected();
  const { sessionId } = await postPrepare(deps, USER, body);
  await deps.db.updateSession(sessionId, { status: "failed", error: "Rejected." });
  await expect(postFinalize(deps, USER, { sessionId, clientResult: null })).rejects.toMatchObject({ status: 400, message: "Rejected." });
  expect(deps.adapters.youtube!.finalize).not.toHaveBeenCalled();
});

test.each([[""], [null], ["0x10"], ["-1"], [1.5]])("relay upload rejects offset %j", async (offset) => {
  const deps = await connected({ adapters: { youtube: fakeAdapter({ relayChunk: jest.fn() }) } });
  const { sessionId } = await postPrepare(deps, USER, body);
  await expect(postUpload(deps, USER, { sessionId, offset, total: INPUT.fileSize }, new Uint8Array(1))).rejects.toMatchObject({ code: "bad_request" });
});

test("relay upload rejects a mismatched total, overrun, and a finished session", async () => {
  const relayChunk = jest.fn();
  const deps = await connected({ adapters: { youtube: fakeAdapter({ relayChunk }) } });
  const { sessionId } = await postPrepare(deps, USER, body);
  await expect(postUpload(deps, USER, { sessionId, offset: 0, total: INPUT.fileSize + 1 }, new Uint8Array(1))).rejects.toMatchObject({ code: "bad_request" });
  await expect(postUpload(deps, USER, { sessionId, offset: INPUT.fileSize, total: INPUT.fileSize }, new Uint8Array(1))).rejects.toMatchObject({ code: "bad_request" });
  await postFinalize(deps, USER, { sessionId, clientResult: null });
  await expect(postUpload(deps, USER, { sessionId, offset: 0, total: INPUT.fileSize }, new Uint8Array(1))).rejects.toMatchObject({ code: "bad_request", message: "This upload is already finished." });
  expect(relayChunk).not.toHaveBeenCalled();
});
const fin = (deps: any, sessionId: string) => postFinalize(deps, USER, { sessionId, clientResult: null });
async function prepared(over: any = {}) { const deps = await connected({ adapters: { youtube: fakeAdapter(over) } }); const { sessionId } = await postPrepare(deps, USER, body); return { deps, sessionId, adapter: deps.adapters.youtube! }; }

test("finalize done ends done with the url", async () => {
  const { deps, sessionId } = await prepared();
  await fin(deps, sessionId);
  expect(await deps.db.getSession(sessionId)).toMatchObject({ status: "done", url: "https://youtu.be/abc123XYZ_-" });
});

test("finalize processing ends processing", async () => {
  const { deps, sessionId } = await prepared({ finalize: jest.fn(async () => ({ status: "processing" as const })) });
  await fin(deps, sessionId);
  expect((await deps.db.getSession(sessionId))!.status).toBe("processing");
});

test("platform 4xx in finalize ends failed with the message", async () => {
  const { deps, sessionId } = await prepared({ finalize: jest.fn(async () => { throw new PlatformError("youtube", 403, "Quota exceeded."); }) });
  await expect(fin(deps, sessionId)).rejects.toMatchObject({ message: "Quota exceeded." });
  expect(await deps.db.getSession(sessionId)).toMatchObject({ status: "failed", error: "Quota exceeded." });
});

test("a TypeError in finalize returns to uploading and a retry publishes", async () => {
  const finalize = jest.fn().mockRejectedValueOnce(new TypeError("network")).mockResolvedValue({ status: "done", url: "https://x.test/2" });
  const { deps, sessionId } = await prepared({ finalize });
  await expect(fin(deps, sessionId)).rejects.toBeInstanceOf(TypeError);
  expect((await deps.db.getSession(sessionId))!.status).toBe("uploading");
  expect(await fin(deps, sessionId)).toEqual({ status: "done", url: "https://x.test/2" });
  expect(finalize).toHaveBeenCalledTimes(2);
});

test("platform 503 in finalize returns to uploading", async () => {
  const { deps, sessionId } = await prepared({ finalize: jest.fn(async () => { throw new PlatformError("youtube", 503, "Unavailable"); }) });
  await expect(fin(deps, sessionId)).rejects.toMatchObject({ status: 503 });
  expect((await deps.db.getSession(sessionId))!.status).toBe("uploading");
});

test("finalize while another is publishing returns processing without touching anything", async () => {
  const { deps, sessionId, adapter } = await prepared();
  await deps.db.updateSession(sessionId, { status: "publishing" });
  expect(await fin(deps, sessionId)).toEqual({ status: "processing" });
  expect(adapter.finalize).not.toHaveBeenCalled();
  expect((await deps.db.getSession(sessionId))!.status).toBe("publishing");
});

test("two simultaneous finalizes publish once and end consistent with the adapter", async () => {
  const { deps, sessionId, adapter } = await prepared();
  const [a, b] = await Promise.all([fin(deps, sessionId), fin(deps, sessionId)]);
  expect(adapter.finalize).toHaveBeenCalledTimes(1);
  for (const r of [a, b]) expect(["done", "processing"]).toContain(r.status);
  expect(await deps.db.getSession(sessionId)).toMatchObject({ status: "done", url: "https://youtu.be/abc123XYZ_-" });
});

test("status on uploading is refused; on publishing it reports processing; neither calls the adapter", async () => {
  const { deps, sessionId, adapter } = await prepared();
  await expect(postStatus(deps, USER, { sessionId })).rejects.toMatchObject({ status: 400, code: "bad_request" });
  expect((await deps.db.getSession(sessionId))!.status).toBe("uploading");
  await deps.db.updateSession(sessionId, { status: "publishing" });
  expect(await postStatus(deps, USER, { sessionId })).toEqual({ status: "processing" });
  expect(adapter.status).not.toHaveBeenCalled();
});

test("status on a done session never calls the adapter", async () => {
  const { deps, sessionId, adapter } = await prepared();
  await fin(deps, sessionId);
  expect(await postStatus(deps, USER, { sessionId })).toEqual({ status: "done", url: "https://youtu.be/abc123XYZ_-" });
  expect(adapter.status).not.toHaveBeenCalled();
});

test("a status 4xx that loses to a concurrent done does not overwrite it", async () => {
  let deps: any, sid = "";
  const status = jest.fn(async () => { await deps.db.updateSession(sid, { status: "done", url: "https://x.test/win" }); throw new PlatformError("youtube", 404, "Gone"); });
  const p = await prepared({ finalize: jest.fn(async () => ({ status: "processing" as const })), status });
  deps = p.deps; sid = p.sessionId;
  await fin(sid && deps, sid);
  await expect(postStatus(deps, USER, { sessionId: sid })).rejects.toMatchObject({ message: "Gone" });
  expect(await deps.db.getSession(sid)).toMatchObject({ status: "done", url: "https://x.test/win" });
});

test("status 503 is rethrown and the session stays processing", async () => {
  const { deps, sessionId } = await prepared({ finalize: jest.fn(async () => ({ status: "processing" as const })), status: jest.fn(async () => { throw new PlatformError("youtube", 503, "Unavailable"); }) });
  await fin(deps, sessionId);
  await expect(postStatus(deps, USER, { sessionId })).rejects.toMatchObject({ status: 503 });
  expect((await deps.db.getSession(sessionId))!.status).toBe("processing");
});