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
    uploadTikTokChunks: jest.fn(async () => {}),
    uploadMetaWhole: jest.fn(async () => {}),
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
    ["platform_unavailable", new ApiFailure("platform_unavailable", "Backend Error")],
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

describe("tiktok-chunks", () => {
  const tt = { ...prepared, protocol: "tiktok-chunks" as const, uploadUrl: "https://up/x?t=1" };
  test("uploads through uploadTikTokChunks and finalizes with no client result", async () => {
    const d = deps({ api: { ...deps().api, prepare: jest.fn(async () => tt) } });
    await runPost(job, d, track().update, signal());
    expect(d.uploadTikTokChunks).toHaveBeenCalledWith("https://up/x?t=1", expect.objectContaining({ chunkSize: 4 }));
    expect(d.uploadGoogleResumable).not.toHaveBeenCalled();
    expect(d.uploadRelay).not.toHaveBeenCalled();
    expect(d.api.finalize).toHaveBeenCalledWith("s1", null);
  });
  test("a plan without uploadUrl is refused", async () => {
    const d = deps({ api: { ...deps().api, prepare: jest.fn(async () => ({ ...tt, uploadUrl: null })) } }), t = track();
    expect(await runPost(job, d, t.update, signal())).toBeNull();
    expect(t.row()).toMatchObject({ phase: "failed", message: "The server sent an unexpected upload plan.", resumable: false });
    expect(d.uploadTikTokChunks).not.toHaveBeenCalled();
  });
  test("a non-resumable upload failure is not resumable and does not mark the upload done", async () => {
    const d = deps({ api: { ...deps().api, prepare: jest.fn(async () => tt) }, uploadTikTokChunks: jest.fn(async () => { throw new UploadError("The TikTok upload link expired. Post again.", false); }) }), t = track();
    const info = await runPost(job, d, t.update, signal());
    expect(t.row()).toMatchObject({ phase: "failed", resumable: false, message: "The TikTok upload link expired. Post again." });
    expect(info).toEqual({ prepared: tt, uploaded: false, clientResult: null });
    // usePost's Retry passes no resume info for a non-resumable, not-uploaded row: a fresh prepare and a fresh upload.
    (d.uploadTikTokChunks as jest.Mock).mockImplementation(async () => {});
    const t2 = track();
    await runPost(job, d, t2.update, signal(), null);
    expect(d.api.prepare).toHaveBeenCalledTimes(2);
    expect(d.uploadTikTokChunks).toHaveBeenCalledTimes(2);
    expect(t2.row()).toMatchObject({ phase: "done" });
  });
  test("upload done, finalize platform_unavailable: resumable with TikTok's words; Retry only finalizes (no second draft)", async () => {
    const ttJob = { ...job, platform: "tiktok" as const };
    const d = deps({ api: { ...deps().api, prepare: jest.fn(async () => tt) } }), t = track();
    (d.api.finalize as jest.Mock).mockRejectedValueOnce(new ApiFailure("platform_unavailable", "TikTok is busy — wait a minute, then try again.")).mockResolvedValue({ status: "done", url: null });
    const info = await runPost(ttJob, d, t.update, signal());
    expect(t.row()).toMatchObject({ phase: "failed", resumable: true, message: "TikTok is busy — wait a minute, then try again." });
    expect(info).toEqual({ prepared: tt, uploaded: true, clientResult: null });
    await runPost(ttJob, d, t.update, signal(), info);
    expect(d.api.prepare).toHaveBeenCalledTimes(1);
    expect(d.uploadTikTokChunks).toHaveBeenCalledTimes(1);
    expect(d.openReader).toHaveBeenCalledTimes(1);
    expect(d.api.finalize).toHaveBeenCalledTimes(2);
    expect(t.row()).toMatchObject({ phase: "done", url: null });
  });
  test("a status poll answering platform_unavailable after the upload is resumable too", async () => {
    const d = deps({ api: { ...deps().api, prepare: jest.fn(async () => tt) } }), t = track();
    (d.api.finalize as jest.Mock).mockResolvedValue({ status: "processing" });
    (d.api.status as jest.Mock).mockRejectedValue(new ApiFailure("platform_unavailable", "TikTok is having trouble — try again."));
    expect(await runPost({ ...job, platform: "tiktok" }, d, t.update, signal())).toEqual({ prepared: tt, uploaded: true, clientResult: null });
    expect(t.row()).toMatchObject({ phase: "failed", resumable: true });
  });
  test("platform_unavailable from prepare (nothing uploaded) is a plain failed row; Retry opens a fresh session", async () => {
    const d = deps({ api: { ...deps().api, prepare: jest.fn().mockRejectedValueOnce(new ApiFailure("platform_unavailable", "TikTok is busy — wait a minute, then try again.")).mockResolvedValue(tt) } }), t = track();
    expect(await runPost({ ...job, platform: "tiktok" }, d, t.update, signal())).toBeNull();
    expect(t.row()).toMatchObject({ phase: "failed", resumable: false, message: "TikTok is busy — wait a minute, then try again." });
    expect(d.uploadTikTokChunks).not.toHaveBeenCalled();
    await runPost({ ...job, platform: "tiktok" }, d, t.update, signal(), null);
    expect(d.api.prepare).toHaveBeenCalledTimes(2);
    expect(t.row()).toMatchObject({ phase: "done" });
  });
});

