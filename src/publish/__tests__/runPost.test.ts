import { ApiFailure, type Prepared } from "../api";
import { IDLE_ROW, POLL_LIMIT, runPost, type PostDeps, type ResumeInfo, type RowState } from "../runPost";
import { UploadError } from "../upload";

const video = { fileUri: "file:///v.mp4", fileSize: 10, durationSec: 21, mimeType: "video/mp4" };
const job = { platform: "youtube" as const, video, caption: "Beach day", options: { title: "Beach", privacy: "public" } };
const prepared: Prepared = { sessionId: "s1", protocol: "google-resumable", uploadUrl: "https://u/s", uploadHeaders: {}, chunkSize: 4 };
const fresh: ResumeInfo = { prepared, uploaded: false, clientResult: null };
const reader = { size: 10, read: jest.fn(), close: jest.fn() };

function deps(over: Partial<PostDeps> = {}): PostDeps {
  return {
    api: { prepare: jest.fn(async () => prepared), uploadChunk: jest.fn(async () => ({ nextOffset: 10 })), finalize: jest.fn(async () => ({ status: "done" as const, url: "https://youtu.be/abc" })), status: jest.fn() },
    openReader: jest.fn(() => reader),
    uploadGoogleResumable: jest.fn(async (_u, _h, a) => { a.onProgress(0.5); a.onProgress(1); return '{"id":"abc"}'; }),
    uploadRelay: jest.fn(async () => {}),
    sleep: jest.fn(async (_ms: number, _s: AbortSignal) => {}),
    ...over,
  };
}
function track() { let row: RowState = IDLE_ROW; const phases: string[] = []; return { update: (p: Partial<RowState>) => { row = { ...row, ...p }; if (p.phase) phases.push(p.phase); }, row: () => row, phases }; }
const signal = () => new AbortController().signal;
beforeEach(() => { reader.close.mockClear(); });

test("happy path: prepare → upload → publish → done with the link", async () => {
  const d = deps(), t = track();
  expect(await runPost(job, d, t.update, signal())).toEqual({ prepared, uploaded: true, clientResult: '{"id":"abc"}' });
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
  expect(d.sleep).toHaveBeenCalledWith(3000, expect.any(AbortSignal));
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

  const b = deps(); (b.api.prepare as jest.Mock).mockRejectedValue(new ApiFailure("platform_error", "The video has been rejected."));
  const tb = track(); expect(await runPost(job, b, tb.update, signal())).toBeNull();
  expect(tb.row()).toMatchObject({ phase: "failed", message: "The video has been rejected.", resumable: false });

  const c = deps({ uploadGoogleResumable: jest.fn(async () => { throw new UploadError("The connection dropped. Check your internet, then resume.", true); }) });
  const tc = track(); expect(await runPost(job, c, tc.update, signal())).toEqual(fresh);
  expect(tc.row()).toMatchObject({ phase: "failed", resumable: true });
  expect(reader.close).toHaveBeenCalled();
});

