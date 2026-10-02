import { ApiFailure } from "../api";
import { uploadGoogleResumable, UploadError, uploadMetaWhole, uploadRelay, uploadTikTokChunks, tiktokChunkRanges } from "../upload";

const data = Uint8Array.from({ length: 10 }, (_, i) => i);
const reader = () => ({ size: data.length, read: jest.fn((o: number, n: number) => data.slice(o, o + n)), close: jest.fn() });
const fetchMock = jest.fn();
const r = (status: number, headers: Record<string, string> = {}, text = "") => ({ status, headers: { get: (k: string) => headers[k] ?? null }, text: async () => text });
const args = (over = {}) => ({ reader: reader(), mimeType: "video/mp4", chunkSize: 4, onProgress: jest.fn(), signal: new AbortController().signal, sleep: jest.fn(async () => {}), ...over });
beforeEach(() => { fetchMock.mockReset(); (globalThis as { fetch: unknown }).fetch = fetchMock; });

test("uploads in chunks with Content-Range, follows the server's Range, and returns the final body", async () => {
  fetchMock.mockResolvedValueOnce(r(308, { Range: "bytes=0-3" })).mockResolvedValueOnce(r(308, { Range: "bytes=0-7" })).mockResolvedValueOnce(r(201, {}, '{"id":"abc"}'));
  const a = args();
  expect(await uploadGoogleResumable("https://u/s", { Authorization: "Bearer t" }, a)).toBe('{"id":"abc"}');
  const ranges = fetchMock.mock.calls.map((c) => c[1].headers["Content-Range"]);
  expect(ranges).toEqual(["bytes 0-3/10", "bytes 4-7/10", "bytes 8-9/10"]);
  expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "PUT", headers: { Authorization: "Bearer t", "Content-Type": "video/mp4" } });
  expect(Array.from(fetchMock.mock.calls[2][1].body)).toEqual([8, 9]);
  expect(a.onProgress.mock.calls.map((c) => c[0])).toEqual([0.4, 0.8, 1]);
});

test("a partial acknowledgement re-sends from where the server stopped", async () => {
  fetchMock.mockResolvedValueOnce(r(308, { Range: "bytes=0-1" })).mockResolvedValueOnce(r(308, { Range: "bytes=0-5" })).mockResolvedValueOnce(r(200, {}, "{}"));
  await uploadGoogleResumable("https://u/s", {}, args());
  expect(fetchMock.mock.calls.map((c) => c[1].headers["Content-Range"])).toEqual(["bytes 0-3/10", "bytes 2-5/10", "bytes 6-9/10"]);
});

test("a dropped connection backs off, asks the server how far it got, and carries on", async () => {
  fetchMock.mockRejectedValueOnce(new TypeError("Network request failed"))
    .mockResolvedValueOnce(r(308, { Range: "bytes=0-3" }))            // status query
    .mockResolvedValueOnce(r(308, { Range: "bytes=0-7" })).mockResolvedValueOnce(r(201, {}, "{}"));
  const a = args();
  await uploadGoogleResumable("https://u/s", {}, a);
  expect(fetchMock.mock.calls[1][1].headers["Content-Range"]).toBe("bytes */10");
  expect(fetchMock.mock.calls[1][1].body).toBe("");
  expect(fetchMock.mock.calls[1][1].headers["Content-Length"]).toBe("0");
  expect(a.sleep).toHaveBeenCalledWith(1000);
  expect(fetchMock.mock.calls[2][1].headers["Content-Range"]).toBe("bytes 4-7/10");
});

test("MAX_ATTEMPTS failures are retried, the next one is a resumable error; resume starts with a status query", async () => {
  fetchMock.mockRejectedValue(new TypeError("Network request failed"));
  await expect(uploadGoogleResumable("https://u/s", {}, args())).rejects.toMatchObject({ resumable: true, message: "The connection dropped. Check your internet, then resume." });
  expect(fetchMock).toHaveBeenCalledTimes(4);
  fetchMock.mockReset();
  fetchMock.mockResolvedValueOnce(r(308, { Range: "bytes=0-7" })).mockResolvedValueOnce(r(201, {}, "{}"));
  await uploadGoogleResumable("https://u/s", {}, args({ resume: true }));
  expect(fetchMock.mock.calls.map((c) => c[1].headers["Content-Range"])).toEqual(["bytes */10", "bytes 8-9/10"]);
});

