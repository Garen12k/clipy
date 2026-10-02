import { postWholeFile } from "../wholeFileUpload";

const mockUpload = jest.fn();
const mockFiles: string[] = [];
jest.mock("expo-file-system", () => ({
  UploadType: { BINARY_CONTENT: 0, MULTIPART: 1 },
  File: class { constructor(uri: string) { mockFiles.push(uri); } upload(url: string, options: unknown) { return mockUpload(url, options); } },
}));

beforeEach(() => { mockUpload.mockReset(); mockFiles.length = 0; });
const H = { Authorization: "OAuth tok", offset: "0", file_size: "10" };

test("POSTs the file as the raw body with the headers unchanged and maps progress and the result", async () => {
  mockUpload.mockImplementation(async (_u, o) => { o.onProgress({ bytesSent: 5, totalBytes: 10 }); o.onProgress({ bytesSent: 3, totalBytes: 0 }); return { status: 200, body: '{"success":true}', headers: { a: "b" } }; });
  const onProgress = jest.fn(), ac = new AbortController();
  expect(await postWholeFile("https://rupload.facebook.com/x", "file:///v.mp4", H, onProgress, ac.signal)).toEqual({ status: 200, body: '{"success":true}' });
  expect(mockFiles).toEqual(["file:///v.mp4"]);
  const [url, o] = mockUpload.mock.calls[0];
  expect(url).toBe("https://rupload.facebook.com/x");
  expect(o).toMatchObject({ httpMethod: "POST", uploadType: 0, signal: ac.signal, sessionType: "foreground" });
  expect(o.headers).toEqual(H);
  expect(o.headers).not.toBe(H);
  expect(onProgress.mock.calls.map((c) => c[0])).toEqual([0.5]);
});

test("any HTTP status resolves", async () => {
  mockUpload.mockResolvedValue({ status: 400, body: "nope", headers: {} });
  expect(await postWholeFile("u", "f", H, jest.fn(), new AbortController().signal)).toEqual({ status: 400, body: "nope" });
});

test("abort rejects with an AbortError", async () => {
  const ac = new AbortController();
  mockUpload.mockImplementation((_u, o) => new Promise((_r, reject) => {
    o.signal.addEventListener("abort", () => { const e = new Error("The operation was aborted."); e.name = "AbortError"; reject(e); });
  }));
  const p = postWholeFile("u", "f", H, jest.fn(), ac.signal);
  ac.abort();
  await expect(p).rejects.toMatchObject({ name: "AbortError" });
});

test("an already-aborted signal rejects with an AbortError without starting", async () => {
  const ac = new AbortController(); ac.abort();
  await expect(postWholeFile("u", "f", H, jest.fn(), ac.signal)).rejects.toMatchObject({ name: "AbortError" });
  expect(mockUpload).not.toHaveBeenCalled();
});

test("a native failure while aborted is reported as an AbortError", async () => {
  const ac = new AbortController();
  mockUpload.mockImplementation(async () => { ac.abort(); throw new Error("cancelled"); });
  await expect(postWholeFile("u", "f", H, jest.fn(), ac.signal)).rejects.toMatchObject({ name: "AbortError" });
});