describe("meta-rupload and the wait hint", () => {
  const META_URL = "https://rupload.facebook.com/video-upload/v25.0/123";
  const headers = { Authorization: "OAuth tok", offset: "0", file_size: "10" };
  const meta: Prepared = { sessionId: "m1", protocol: "meta-rupload", uploadUrl: META_URL, uploadHeaders: headers, chunkSize: 10 };
  const ig = { ...job, platform: "instagram" as const };
  const fb = { ...job, platform: "facebook" as const };
  const metaDeps = (plan: Prepared, over: Partial<PostDeps> = {}) => deps({ api: { ...deps().api, prepare: jest.fn(async () => plan) }, ...over });
  const IG_TIMEOUT = "Instagram is still processing the video. Tap Resume in a minute to finish posting.";

  test("uploads through uploadMetaWhole with the file and headers, opens no reader, finalizes with no client result", async () => {
    const d = metaDeps(meta), t = track();
    expect(await runPost(ig, d, t.update, signal())).toEqual({ prepared: meta, uploaded: true, clientResult: null });
    expect(d.uploadMetaWhole).toHaveBeenCalledWith(META_URL, headers, "file:///v.mp4", { onProgress: expect.any(Function), signal: expect.any(AbortSignal) });
    expect(d.openReader).not.toHaveBeenCalled();
    expect(d.uploadGoogleResumable).not.toHaveBeenCalled();
    expect(d.uploadRelay).not.toHaveBeenCalled();
    expect(d.uploadTikTokChunks).not.toHaveBeenCalled();
    expect(d.api.finalize).toHaveBeenCalledWith("m1", null);
    expect(t.phases).toEqual(["preparing", "uploading", "publishing", "done"]);
  });

  test("progress from uploadMetaWhole reaches the row", async () => {
    const seen: number[] = [];
    const d = metaDeps(meta, { uploadMetaWhole: jest.fn(async (_u, _h, _f, a) => { a.onProgress(0.25); }) });
    await runPost(ig, d, (p) => { if (p.progress !== undefined) seen.push(p.progress); }, signal());
    expect(seen).toContain(0.25);
  });

  test("a meta-rupload plan without uploadUrl is refused", async () => {
    const d = metaDeps({ ...meta, uploadUrl: null }), t = track();
    expect(await runPost(ig, d, t.update, signal())).toBeNull();
    expect(t.row()).toMatchObject({ phase: "failed", message: "The server sent an unexpected upload plan.", resumable: false });
    expect(d.uploadMetaWhole).not.toHaveBeenCalled();
  });

  test("an upload failure keeps the row failed and not uploaded", async () => {
    const d = metaDeps(meta, { uploadMetaWhole: jest.fn(async () => { throw new UploadError("The connection dropped. Post again to restart the upload.", false); }) }), t = track();
    expect(await runPost(ig, d, t.update, signal())).toEqual({ prepared: meta, uploaded: false, clientResult: null });
    expect(t.row()).toMatchObject({ phase: "failed", resumable: false, message: "The connection dropped. Post again to restart the upload." });
  });

  test("wait {600, resumeOnTimeout}: polls up to 200 times, then a resumable failure that keeps the upload", async () => {
    const plan = { ...meta, wait: { maxSeconds: 600, resumeOnTimeout: true } };
    const d = metaDeps(plan), t = track();
    (d.api.finalize as jest.Mock).mockResolvedValue({ status: "processing" });
    (d.api.status as jest.Mock).mockResolvedValue({ status: "processing" });
    const info = await runPost(ig, d, t.update, signal());
    expect(d.api.status).toHaveBeenCalledTimes(200);
    expect(t.row()).toMatchObject({ phase: "failed", resumable: true, message: IG_TIMEOUT, url: null });
    expect(info).toEqual({ prepared: plan, uploaded: true, clientResult: null });

    // Resume goes straight to finalize: no prepare, no reader, no second upload.
    (d.api.finalize as jest.Mock).mockResolvedValue({ status: "done", url: "https://www.instagram.com/reel/abc/" });
    const t2 = track();
    await runPost(ig, d, t2.update, signal(), info);
    expect(d.api.prepare).toHaveBeenCalledTimes(1);
    expect(d.uploadMetaWhole).toHaveBeenCalledTimes(1);
    expect(d.api.finalize).toHaveBeenCalledTimes(2);
    expect(d.api.finalize).toHaveBeenLastCalledWith("m1", null);
    expect(t2.row()).toMatchObject({ phase: "done", url: "https://www.instagram.com/reel/abc/" });
  });

  test("wait {300, no resume}: polls up to 100 times, then done without a link", async () => {
    const d = metaDeps({ ...meta, wait: { maxSeconds: 300, resumeOnTimeout: false } }), t = track();
    (d.api.finalize as jest.Mock).mockResolvedValue({ status: "processing" });
    (d.api.status as jest.Mock).mockResolvedValue({ status: "processing" });
    await runPost(fb, d, t.update, signal());
    expect(d.api.status).toHaveBeenCalledTimes(100);
    expect(t.row()).toMatchObject({ phase: "done", url: null, message: "Still processing on Facebook — check the app later." });
  });

  test("no wait keeps the 40-poll default", async () => {
    const d = metaDeps(meta), t = track();
    (d.api.finalize as jest.Mock).mockResolvedValue({ status: "processing" });
    (d.api.status as jest.Mock).mockResolvedValue({ status: "processing" });
    await runPost(fb, d, t.update, signal());
    expect(d.api.status).toHaveBeenCalledTimes(POLL_LIMIT);
    expect(POLL_LIMIT).toBe(40);
    expect(t.row()).toMatchObject({ phase: "done", url: null });
  });

  test.each([
    ["1800 s (the cap)", 1800, 600],
    ["1801 s (capped at 1800)", 1801, 600],
    ["a huge value (capped at 1800)", 1e9, 600],
    ["0 (the default)", 0, POLL_LIMIT],
    ["a negative value (the default)", -5, POLL_LIMIT],
    ["NaN (the default)", NaN, POLL_LIMIT],
    ["Infinity (the default)", Infinity, POLL_LIMIT],
  ])("wait.maxSeconds %s polls %i times at most", async (_name, maxSeconds, polls) => {
    const d = metaDeps({ ...meta, wait: { maxSeconds, resumeOnTimeout: true } }), t = track();
    (d.api.finalize as jest.Mock).mockResolvedValue({ status: "processing" });
    (d.api.status as jest.Mock).mockResolvedValue({ status: "processing" });
    await runPost(ig, d, t.update, signal());
    expect(d.api.status).toHaveBeenCalledTimes(polls);
    expect(t.row()).toMatchObject({ phase: "failed", resumable: true, message: IG_TIMEOUT });
  });

  test("cancel during polling with resumeOnTimeout is a resumable failure, not done", async () => {
    const ac = new AbortController();
    const plan = { ...meta, wait: { maxSeconds: 600, resumeOnTimeout: true } };
    const d = metaDeps(plan, { sleep: jest.fn(async () => { ac.abort(); }) }), t = track();
    (d.api.finalize as jest.Mock).mockResolvedValue({ status: "processing" });
    const info = await runPost(ig, d, t.update, ac.signal);
    expect(d.api.status).not.toHaveBeenCalled();
    expect(t.row()).toMatchObject({ phase: "failed", resumable: true, message: IG_TIMEOUT });
    expect(t.phases).not.toContain("done");
    expect(info).toEqual({ prepared: plan, uploaded: true, clientResult: null });
  });

  test("done during a long wait ends with the link", async () => {
    const d = metaDeps({ ...meta, wait: { maxSeconds: 600, resumeOnTimeout: true } }), t = track();
    (d.api.finalize as jest.Mock).mockResolvedValue({ status: "processing" });
    (d.api.status as jest.Mock).mockResolvedValueOnce({ status: "processing" }).mockResolvedValueOnce({ status: "done", url: "https://www.instagram.com/reel/x/" });
    await runPost(ig, d, t.update, signal());
    expect(t.row()).toMatchObject({ phase: "done", url: "https://www.instagram.com/reel/x/" });
  });
});