test("an expired session and other 4xx are final; the platform's text is kept", async () => {
  fetchMock.mockResolvedValueOnce(r(404));
  await expect(uploadGoogleResumable("https://u/s", {}, args())).rejects.toMatchObject({ resumable: false, message: "The upload session expired. Post again." });
  fetchMock.mockResolvedValueOnce(r(403, {}, '{"error":{"message":"Forbidden for this channel"}}'));
  await expect(uploadGoogleResumable("https://u/s", {}, args())).rejects.toMatchObject({ resumable: false, message: "Forbidden for this channel" });
});

test("cancel stops before the next chunk and never closes the reader", async () => {
  const ac = new AbortController();
  const rd = reader();
  fetchMock.mockImplementationOnce(async () => { ac.abort(); return r(308, { Range: "bytes=0-3" }); });
  await expect(uploadGoogleResumable("https://u/s", {}, args({ signal: ac.signal, reader: rd }))).rejects.toMatchObject({ message: "Upload cancelled.", resumable: false });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(rd.close).not.toHaveBeenCalled();
});

test("relay sends pieces through the function and follows nextOffset", async () => {
  const send = jest.fn().mockResolvedValueOnce({ nextOffset: 4 }).mockResolvedValueOnce({ nextOffset: 8 }).mockResolvedValueOnce({ nextOffset: 10 });
  const a = args();
  await uploadRelay(send, a);
  expect(send.mock.calls.map((c) => [c[0], c[1], c[2].length])).toEqual([[0, 10, 4], [4, 10, 4], [8, 10, 2]]);
  expect(a.onProgress).toHaveBeenLastCalledWith(1);
});

test("relay retries unreachable/internal, gives up resumably, and passes other failures through", async () => {
  const send = jest.fn().mockRejectedValueOnce(new ApiFailure("unreachable", "x")).mockResolvedValue({ nextOffset: 10 });
  await uploadRelay(send, args({ chunkSize: 10 }));
  expect(send).toHaveBeenCalledTimes(2);
  const dead = jest.fn().mockRejectedValue(new ApiFailure("unreachable", "x"));
  await expect(uploadRelay(dead, args())).rejects.toMatchObject({ resumable: true });
  expect(dead).toHaveBeenCalledTimes(4);
  const denied = jest.fn().mockRejectedValue(new ApiFailure("reconnect", "Reconnect"));
  await expect(uploadRelay(denied, args())).rejects.toMatchObject({ code: "reconnect" });
});

const ctx = { Authorization: "x" };
const E = (m: string, resumable = false) => expect.objectContaining({ message: m, resumable });

test("a chunk that keeps failing pauses resumably even when status queries report the same offset", async () => {
  fetchMock.mockImplementation(async (_u: string, init: { headers: Record<string, string> }) => {
    if (init.headers["Content-Range"].startsWith("bytes */")) return r(308, { Range: "bytes=0-3" });
    throw new TypeError("Network request failed");
  });
  await expect(uploadGoogleResumable("https://u/s", ctx, args())).rejects.toMatchObject({ resumable: true });
  expect(fetchMock).toHaveBeenCalledTimes(9);
});

test("an impossible Range is final and no read ever has a non-positive length", async () => {
  const rd = reader();
  fetchMock.mockResolvedValueOnce(r(308, { Range: "bytes=0-99" }));
  await expect(uploadGoogleResumable("https://u/s", ctx, args({ reader: rd }))).rejects.toEqual(E("YouTube reported an impossible upload position."));
  expect(rd.read.mock.calls.every((c) => c[1] > 0)).toBe(true);
});

test("everything stored but unconfirmed triggers a status query, not a zero-length chunk", async () => {
  const rd = reader();
  fetchMock.mockResolvedValueOnce(r(308, { Range: "bytes=0-9" })).mockResolvedValueOnce(r(200, {}, "{}"));
  await uploadGoogleResumable("https://u/s", ctx, args({ reader: rd }));
  expect(fetchMock.mock.calls.map((c) => c[1].headers["Content-Range"])).toEqual(["bytes 0-3/10", "bytes */10"]);
  expect(rd.read.mock.calls.every((c) => c[1] > 0)).toBe(true);
});

