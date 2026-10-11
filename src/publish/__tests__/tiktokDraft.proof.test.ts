/**
 * PROOF: what the phone does for a TikTok draft, as it was before Direct Post existed. Written against the untouched code and
 * never edited to make a change pass.
 */
import { clientAdapters } from "../adapters";
import type { Prepared } from "../api";
import { IDLE_ROW, runPost, type PostDeps, type RowState } from "../runPost";

const video = { fileUri: "file:///v.mp4", fileSize: 10, durationSec: 21, mimeType: "video/mp4" };
const NOTE = "Clipy sends the video to your TikTok inbox. Open TikTok to add the caption and post it (up to 5 unfinished drafts a day).";

test("PROOF: with no options the adapter is the draft adapter", () => {
  const tt = clientAdapters.tiktok!;
  expect(tt.captionMax).toBeNull();
  expect(tt.defaultOptions("Beach day")).toEqual({});
  expect(tt.validate(video, "x".repeat(10000), {})).toBeNull();
  expect(tt.validate({ ...video, durationSec: 601 }, "", {})).toBe("TikTok accepts videos up to 10 minutes.");
  expect(tt.validate({ ...video, fileSize: 4 * 1024 ** 3 + 1 }, "", {})).toBe("TikTok accepts videos up to 4 GB.");
  expect(tt.validate({ ...video, mimeType: "video/x-msvideo" }, "", {})).toBe("TikTok accepts MP4, MOV or WebM videos.");
  expect(tt.note(video)).toBe(NOTE);
  expect(tt.doneNote).toBe("Sent to TikTok — open TikTok to finish posting.");
});

test("PROOF: a draft is prepared with options {} and uploaded through the TikTok uploader with nothing new", async () => {
  const prepared: Prepared = { sessionId: "s1", protocol: "tiktok-chunks", uploadUrl: "https://up/x?t=1", uploadHeaders: {}, chunkSize: 4 };
  const reader = { size: 10, read: jest.fn(), close: jest.fn() };
  const deps: PostDeps = {
    api: { prepare: jest.fn(async () => prepared), uploadChunk: jest.fn(), finalize: jest.fn(async () => ({ status: "done" as const, url: null })), status: jest.fn() },
    openReader: jest.fn(() => reader), uploadGoogleResumable: jest.fn(), uploadRelay: jest.fn(), uploadTikTokChunks: jest.fn(async () => {}), uploadMetaWhole: jest.fn(),
    sleep: jest.fn(async () => {}),
  };
  let row: RowState = IDLE_ROW;
  await runPost({ platform: "tiktok", video, caption: "Beach day", options: {} }, deps, (p) => { row = { ...row, ...p }; }, new AbortController().signal);
  expect(deps.api.prepare).toHaveBeenCalledWith({ platform: "tiktok", fileSize: 10, durationSec: 21, mimeType: "video/mp4", caption: "Beach day", options: {} });
  const [url, args] = (deps.uploadTikTokChunks as jest.Mock).mock.calls[0];
  expect(url).toBe("https://up/x?t=1");
  expect(Object.keys(args).sort()).toEqual(["chunkSize", "mimeType", "onProgress", "reader", "resume", "signal"]);
  expect(deps.api.finalize).toHaveBeenCalledWith("s1", null);
  expect(row).toMatchObject({ phase: "done", url: null, message: null });
});