test("resume skips prepare and tells the uploader to query first", async () => {
  const d = deps();
  await runPost(job, d, track().update, signal(), fresh);
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

test("cancel during polling stops at once and ends as still processing", async () => {
  const ac = new AbortController();
  const d = deps({ sleep: jest.fn(async () => { ac.abort(); }) });
  (d.api.finalize as jest.Mock).mockResolvedValue({ status: "processing" });
  const t = track();
  await runPost(job, d, t.update, ac.signal);
  expect(d.api.status).not.toHaveBeenCalled();
  expect(t.row()).toMatchObject({ phase: "done", url: null, message: "Still processing on YouTube — check the app later." });
});

test("cancel during the upload returns to idle", async () => {
  const ac = new AbortController();
  const d = deps({ uploadGoogleResumable: jest.fn(async () => { ac.abort(); throw new UploadError("Upload cancelled.", false); }) });
  const t = track(); await runPost(job, d, t.update, ac.signal);
  expect(t.row()).toMatchObject({ phase: "idle", progress: 0 });
  expect(d.api.finalize).not.toHaveBeenCalled();
});

test("cancel while prepare is in flight leaves the row idle", async () => {
  const ac = new AbortController();
  const d = deps(); (d.api.prepare as jest.Mock).mockImplementation(async () => { ac.abort(); return prepared; });
  const t = track(); expect(await runPost(job, d, t.update, ac.signal)).toBeNull();
  expect(t.row()).toMatchObject({ phase: "idle" });
  expect(d.openReader).not.toHaveBeenCalled();
});

test("finalize is not cancelled once the upload finished", async () => {
  const ac = new AbortController();
  const d = deps({ uploadGoogleResumable: jest.fn(async () => { ac.abort(); return "{}"; }) });
  const t = track(); await runPost(job, d, t.update, ac.signal);
  expect(d.api.finalize).toHaveBeenCalled();
  expect(t.row()).toMatchObject({ phase: "done", url: "https://youtu.be/abc" });
});

test("unreachable during finalize is resumable and keeps the upload result", async () => {
  const d = deps(); (d.api.finalize as jest.Mock).mockRejectedValue(new ApiFailure("unreachable", "offline"));
  const t = track(); const info = await runPost(job, d, t.update, signal());
  expect(t.row()).toMatchObject({ phase: "failed", message: "offline", resumable: true });
  expect(info).toEqual({ prepared, uploaded: true, clientResult: '{"id":"abc"}' });
});

test("unreachable during status polling is resumable", async () => {
  const d = deps();
  (d.api.finalize as jest.Mock).mockResolvedValue({ status: "processing" });
  (d.api.status as jest.Mock).mockRejectedValue(new ApiFailure("platform_unreachable", "YouTube unreachable"));
  const t = track(); await runPost(job, d, t.update, signal());
  expect(t.row()).toMatchObject({ phase: "failed", resumable: true });
});

test("resume from an uploaded session skips prepare and the uploaders and finalizes with the stored result", async () => {
  const d = deps(); const t = track();
  await runPost(job, d, t.update, signal(), { prepared, uploaded: true, clientResult: "stored" });
  expect(d.api.prepare).not.toHaveBeenCalled();
  expect(d.uploadGoogleResumable).not.toHaveBeenCalled();
  expect(d.uploadRelay).not.toHaveBeenCalled();
  expect(d.openReader).not.toHaveBeenCalled();
  expect(d.api.finalize).toHaveBeenCalledWith("s1", "stored");
  expect(t.row()).toMatchObject({ phase: "done" });
});

test("reconnect after upload keeps the resume info", async () => {
  const d = deps(); (d.api.finalize as jest.Mock).mockRejectedValue(new ApiFailure("reconnect", "Reconnect"));
  const t = track(); const info = await runPost(job, d, t.update, signal());
  expect(t.row()).toMatchObject({ phase: "needsReconnect" });
  expect(info).toMatchObject({ uploaded: true });
});

describe("a finished upload is never uploaded again", () => {
  const uploadedInfo = { prepared, uploaded: true, clientResult: '{"id":"abc"}' };

  test.each([
    ["unreachable", new ApiFailure("unreachable", "offline")],
    ["internal", new ApiFailure("internal", "Something went wrong.")],
    ["platform_unreachable", new ApiFailure("platform_unreachable", "Couldn't reach YouTube. Try again.")],
    ["unauthorized", new ApiFailure("unauthorized", "Sign in again.")],
    ["signed_out", new ApiFailure("signed_out", "Sign in to Clipy first.")],
    ["unavailable", new ApiFailure("unavailable", "YouTube isn't set up on the server yet.")],
    ["not_configured", new ApiFailure("not_configured", "Posting isn't set up yet.")],
    ["bad_request", new ApiFailure("bad_request", "Finish the upload first.")],
    ["a plain exception", new Error("boom")],
  ])("finalize failing with %s is resumable and keeps the upload result", async (_name, err) => {
    const d = deps(); (d.api.finalize as jest.Mock).mockRejectedValue(err);
    const t = track(); const info = await runPost(job, d, t.update, signal());
    expect(t.row()).toMatchObject({ phase: "failed", message: err.message, resumable: true });
    expect(info).toEqual(uploadedInfo);
  });

  test("a status poll failing with a non-final code is resumable", async () => {
    const d = deps();
    (d.api.finalize as jest.Mock).mockResolvedValue({ status: "processing" });
    (d.api.status as jest.Mock).mockRejectedValue(new ApiFailure("unavailable", "not set up"));
    const t = track(); expect(await runPost(job, d, t.update, signal())).toEqual(uploadedInfo);
    expect(t.row()).toMatchObject({ phase: "failed", resumable: true });
  });

  test("cancel then a failure while polling still keeps the upload resumable", async () => {
    const ac = new AbortController();
    const d = deps();
    (d.api.finalize as jest.Mock).mockImplementation(async () => { ac.abort(); throw new ApiFailure("internal", "Something went wrong."); });
    const t = track(); expect(await runPost(job, d, t.update, ac.signal)).toEqual(uploadedInfo);
    expect(t.row()).toMatchObject({ phase: "failed", resumable: true });
  });

  test.each([
    ["platform_error", "The video has been rejected."],
    ["not_found", "That upload no longer exists."],
  ])("%s after the upload is final: keeps the platform's text, says Retry uploads again, drops the info", async (code, text) => {
    const d = deps(); (d.api.finalize as jest.Mock).mockRejectedValue(new ApiFailure(code, text));
    const t = track(); expect(await runPost(job, d, t.update, signal())).toBeNull();
    expect(t.row()).toMatchObject({ phase: "failed", message: `${text} Retry will upload the video again.`, resumable: false });
  });

  test("end to end: upload done, finalize unreachable, resume finalizes with the stored result and never uploads again", async () => {
    const d = deps();
    (d.api.finalize as jest.Mock).mockRejectedValueOnce(new ApiFailure("platform_unreachable", "Couldn't reach YouTube. Try again."));
    const t = track();
    const info = await runPost(job, d, t.update, signal());
    expect(t.row()).toMatchObject({ phase: "failed", resumable: true });
    expect(d.uploadGoogleResumable).toHaveBeenCalledTimes(1);

    (d.uploadGoogleResumable as jest.Mock).mockClear(); (d.openReader as jest.Mock).mockClear(); (d.api.prepare as jest.Mock).mockClear(); (d.api.finalize as jest.Mock).mockClear();
    await runPost(job, d, t.update, signal(), info);
    expect(d.uploadGoogleResumable).not.toHaveBeenCalled();
    expect(d.uploadRelay).not.toHaveBeenCalled();
    expect(d.openReader).not.toHaveBeenCalled();
    expect(d.api.prepare).not.toHaveBeenCalled();
    expect(d.api.finalize).toHaveBeenCalledWith("s1", '{"id":"abc"}');
    expect(t.row()).toMatchObject({ phase: "done", url: "https://youtu.be/abc" });
  });
});