test("a 308 that makes no progress backs off and counts as a failure", async () => {
  fetchMock.mockResolvedValue(r(308, {}));
  const a = args();
  await expect(uploadGoogleResumable("https://u/s", ctx, a)).rejects.toMatchObject({ resumable: true });
  expect(fetchMock).toHaveBeenCalledTimes(4);
  expect(a.sleep.mock.calls.map((c: unknown[]) => c[0])).toEqual([1000, 2000, 4000]);
});

test("the backoff sleep ends early on abort", async () => {
  const ac = new AbortController();
  fetchMock.mockRejectedValue(new TypeError("Network request failed"));
  const sleep = jest.fn(() => { ac.abort(); return new Promise<void>(() => {}); });
  await expect(uploadGoogleResumable("https://u/s", ctx, args({ signal: ac.signal, sleep }))).rejects.toEqual(E("Upload cancelled."));
});

test("a final body that cannot be read is not a confirmed upload", async () => {
  fetchMock.mockResolvedValueOnce({ status: 200, headers: { get: () => null }, text: async () => { throw new Error("x"); } });
  await expect(uploadGoogleResumable("https://u/s", ctx, args())).rejects.toEqual(E("YouTube did not confirm the upload."));
});

test("an empty file is rejected before any request, in both uploaders", async () => {
  const empty = { size: 0, read: jest.fn(), close: jest.fn() };
  await expect(uploadGoogleResumable("https://u/s", ctx, args({ reader: empty }))).rejects.toEqual(E("The video file is empty."));
  const send = jest.fn();
  await expect(uploadRelay(send, args({ reader: empty }))).rejects.toEqual(E("The video file is empty."));
  expect(fetchMock).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
});

test("a disk read error or short read is a file error, not a retried connection drop", async () => {
  const bad = { size: 10, read: jest.fn(() => { throw new Error("EIO"); }), close: jest.fn() };
  await expect(uploadGoogleResumable("https://u/s", ctx, args({ reader: bad }))).rejects.toEqual(E("Couldn't read the video file."));
  expect(fetchMock).not.toHaveBeenCalled();
  const short = { size: 10, read: jest.fn(() => new Uint8Array(1)), close: jest.fn() };
  await expect(uploadGoogleResumable("https://u/s", ctx, args({ reader: short }))).rejects.toEqual(E("Couldn't read the video file."));
  const send = jest.fn();
  await expect(uploadRelay(send, args({ reader: bad }))).rejects.toEqual(E("Couldn't read the video file."));
  await expect(uploadRelay(send, args({ reader: short }))).rejects.toEqual(E("Couldn't read the video file."));
  expect(send).not.toHaveBeenCalled();
  expect(bad.read).toHaveBeenCalledTimes(2);
});

test.each([[0], [11], [undefined], [NaN]])("relay rejects an unexpected nextOffset (%p)", async (n) => {
  const send = jest.fn().mockResolvedValue({ nextOffset: n });
  await expect(uploadRelay(send, args())).rejects.toEqual(E("The server gave an unexpected upload position."));
  expect(send).toHaveBeenCalledTimes(1);
});

test("relay passes the abort signal and stops if aborted during a send", async () => {
  const ac = new AbortController();
  const send = jest.fn(async (_o: number, _t: number, _b: Uint8Array, s: AbortSignal) => { expect(s).toBe(ac.signal); ac.abort(); return { nextOffset: 4 }; });
  const a = args({ signal: ac.signal });
  await expect(uploadRelay(send, a)).rejects.toEqual(E("Upload cancelled."));
  expect(a.onProgress).not.toHaveBeenCalled();
});

