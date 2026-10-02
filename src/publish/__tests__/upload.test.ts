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
  expect(fetchMock.mock.calls[1][1].body).toBeUndefined();
  expect(a.sleep).toHaveBeenCalledWith(1000);
  expect(fetchMock.mock.calls[2][1].headers["Content-Range"]).toBe("bytes 4-7/10");
});

test("three failures in a row give a resumable error; resume starts with a status query", async () => {
  fetchMock.mockRejectedValue(new TypeError("Network request failed"));
  await expect(uploadGoogleResumable("https://u/s", {}, args())).rejects.toMatchObject({ resumable: true, message: "The connection dropped. Check your internet, then resume." });
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

test("cancel stops before the next chunk and closes nothing twice", async () => {
  const ac = new AbortController();
  fetchMock.mockImplementationOnce(async () => { ac.abort(); return r(308, { Range: "bytes=0-3" }); });
  await expect(uploadGoogleResumable("https://u/s", {}, args({ signal: ac.signal }))).rejects.toMatchObject({ message: "Upload cancelled.", resumable: false });
  expect(fetchMock).toHaveBeenCalledTimes(1);
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
  await expect(uploadRelay(dead, args())).rejects.toBeInstanceOf(UploadError);
  const denied = jest.fn().mockRejectedValue(new ApiFailure("reconnect", "Reconnect"));
  await expect(uploadRelay(denied, args())).rejects.toMatchObject({ code: "reconnect" });
});
