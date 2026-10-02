import { PlatformError, toResponse } from "../errors.ts";
import { postFinalize } from "../handlers/postFinalize.ts";
import { postPrepare } from "../handlers/postPrepare.ts";
import { postStatus } from "../handlers/postStatus.ts";
import { MAX_RELAY_BYTES, postUpload } from "../handlers/postUpload.ts";
import { facebook } from "../platforms/facebook.ts";
import { tiktok } from "../platforms/tiktok.ts";
import { youtube } from "../platforms/youtube.ts";
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

test("prepare passes the adapter's wait hint through, and omits it when there is none", async () => {
  const wait = { maxSeconds: 300, intervalSeconds: 10, resumeOnTimeout: false };
  const deps = await connected({ adapters: { youtube: fakeAdapter({ prepare: jest.fn(async () => ({ protocol: "meta-rupload" as const, uploadUrl: "https://rupload.facebook.com/video-upload/v1", uploadHeaders: { Authorization: "OAuth t", offset: "0", file_size: "1" }, chunkSize: 1, ref: {}, wait })) }) } });
  expect((await postPrepare(deps, USER, body)).wait).toEqual(wait);
  const plain = await postPrepare(await connected(), USER, body);
  expect("wait" in plain).toBe(false);
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

test("a 403 the adapter calls an auth error during prepare becomes reconnect; a quota 403 does not", async () => {
  const scope = new PlatformError("youtube", 403, "Request had insufficient authentication scopes."); scope.reason = "insufficientPermissions";
  const quota = new PlatformError("youtube", 403, "The request cannot be completed because you have exceeded your quota."); quota.reason = "quotaExceeded";
  const isAuthError = youtube.isAuthError;
  const a = await connected({ adapters: { youtube: fakeAdapter({ isAuthError, prepare: jest.fn(async () => { throw scope; }) }) } });
  await expect(postPrepare(a, USER, body)).rejects.toMatchObject({ status: 401, code: "reconnect" });
  expect((await a.db.getAccount(USER, "youtube"))!.meta.needsReconnect).toBe(true);
  const b = await connected({ adapters: { youtube: fakeAdapter({ isAuthError, prepare: jest.fn(async () => { throw quota; }) }) } });
  await expect(postPrepare(b, USER, body)).rejects.toMatchObject({ status: 403, code: "platform_error", message: quota.message });
  expect((await b.db.getAccount(USER, "youtube"))!.meta.needsReconnect).toBeUndefined();
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

test("Facebook: finish accepted, then unreadable statuses never fail the session (no second Reel)", async () => {
  // The real Facebook adapter, in the youtube slot of the fake deps (the handlers only look it up by the session's platform).
  const graphError = () => new Response(JSON.stringify({ error: { code: 100, message: "Unsupported get request." } }), { status: 400 });
  const replies = [new Response(JSON.stringify({ success: true })), graphError(), graphError(), new Response(JSON.stringify({ status: { video_status: "ready" } }))];
  const deps = await connected({ adapters: { youtube: facebook }, fetch: jest.fn(async () => replies.shift()!) as unknown as typeof fetch });
  const sessionId = await deps.db.createSession({ userId: USER, platform: "youtube", ref: { videoId: "vid1", pageId: "p1" }, input: INPUT, status: "uploading", url: null, error: null });
  expect(await postFinalize(deps, USER, { sessionId, clientResult: null })).toEqual({ status: "processing" });
  expect((await deps.db.getSession(sessionId))!.status).toBe("processing");
  await expect(postStatus(deps, USER, { sessionId })).rejects.toMatchObject({ status: 503, code: "platform_unavailable" });
  expect((await deps.db.getSession(sessionId))!.status).toBe("processing");
  expect(await postStatus(deps, USER, { sessionId })).toEqual({ status: "done", url: "https://www.facebook.com/reel/vid1" });
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

test("two simultaneous finalizes publish once (order-independent)", async () => {
  const win = { status: "done" as const, url: "https://w.test/1" };
  const adapter = fakeAdapter({ finalize: jest.fn(async () => win), status: jest.fn(async () => win) });
  const deps = await connected({ adapters: { youtube: adapter } });
  const { sessionId } = await postPrepare(deps, USER, body);
  const results = await Promise.all([fin(deps, sessionId), fin(deps, sessionId)]);
  expect(adapter.finalize).toHaveBeenCalledTimes(1);
  for (const r of results) expect([{ status: "processing" }, win]).toContainEqual(r);
  expect(results).toContainEqual(win); // the winner's answer
  expect(await deps.db.getSession(sessionId)).toMatchObject({ status: "done", url: "https://w.test/1" });
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

test("a token endpoint 5xx during finalize is platform_unreachable, keeps the session, and a retry publishes", async () => {
  const refresh = jest.fn()
    .mockRejectedValueOnce(new PlatformError("youtube", 503, "Backend Error"))
    .mockResolvedValue(tokens({ accessToken: "access-2", refreshToken: null, expiresAt: "2026-10-02T12:00:00.000Z" }));
  const adapter = fakeAdapter({ refresh });
  const deps = await connected({ adapters: { youtube: adapter } });
  const { sessionId } = await postPrepare(deps, USER, body);
  await saveTokens(deps, USER, "youtube", tokens({ expiresAt: "2026-10-02T09:00:00.000Z" }), profile); // expired by finalize time
  await expect(fin(deps, sessionId)).rejects.toMatchObject({ status: 502, code: "platform_unreachable" });
  expect((await deps.db.getSession(sessionId))!.status).toBe("uploading");
  expect(adapter.finalize).not.toHaveBeenCalled();
  expect(await fin(deps, sessionId)).toEqual({ status: "done", url: "https://youtu.be/abc123XYZ_-" });
});

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
  await expect(fin(deps, sessionId)).rejects.toMatchObject({ code: "platform_error", message: "Quota exceeded." });
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
  await expect(fin(deps, sessionId)).rejects.toMatchObject({ status: 503, code: "platform_unavailable" });
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
  await fin(deps, sid);
  await expect(postStatus(deps, USER, { sessionId: sid })).rejects.toMatchObject({ message: "Gone" });
  expect(await deps.db.getSession(sid)).toMatchObject({ status: "done", url: "https://x.test/win" });
});

test("status 503 is rethrown and the session stays processing", async () => {
  const { deps, sessionId } = await prepared({ finalize: jest.fn(async () => ({ status: "processing" as const })), status: jest.fn(async () => { throw new PlatformError("youtube", 503, "Unavailable"); }) });
  await fin(deps, sessionId);
  await expect(postStatus(deps, USER, { sessionId })).rejects.toMatchObject({ status: 503, code: "platform_unavailable" });
  expect((await deps.db.getSession(sessionId))!.status).toBe("processing");
});
test("a DB failure after a successful platform call never reverts to uploading or re-publishes", async () => {
  const { deps, sessionId, adapter } = await prepared();
  const real = deps.db.claimSession.bind(deps.db);
  deps.db.claimSession = async (id, from, to, patch) => { if (from === "publishing" && to === "done") throw new Error("db down"); return real(id, from, to, patch); };
  await expect(fin(deps, sessionId)).rejects.toThrow("db down");
  expect((await deps.db.getSession(sessionId))!.status).toBe("publishing");
  expect(await fin(deps, sessionId)).toEqual({ status: "processing" });
  expect(adapter.finalize).toHaveBeenCalledTimes(1);
});

test("429 in finalize returns to uploading (retryable)", async () => {
  const { deps, sessionId } = await prepared({ finalize: jest.fn(async () => { throw new PlatformError("youtube", 429, "Slow down"); }) });
  await expect(fin(deps, sessionId)).rejects.toMatchObject({ status: 429, code: "platform_unavailable" });
  expect((await deps.db.getSession(sessionId))!.status).toBe("uploading");
});

test("429 in status is rethrown and the session goes back to processing", async () => {
  const { deps, sessionId } = await prepared({ finalize: jest.fn(async () => ({ status: "processing" as const })), status: jest.fn(async () => { throw new PlatformError("youtube", 429, "Slow down"); }) });
  await fin(deps, sessionId);
  await expect(postStatus(deps, USER, { sessionId })).rejects.toMatchObject({ status: 429, code: "platform_unavailable" });
  expect((await deps.db.getSession(sessionId))!.status).toBe("processing");
});

test("YouTube with no upload result in finalize stays final (platform_error): asking again cannot help", async () => {
  const deps = await connected({ adapters: { youtube } });
  await saveTokens(deps, USER, "youtube", tokens({ expiresAt: null }), profile);
  const { sessionId } = await postPrepare({ ...deps, fetch: (async () => new Response(null, { status: 200, headers: { Location: "https://upload.test/s" } })) as unknown as typeof fetch }, USER, body);
  await expect(fin(deps, sessionId)).rejects.toMatchObject({ status: 502, code: "platform_error", message: "YouTube did not confirm the upload." });
});

describe("status is claim-guarded: one platform status call at a time per post", () => {
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const st = (deps: any, sessionId: string) => postStatus(deps, USER, { sessionId });
  /** A session already in `processing`; `seen` records the session's status at each adapter.status call. */
  async function processing(status: (...a: any[]) => Promise<any>) {
    const seen: string[] = [];
    let deps: any, sid = "";
    const p = await prepared({ status: jest.fn(async (...a: any[]) => { seen.push((await deps.db.getSession(sid))!.status); return status(...a); }) });
    deps = p.deps; sid = p.sessionId;
    await deps.db.updateSession(sid, { status: "processing" });
    return { ...p, seen };
  }
  const done = { status: "done" as const, url: "https://x.test/9" };

  test.each([
    ["done", done, { status: "done", url: "https://x.test/9" }],
    ["processing", { status: "processing" as const }, { status: "processing", url: null }],
  ])("two simultaneous status calls ask the platform once (adapter says %s; order-independent)", async (_n, answer, end) => {
    const { deps, sessionId, adapter } = await processing(async () => { await tick(); return answer; });
    const results = await Promise.all([st(deps, sessionId), st(deps, sessionId)]);
    expect(adapter.status).toHaveBeenCalledTimes(1);
    for (const r of results) expect([{ status: "processing" }, answer]).toContainEqual(r);
    expect(results).toContainEqual(answer); // the winner's answer
    expect(await deps.db.getSession(sessionId)).toMatchObject(end);
  });

  test("status while another status is in flight reports processing and touches nothing", async () => {
    const { deps, sessionId, adapter } = await processing(async () => done);
    await deps.db.updateSession(sessionId, { status: "publishing" });
    expect(await st(deps, sessionId)).toEqual({ status: "processing" });
    expect(adapter.status).not.toHaveBeenCalled();
    expect((await deps.db.getSession(sessionId))!.status).toBe("publishing");
  });

  test("done: the platform is asked while the session is claimed, which then ends done with the url", async () => {
    const { deps, sessionId, adapter, seen } = await processing(async () => done);
    expect(await st(deps, sessionId)).toEqual(done);
    expect(seen).toEqual(["publishing"]);
    expect(adapter.status).toHaveBeenCalledWith(expect.anything(), "access-1", { k: 1 });
    expect(await deps.db.getSession(sessionId)).toMatchObject({ status: "done", url: "https://x.test/9" });
  });

  test("processing: the session goes back to processing", async () => {
    const { deps, sessionId, seen } = await processing(async () => ({ status: "processing" as const }));
    expect(await st(deps, sessionId)).toEqual({ status: "processing" });
    expect(seen).toEqual(["publishing"]);
    expect((await deps.db.getSession(sessionId))!.status).toBe("processing");
  });

  test("a platform 400 fails the session with the message and is rethrown", async () => {
    const { deps, sessionId, seen } = await processing(async () => { throw new PlatformError("youtube", 400, "Rejected by the platform."); });
    await expect(st(deps, sessionId)).rejects.toMatchObject({ status: 400, code: "platform_error", message: "Rejected by the platform." });
    expect(seen).toEqual(["publishing"]);
    expect(await deps.db.getSession(sessionId)).toMatchObject({ status: "failed", error: "Rejected by the platform." });
  });

  test("a platform 503 returns the session to processing and is rethrown", async () => {
    const { deps, sessionId, seen } = await processing(async () => { throw new PlatformError("youtube", 503, "Unavailable"); });
    await expect(st(deps, sessionId)).rejects.toMatchObject({ status: 503, code: "platform_unavailable" });
    expect(seen).toEqual(["publishing"]);
    expect((await deps.db.getSession(sessionId))!.status).toBe("processing");
  });

  test("a TypeError returns the session to processing and is rethrown", async () => {
    const { deps, sessionId, seen } = await processing(async () => { throw new TypeError("network"); });
    await expect(st(deps, sessionId)).rejects.toBeInstanceOf(TypeError);
    expect(seen).toEqual(["publishing"]);
    expect((await deps.db.getSession(sessionId))!.status).toBe("processing");
  });

  test("an auth failure flags the account, returns the session to processing and throws reconnect", async () => {
    const { deps, sessionId, seen } = await processing(async () => { throw new PlatformError("youtube", 401, "Invalid Credentials"); });
    await expect(st(deps, sessionId)).rejects.toMatchObject({ status: 401, code: "reconnect" });
    expect(seen).toEqual(["publishing"]);
    expect((await deps.db.getAccount(USER, "youtube"))!.meta.needsReconnect).toBe(true);
    expect((await deps.db.getSession(sessionId))!.status).toBe("processing");
  });

  test("a claim write failing after the platform said done is not reverted to processing", async () => {
    const { deps, sessionId, adapter } = await processing(async () => done);
    const real = deps.db.claimSession.bind(deps.db);
    deps.db.claimSession = async (id: string, from: any, to: any, patch: any) => { if (from === "publishing" && to === "done") throw new Error("db down"); return real(id, from, to, patch); };
    await expect(st(deps, sessionId)).rejects.toThrow("db down");
    expect((await deps.db.getSession(sessionId))!.status).toBe("publishing");
    expect(await st(deps, sessionId)).toEqual({ status: "processing" });
    expect(adapter.status).toHaveBeenCalledTimes(1);
  });

  test("finalize on a processing session takes the same guarded path (raced with status: one platform call)", async () => {
    const { deps, sessionId, adapter, seen } = await processing(async () => { await tick(); return done; });
    const results = await Promise.all([fin(deps, sessionId), st(deps, sessionId)]);
    expect(adapter.status).toHaveBeenCalledTimes(1);
    expect(adapter.finalize).not.toHaveBeenCalled();
    expect(seen).toEqual(["publishing"]);
    for (const r of results) expect([{ status: "processing" }, done]).toContainEqual(r);
    expect(results).toContainEqual(done);
    expect(await deps.db.getSession(sessionId)).toMatchObject({ status: "done", url: "https://x.test/9" });
  });

  test("a token refresh failure while claimed returns the session to processing; racing calls refresh once", async () => {
    const { deps, sessionId, adapter } = await processing(async () => done);
    await saveTokens(deps, USER, "youtube", tokens({ expiresAt: "2026-10-02T09:00:00.000Z" }), profile); // expired: status refreshes first
    (adapter.refresh as jest.Mock).mockImplementationOnce(async () => { await tick(); throw new PlatformError("youtube", 503, "Backend Error"); });
    const results = await Promise.allSettled([st(deps, sessionId), st(deps, sessionId)]);
    expect(adapter.refresh).toHaveBeenCalledTimes(1);
    expect(results.filter((r) => r.status === "rejected")).toEqual([{ status: "rejected", reason: expect.objectContaining({ code: "platform_unreachable" }) }]);
    expect(results.filter((r) => r.status === "fulfilled")).toEqual([{ status: "fulfilled", value: { status: "processing" } }]);
    expect(adapter.status).not.toHaveBeenCalled();
    expect((await deps.db.getSession(sessionId))!.status).toBe("processing");
    expect(await st(deps, sessionId)).toEqual(done);
  });
});

describe("TikTok handlers: a temporary failure after the upload never asks for a new upload", () => {
  const ttProfile = { accountId: "o1", displayName: "Mo", avatarUrl: null };
  const ttBody = { platform: "tiktok", ...INPUT };
  const api = (data: unknown, code = "ok", status = 200) => new Response(JSON.stringify({ data, error: { code, message: "" } }), { status });
  async function tiktokSession(replies: Array<() => Response>) {
    const fetchFake = jest.fn(async () => replies.shift()!()) as unknown as typeof fetch;
    const env = new Map([["TIKTOK_CLIENT_KEY", "ck"], ["TIKTOK_CLIENT_SECRET", "cs"]]);
    const deps = fakeDeps({ adapters: { tiktok }, fetch: fetchFake, env: { get: (n) => env.get(n) } });
    await saveTokens(deps, USER, "tiktok", tokens({ expiresAt: null }), ttProfile);
    const { sessionId } = await postPrepare(deps, USER, ttBody);
    return { deps, sessionId };
  }
  const init = () => api({ publish_id: "p1", upload_url: "https://up.test/x" });

  test.each([
    ["429", () => api({}, "rate_limit_exceeded", 429), 429],
    ["internal_error in a 200", () => api({}, "internal_error"), 500],
    ["bare 502", () => new Response("bad gateway", { status: 502 }), 502],
  ])("finalize: %s → platform_unavailable, session back to uploading; the next finalize reaches the inbox with no link", async (_n, reply, status) => {
    const { deps, sessionId } = await tiktokSession([init, reply, () => api({ status: "SEND_TO_USER_INBOX" })]);
    const err = await fin(deps, sessionId).catch((e: unknown) => e);
    expect(err).toMatchObject({ status, code: "platform_unavailable" });
    expect((await toResponse(err).json()).code).toBe("platform_unavailable");
    expect((await deps.db.getSession(sessionId))!.status).toBe("uploading");
    expect(await fin(deps, sessionId)).toEqual({ status: "done", url: null });
    expect(await deps.db.getSession(sessionId)).toMatchObject({ status: "done", url: null });
  });

  test("status: 503 → platform_unavailable, session stays processing; a FAILED status fails it with platform_error", async () => {
    const { deps, sessionId } = await tiktokSession([init, () => api({ status: "PROCESSING_UPLOAD" }), () => new Response("down", { status: 503 }), () => api({ status: "FAILED", fail_reason: "internal" })]);
    expect(await fin(deps, sessionId)).toEqual({ status: "processing" });
    await expect(postStatus(deps, USER, { sessionId })).rejects.toMatchObject({ status: 503, code: "platform_unavailable" });
    expect((await deps.db.getSession(sessionId))!.status).toBe("processing");
    await expect(postStatus(deps, USER, { sessionId })).rejects.toMatchObject({ status: 400, code: "platform_error", message: "TikTok had a problem processing the video." });
    expect((await deps.db.getSession(sessionId))!.status).toBe("failed");
  });

  test("a token endpoint server_error inside HTTP 200 during finalize is platform_unreachable and does not flag the account", async () => {
    const { deps, sessionId } = await tiktokSession([init, () => new Response(JSON.stringify({ error: "server_error", error_description: "busy" }), { status: 200 })]);
    await saveTokens(deps, USER, "tiktok", tokens({ expiresAt: "2026-10-02T09:00:00.000Z" }), ttProfile); // expired: finalize refreshes first
    await expect(fin(deps, sessionId)).rejects.toMatchObject({ code: "platform_unreachable" });
    expect((await deps.db.getAccount(USER, "tiktok"))!.meta.needsReconnect).toBeUndefined();
    expect((await deps.db.getSession(sessionId))!.status).toBe("uploading");
  });
});