test("tiktokChunkRanges matches TikTok's plan: floor(total / chunk) chunks, the last takes the remainder", () => {
  expect(tiktokChunkRanges(10, 4)).toEqual([{ start: 0, end: 4 }, { start: 4, end: 10 }]);
  expect(tiktokChunkRanges(10, 10)).toEqual([{ start: 0, end: 10 }]);
  expect(tiktokChunkRanges(12, 4)).toEqual([{ start: 0, end: 4 }, { start: 4, end: 8 }, { start: 8, end: 12 }]);
  expect(tiktokChunkRanges(3, 10)).toEqual([{ start: 0, end: 3 }]);
});

// Same sizes as the server's chunkPlan tests (supabase/.../tiktok.test.ts): the two must agree on the count.
test.each([
  [Math.floor(19.9 * 1024 * 1024), 1, Math.floor(19.9 * 1024 * 1024)],
  [20 * 1024 * 1024, 2, 10 * 1024 * 1024],
  [1024 ** 3, 102, 14 * 1024 * 1024],
])("tiktokChunkRanges(%i, 10 MiB) has %i chunks; the last is %i bytes", (total, count, lastSize) => {
  const ranges = tiktokChunkRanges(total, 10 * 1024 * 1024);
  expect(ranges).toHaveLength(count);
  expect(ranges[count - 1].end - ranges[count - 1].start).toBe(lastSize);
  expect(ranges[count - 1].end).toBe(total);
});

test("uploads each chunk in order; 206 continues, 201 completes", async () => {
  fetchMock.mockResolvedValueOnce(r(206)).mockResolvedValueOnce(r(201));
  const a = args();
  await uploadTikTokChunks("https://up/x?token=1", a);
  expect(fetchMock.mock.calls.map((c) => [c[0], c[1].method, c[1].headers["Content-Range"], c[1].body.length])).toEqual([
    ["https://up/x?token=1", "PUT", "bytes 0-3/10", 4], ["https://up/x?token=1", "PUT", "bytes 4-9/10", 6]]);
  expect(fetchMock.mock.calls[0][1].headers["Content-Type"]).toBe("video/mp4");
  expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
  expect(a.onProgress.mock.calls.map((c) => c[0])).toEqual([0.4, 1]);
});

test("a dropped chunk is retried in place, then gives up without offering resume", async () => {
  fetchMock.mockRejectedValueOnce(new TypeError("Network request failed")).mockResolvedValueOnce(r(206)).mockResolvedValueOnce(r(201));
  const a = args();
  await uploadTikTokChunks("https://up/x", a);
  expect(fetchMock.mock.calls.map((c) => c[1].headers["Content-Range"])).toEqual(["bytes 0-3/10", "bytes 0-3/10", "bytes 4-9/10"]);
  expect(a.sleep).toHaveBeenCalledWith(1000);
  fetchMock.mockReset(); fetchMock.mockRejectedValue(new TypeError("Network request failed"));
  await expect(uploadTikTokChunks("https://up/x", args())).rejects.toMatchObject({ resumable: false, message: "The connection dropped. Post again to restart the TikTok upload." });
  expect(fetchMock).toHaveBeenCalledTimes(4);
});

test("TikTok's refusals are final and explained", async () => {
  fetchMock.mockResolvedValueOnce(r(403));
  await expect(uploadTikTokChunks("https://up/x", args())).rejects.toMatchObject({ resumable: false, message: "The TikTok upload link expired. Post again." });
  fetchMock.mockResolvedValueOnce(r(416));
  await expect(uploadTikTokChunks("https://up/x", args())).rejects.toMatchObject({ message: "TikTok lost track of the upload. Post again." });
  fetchMock.mockResolvedValueOnce(r(400, {}, "bad range"));
  await expect(uploadTikTokChunks("https://up/x", args())).rejects.toMatchObject({ message: "bad range" });
});

test("a 201 before the last chunk, or a 206 on the last chunk, is not success", async () => {
  fetchMock.mockResolvedValueOnce(r(201));
  await expect(uploadTikTokChunks("https://up/x", args())).rejects.toMatchObject({ message: "TikTok ended the upload early. Post again." });
  fetchMock.mockReset(); fetchMock.mockResolvedValueOnce(r(206)).mockResolvedValueOnce(r(206));
  await expect(uploadTikTokChunks("https://up/x", args())).rejects.toMatchObject({ message: "TikTok did not confirm the upload. Post again." });
});

