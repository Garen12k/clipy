import { ApiFailure, type Prepared } from "../api";
import { IDLE_ROW, POLL_LIMIT, runPost, type PostDeps, type RowState } from "../runPost";
import { UploadError } from "../upload";

const video = { fileUri: "file:///v.mp4", fileSize: 10, durationSec: 21, mimeType: "video/mp4" };
const job = { platform: "youtube" as const, video, caption: "Beach day", options: { title: "Beach", privacy: "public" } };
const prepared: Prepared = { sessionId: "s1", protocol: "google-resumable", uploadUrl: "https://u/s", uploadHeaders: {}, chunkSize: 4 };
const reader = { size: 10, read: jest.fn(), close: jest.fn() };

function deps(over: Partial<PostDeps> = {}): PostDeps {
  return {
    api: { prepare: jest.fn(async () => prepared), uploadChunk: jest.fn(async () => ({ nextOffset: 10 })), finalize: jest.fn(async () => ({ status: "done" as const, url: "https://youtu.be/abc" })), status: jest.fn() },
    openReader: jest.fn(() => reader),
    uploadGoogleResumable: jest.fn(async (_u, _h, a) => { a.onProgress(0.5); a.onProgress(1); return '{"id":"abc"}'; }),
    uploadRelay: jest.fn(async () => {}),
    sleep: jest.fn(async () => {}),
    ...over,
  };
}
function track() { let row: RowState = IDLE_ROW; const phases: string[] = []; return { update: (p: Partial<RowState>) => { row = { ...row, ...p }; if (p.phase) phases.push(p.phase); }, row: () => row, phases }; }
const signal = () => new AbortController().signal;
beforeEach(() => { reader.close.mockClear(); });

test("happy path: prepare → upload → publish → done with the link", async () => {
  const d = deps(), t = track();
  expect(await runPost(job, d, t.update, signal())).toEqual(prepared);
  expect(t.phases).toEqual(["preparing", "uploading", "publishing", "done"]);
  expect(t.row()).toMatchObject({ phase: "done", progress: 1, url: "https://youtu.be/abc", message: null });
  expect(d.api.prepare).toHaveBeenCalledWith({ platform: "youtube", fileSize: 10, durationSec: 21, mimeType: "video/mp4", caption: "Beach day", options: job.options });
  expect(d.api.finalize).toHaveBeenCalledWith("s1", '{"id":"abc"}');
  expect(reader.close).toHaveBeenCalledTimes(1);
});

test("relay protocol sends pieces through api.uploadChunk and finalizes without a client result", async () => {
  const sig = signal();
  const d = deps({ api: { ...deps().api, prepare: jest.fn(async () => ({ ...prepared, protocol: "relay" as const, uploadUrl: null })) } });
  (d.uploadRelay as jest.Mock).mockImplementation(async (send) => { await send(0, 10, new Uint8Array(4), sig); });
  await runPost(job, d, track().update, sig);
  expect(d.api.uploadChunk).toHaveBeenCalledWith("s1", 0, 10, expect.any(Uint8Array), sig);
  expect(d.api.finalize).toHaveBeenCalledWith("s1", null);
});

test("processing is polled until done", async () => {
  const d = deps();
  (d.api.finalize as jest.Mock).mockResolvedValue({ status: "processing" });
  (d.api.status as jest.Mock).mockResolvedValueOnce({ status: "processing" }).mockResolvedValueOnce({ status: "done", url: "https://p/1" });
  const t = track();
  await runPost(job, d, t.update, signal());
  expect(d.sleep).toHaveBeenCalledWith(3000);
  expect(t.row()).toMatchObject({ phase: "done", url: "https://p/1" });
});

test("still processing after two minutes counts as done without a link", async () => {
  const d = deps();
  (d.api.finalize as jest.Mock).mockResolvedValue({ status: "processing" });
  (d.api.status as jest.Mock).mockResolvedValue({ status: "processing" });
  const t = track();
  await runPost(job, d, t.update, signal());
  expect(d.api.status).toHaveBeenCalledTimes(POLL_LIMIT);
  expect(t.row()).toMatchObject({ phase: "done", url: null, message: "Still processing on YouTube — check the app later." });
});

test("reconnect, platform errors and resumable drops each land in the right state", async () => {
  const a = deps(); (a.api.prepare as jest.Mock).mockRejectedValue(new ApiFailure("reconnect", "Reconnect youtube in Accounts."));
  const ta = track(); expect(await runPost(job, a, ta.update, signal())).toBeNull();
  expect(ta.row()).toMatchObject({ phase: "needsReconnect", message: "Reconnect youtube in Accounts." });

  const b = deps(); (b.api.finalize as jest.Mock).mockRejectedValue(new ApiFailure("platform_error", "The video has been rejected."));
  const tb = track(); await runPost(job, b, tb.update, signal());
  expect(tb.row()).toMatchObject({ phase: "failed", message: "The video has been rejected.", resumable: false });

  const c = deps({ uploadGoogleResumable: jest.fn(async () => { throw new UploadError("The connection dropped. Check your internet, then resume.", true); }) });
  const tc = track(); expect(await runPost(job, c, tc.update, signal())).toEqual(prepared);
  expect(tc.row()).toMatchObject({ phase: "failed", resumable: true });
  expect(reader.close).toHaveBeenCalled();
});

test("resume skips prepare and tells the uploader to query first", async () => {
  const d = deps();
  await runPost(job, d, track().update, signal(), prepared);
  expect(d.api.prepare).not.toHaveBeenCalled();
  expect((d.uploadGoogleResumable as jest.Mock).mock.calls[0][2]).toMatchObject({ resume: true, chunkSize: 4, mimeType: "video/mp4" });
});

test("cancel returns the row to idle", async () => {
  const d = deps({ uploadGoogleResumable: jest.fn(async () => { throw new UploadError("Upload cancelled.", false); }) });
  const ac = new AbortController(); ac.abort();
  const t = track(); await runPost(job, d, t.update, ac.signal);
  expect(t.row()).toMatchObject({ phase: "idle", progress: 0 });
});

test.each([
  ["zero chunk size", { ...prepared, chunkSize: 0 }],
  ["fractional chunk size", { ...prepared, chunkSize: 1.5 }],
  ["google protocol without an upload url", { ...prepared, uploadUrl: null }],
])("an unexpected upload plan (%s) fails the row before opening the file", async (_name, plan) => {
  const d = deps({ api: { ...deps().api, prepare: jest.fn(async () => plan as Prepared) } });
  const t = track();
  await runPost(job, d, t.update, signal());
  expect(t.row()).toMatchObject({ phase: "failed", message: "The server sent an unexpected upload plan.", resumable: false });
  expect(d.openReader).not.toHaveBeenCalled();
});
