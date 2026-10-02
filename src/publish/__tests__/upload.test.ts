import { ApiFailure } from "../api";
import { uploadGoogleResumable, UploadError, uploadRelay } from "../upload";

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