test("a 200 on the last chunk completes like a 201; a 200 earlier ends the upload early", async () => {
  fetchMock.mockResolvedValueOnce(r(206)).mockResolvedValueOnce(r(200));
  const a = args();
  await uploadTikTokChunks("https://up/x", a);
  expect(a.onProgress.mock.calls.map((c) => c[0])).toEqual([0.4, 1]);
  fetchMock.mockReset(); fetchMock.mockResolvedValueOnce(r(200));
  await expect(uploadTikTokChunks("https://up/x", args())).rejects.toEqual(E("TikTok ended the upload early. Post again."));
});

test.each([[204], [302], [308]])("any other 2xx/3xx (%p) is an unexpected reply, not retried", async (status) => {
  fetchMock.mockResolvedValue(r(status));
  const a = args();
  await expect(uploadTikTokChunks("https://up/x", a)).rejects.toEqual(E("TikTok sent an unexpected reply. Post again."));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(a.sleep).not.toHaveBeenCalled();
});

test("a 416 on the last chunk says TikTok may already have the video; earlier it lost track", async () => {
  fetchMock.mockResolvedValueOnce(r(206)).mockResolvedValueOnce(r(416));
  await expect(uploadTikTokChunks("https://up/x", args())).rejects.toEqual(E("TikTok may already have this video — check your TikTok inbox before posting again."));
  fetchMock.mockReset(); fetchMock.mockResolvedValueOnce(r(416));
  await expect(uploadTikTokChunks("https://up/x", args())).rejects.toEqual(E("TikTok lost track of the upload. Post again."));
});

test.each([[408], [429], [500], [503]])("a %p is retried in place like a dropped connection, then succeeds", async (status) => {
  fetchMock.mockResolvedValueOnce(r(status)).mockResolvedValueOnce(r(206)).mockResolvedValueOnce(r(201));
  const a = args();
  await uploadTikTokChunks("https://up/x", a);
  expect(fetchMock.mock.calls.map((c) => c[1].headers["Content-Range"])).toEqual(["bytes 0-3/10", "bytes 0-3/10", "bytes 4-9/10"]);
  expect(a.sleep.mock.calls.map((c: unknown[]) => c[0])).toEqual([1000]);
});

test.each([[408], [429], [502]])("a %p that keeps coming gives up after MAX_ATTEMPTS retries", async (status) => {
  fetchMock.mockResolvedValue(r(status));
  const a = args();
  await expect(uploadTikTokChunks("https://up/x", a)).rejects.toEqual(E("The connection dropped. Post again to restart the TikTok upload."));
  expect(fetchMock).toHaveBeenCalledTimes(4);
  expect(a.sleep.mock.calls.map((c: unknown[]) => c[0])).toEqual([1000, 2000, 4000]);
});

test("TikTok: aborting during the backoff sleep cancels without another request", async () => {
  const ac = new AbortController();
  fetchMock.mockRejectedValue(new TypeError("Network request failed"));
  const sleep = jest.fn(() => { ac.abort(); return new Promise<void>(() => {}); });
  await expect(uploadTikTokChunks("https://up/x", args({ signal: ac.signal, sleep }))).rejects.toEqual(E("Upload cancelled."));
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("TikTok: a read failure on a later chunk is a file error after the first chunk went up", async () => {
  fetchMock.mockResolvedValueOnce(r(206));
  const rd = { size: 10, read: jest.fn((o: number, n: number) => { if (o > 0) throw new Error("EIO"); return data.slice(o, o + n); }), close: jest.fn() };
  const a = args({ reader: rd });
  await expect(uploadTikTokChunks("https://up/x", a)).rejects.toEqual(E("Couldn't read the video file."));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(a.onProgress.mock.calls.map((c) => c[0])).toEqual([0.4]);
});

test("cancel, empty file and unreadable file behave like the other uploaders", async () => {
  const ac = new AbortController(); ac.abort();
  await expect(uploadTikTokChunks("https://up/x", args({ signal: ac.signal }))).rejects.toMatchObject({ message: "Upload cancelled." });
  await expect(uploadTikTokChunks("https://up/x", args({ reader: { size: 0, read: jest.fn(), close: jest.fn() } }))).rejects.toMatchObject({ message: "The video file is empty." });
  await expect(uploadTikTokChunks("https://up/x", args({ reader: { size: 10, read: () => { throw new Error("io"); }, close: jest.fn() } }))).rejects.toMatchObject({ message: "Couldn't read the video file." });
  expect(fetchMock).not.toHaveBeenCalled();
});

describe("meta-rupload (uploadMetaWhole)", () => {
  const URL_OK = "https://rupload.facebook.com/video-upload/v25.0/123";
  const TOKEN = "EAAGsecretPageToken";
  const H = { Authorization: `OAuth ${TOKEN}`, offset: "0", file_size: "10" };
  const ok = (body = '{"success":true}') => jest.fn(async (_u: string, _f: string, _h: Record<string, string>, onP: (f: number) => void, _s: AbortSignal) => { onP(0.5); return { status: 200, body }; });
  const margs = (over = {}) => ({ onProgress: jest.fn(), signal: new AbortController().signal, ...over });

  test("streams the file with the exact headers, forwards progress and ends at 1", async () => {
    const post = ok(), a = margs();
    await uploadMetaWhole(URL_OK, H, "file:///v.mp4", a, post);
    expect(post).toHaveBeenCalledWith(URL_OK, "file:///v.mp4", H, expect.any(Function), a.signal);
    expect(post.mock.calls[0][2]).toEqual({ Authorization: `OAuth ${TOKEN}`, offset: "0", file_size: "10" });
    expect(a.onProgress.mock.calls.map((c) => c[0])).toEqual([0.5, 1]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test.each([
    ["another host", "https://evil.example.com/video-upload/v25.0/123"],
    ["a look-alike host", "https://rupload.facebook.com.evil.com/x"],
    ["a subdomain", "https://a.rupload.facebook.com/x"],
    ["plain http", "http://rupload.facebook.com/x"],
    ["a port", "https://rupload.facebook.com:8443/x"],
    ["userinfo", "https://user:pw@rupload.facebook.com/x"],
    ["userinfo trick", "https://rupload.facebook.com@evil.com/x"],
    ["upper case (not canonical)", "https://RUPLOAD.facebook.com/x"],
    ["a backslash", "https://rupload.facebook.com\\@evil.com/x"],
    ["a backslash in the path", "https://rupload.facebook.com/x\\y"],
    ["whitespace", "https://rupload.facebook.com/x y"],
    ["a control character", "https://rupload.facebook.com/x\ty"],
    ["non-ASCII", "https://rupload.facebook.com/é"],
    ["no path (not canonical)", "https://rupload.facebook.com"],
    ["not a URL", "rupload.facebook.com/x"],
    ["empty", ""],
  ])("refuses %s without sending anything", async (_name, url) => {
    const post = ok();
    await expect(uploadMetaWhole(url, H, "file:///v.mp4", margs(), post)).rejects.toEqual(new UploadError("Unexpected upload address.", false));
    expect(post).not.toHaveBeenCalled();
  });

  test("HTTP 400 shows Meta's error message", async () => {
    const post = jest.fn(async () => ({ status: 400, body: '{"error":{"message":"Invalid file size"}}' }));
    await expect(uploadMetaWhole(URL_OK, H, "file:///v.mp4", margs(), post)).rejects.toEqual(new UploadError("Invalid file size", false));
  });

  test("a non-JSON error body shows its first 200 characters, an empty one the status", async () => {
    const long = "x".repeat(300);
    await expect(uploadMetaWhole(URL_OK, H, "f", margs(), jest.fn(async () => ({ status: 502, body: long })))).rejects.toMatchObject({ message: long.slice(0, 200), resumable: false });
    await expect(uploadMetaWhole(URL_OK, H, "f", margs(), jest.fn(async () => ({ status: 500, body: "" })))).rejects.toMatchObject({ message: "Upload failed (500).", resumable: false });
  });

  test("a redirect is a failure (the address could not be verified)", async () => {
    await expect(uploadMetaWhole(URL_OK, H, "f", margs(), jest.fn(async () => ({ status: 302, body: "" })))).rejects.toMatchObject({ message: "Upload failed (302).", resumable: false });
  });

  test("HTTP 200 with success:false is a failure with Meta's message", async () => {
    const post = jest.fn(async () => ({ status: 200, body: '{"success":false,"message":"Partial request"}' }));
    const a = margs();
    await expect(uploadMetaWhole(URL_OK, H, "f", a, post)).rejects.toEqual(new UploadError("Partial request", false));
    expect(a.onProgress).not.toHaveBeenCalledWith(1);
    const post2 = jest.fn(async () => ({ status: 200, body: '{"success":false,"debug_info":{"message":"Bad offset"}}' }));
    await expect(uploadMetaWhole(URL_OK, H, "f", margs(), post2)).rejects.toEqual(new UploadError("Bad offset", false));
    const post3 = jest.fn(async () => ({ status: 200, body: '{"success":false}' }));
    await expect(uploadMetaWhole(URL_OK, H, "f", margs(), post3)).rejects.toEqual(new UploadError("Upload failed (200).", false));
  });

  test("a dropped connection asks to post again", async () => {
    const post = jest.fn(async () => { throw new Error(`Network failed for OAuth ${TOKEN}`); });
    await expect(uploadMetaWhole(URL_OK, H, "f", margs(), post)).rejects.toEqual(new UploadError("The connection dropped. Post again to restart the upload.", false));
  });

  test("abort before the start never sends; abort during the upload is a cancel", async () => {
    const ac = new AbortController(); ac.abort();
    const post = ok();
    await expect(uploadMetaWhole(URL_OK, H, "f", margs({ signal: ac.signal }), post)).rejects.toEqual(new UploadError("Upload cancelled.", false));
    expect(post).not.toHaveBeenCalled();
    const ac2 = new AbortController();
    const during = jest.fn(async () => { ac2.abort(); const e = new Error("The operation was aborted."); e.name = "AbortError"; throw e; });
    await expect(uploadMetaWhole(URL_OK, H, "f", margs({ signal: ac2.signal }), during)).rejects.toEqual(new UploadError("Upload cancelled.", false));
  });

  test("no error message ever contains the token", async () => {
    const leaky = `{"error":{"message":"Bad header Authorization: OAuth ${TOKEN}"}}`;
    const cases = [
      jest.fn(async () => ({ status: 400, body: leaky })),
      jest.fn(async () => ({ status: 400, body: `raw OAuth ${TOKEN}` })),
      jest.fn(async () => ({ status: 200, body: `{"success":false,"message":"token ${TOKEN}"}` })),
      jest.fn(async () => { throw new Error(TOKEN); }),
    ];
    for (const post of cases) {
      const err = await uploadMetaWhole(URL_OK, H, "f", margs(), post).then(() => null, (e: Error) => e);
      expect(err).toBeInstanceOf(UploadError);
      expect(err!.message).not.toContain(TOKEN);
    }
    const bad = await uploadMetaWhole("https://evil.example.com/x", H, "f", margs(), ok()).then(() => null, (e: Error) => e);
    expect(bad!.message).not.toContain(TOKEN);
  });

  test("the backslash case really contains a backslash", () => {
    expect("https://rupload.facebook.com\\@evil.com/x").toContain("\\");
  });

  test("only the Authorization value is hidden: other header values (e.g. file_size) stay readable", async () => {
    const big = { Authorization: `OAuth ${TOKEN}`, offset: "0", file_size: "123456789" };
    const body = `{"error":{"message":"file_size 123456789 does not match; got OAuth ${TOKEN}"}}`;
    await expect(uploadMetaWhole(URL_OK, big, "f", margs(), jest.fn(async () => ({ status: 400, body })))).rejects.toEqual(new UploadError("file_size 123456789 does not match; got …", false));
    // The header name is matched without regard to case.
    const lower = { authorization: `OAuth ${TOKEN}`, file_size: "123456789" };
    const err = await uploadMetaWhole(URL_OK, lower, "f", margs(), jest.fn(async () => ({ status: 400, body: `bad ${TOKEN} 123456789` }))).then(() => null, (e: Error) => e);
    expect(err!.message).toBe("bad … 123456789");
  });
});
