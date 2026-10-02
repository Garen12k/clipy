import { act, renderHook } from "@testing-library/react-native";
import type { Prepared } from "../api";
import type { ResumeInfo, RowState } from "../runPost";

jest.mock("../runPost", () => ({ ...jest.requireActual("../runPost"), runPost: jest.fn() }));
import { runPost } from "../runPost";
import { usePost } from "../usePost";

const video = { fileUri: "file:///v.mp4", fileSize: 10, durationSec: 21, mimeType: "video/mp4" };
const yt = { platform: "youtube" as const, caption: "c", options: {} };
const tt = { platform: "tiktok" as const, caption: "c", options: {} };
const prepared: Prepared = { sessionId: "s1", protocol: "relay", uploadUrl: null, uploadHeaders: {}, chunkSize: 4 };
const info: ResumeInfo = { prepared, uploaded: true, clientResult: null };

interface Call { update: (p: Partial<RowState>) => void; signal: AbortSignal; resume: ResumeInfo | null | undefined; finish(p: ResumeInfo | null): void }
let calls: Call[];
beforeEach(() => {
  calls = [];
  (runPost as jest.Mock).mockReset().mockImplementation((_job, _d, update, signal, resume) => new Promise((finish) => { calls.push({ update, signal, resume, finish }); }));
});
async function setup() {
  const onPosted = jest.fn();
  const h = await renderHook(() => usePost(video, onPosted));
  return { h, onPosted };
}

test("parallel rows are independent and busy reflects active phases", async () => {
  const { h } = await setup();
  await act(async () => h.result.current.start([yt, tt]));
  expect(calls).toHaveLength(2);
  expect(h.result.current.busy).toBe(false);
  await act(async () => { calls[0].update({ phase: "uploading", progress: 0.4 }); });
  expect(h.result.current.busy).toBe(true);
  expect(h.result.current.rows.youtube).toMatchObject({ phase: "uploading", progress: 0.4 });
  expect(h.result.current.rows.tiktok.phase).toBe("idle");
  await act(async () => { calls[0].update({ phase: "failed", message: "no" }); calls[1].update({ phase: "publishing" }); });
  expect(h.result.current.busy).toBe(true);
  await act(async () => { calls[1].update({ phase: "done", url: "u" }); });
  expect(h.result.current.busy).toBe(false);
  expect(h.result.current.rows.youtube.phase).toBe("failed");
});

test("onPosted fires once per successful run", async () => {
  const { h, onPosted } = await setup();
  await act(async () => h.result.current.start([yt]));
  await act(async () => { calls[0].update({ phase: "done", url: "https://y/1" }); calls[0].update({ message: "extra" }); });
  expect(onPosted).toHaveBeenCalledTimes(1);
  expect(onPosted).toHaveBeenCalledWith("youtube", "https://y/1");
});

test("retry of a resumable failure passes the stored ResumeInfo; non-resumable before the upload passes null", async () => {
  const notUploaded: ResumeInfo = { ...info, uploaded: false };
  const { h } = await setup();
  await act(async () => h.result.current.start([yt]));
  await act(async () => { calls[0].update({ phase: "failed", resumable: true }); calls[0].finish(notUploaded); });
  await act(async () => h.result.current.retry(yt));
  expect(calls[1].resume).toBe(notUploaded);
  await act(async () => { calls[1].update({ phase: "failed", resumable: false }); calls[1].finish(notUploaded); });
  await act(async () => h.result.current.retry(yt));
  expect(calls[2].resume).toBeNull();
});

test("retry after a finished upload passes the stored info even when the row is not marked resumable", async () => {
  const { h } = await setup();
  await act(async () => h.result.current.start([yt]));
  await act(async () => { calls[0].update({ phase: "failed", resumable: false }); calls[0].finish(info); });
  await act(async () => h.result.current.retry(yt));
  expect(calls[1].resume).toBe(info);
});

test("retry of a TikTok row left resumable by platform_unavailable after the upload passes the stored ResumeInfo", async () => {
  const ttInfo: ResumeInfo = { prepared: { ...prepared, protocol: "tiktok-chunks", uploadUrl: "https://up/x" }, uploaded: true, clientResult: null };
  const { h } = await setup();
  await act(async () => h.result.current.start([tt]));
  await act(async () => { calls[0].update({ phase: "failed", resumable: true, message: "TikTok is busy — wait a minute, then try again." }); calls[0].finish(ttInfo); });
  await act(async () => h.result.current.retry(tt));
  expect(calls[1].resume).toBe(ttInfo);
});

test("retry after a final failure (runPost dropped the info) starts over", async () => {
  const { h } = await setup();
  await act(async () => h.result.current.start([yt]));
  await act(async () => { calls[0].update({ phase: "failed", resumable: false }); calls[0].finish(null); });
  await act(async () => h.result.current.retry(yt));
  expect(calls[1].resume).toBeNull();
});

test("cancel aborts every controller", async () => {
  const { h } = await setup();
  await act(async () => h.result.current.start([yt, tt]));
  await act(async () => h.result.current.cancel());
  expect(calls.every((c) => c.signal.aborted)).toBe(true);
});

test("a cancelled run still settling blocks a second start and its final update is applied", async () => {
  const { h, onPosted } = await setup();
  await act(async () => h.result.current.start([yt]));
  await act(async () => h.result.current.cancel());
  expect(calls[0].signal.aborted).toBe(true);
  await act(async () => h.result.current.start([yt]));
  await act(async () => h.result.current.retry(yt));
  expect(calls).toHaveLength(1);
  await act(async () => { calls[0].update({ phase: "done", url: "https://y/1" }); calls[0].finish(info); });
  expect(h.result.current.rows.youtube).toMatchObject({ phase: "done", url: "https://y/1" });
  expect(onPosted).toHaveBeenCalledTimes(1);
  await act(async () => h.result.current.start([yt]));
  expect(calls).toHaveLength(2);
});

test("a late update from a superseded run is ignored", async () => {
  const { h, onPosted } = await setup();
  await act(async () => h.result.current.start([yt]));
  await act(async () => { calls[0].update({ phase: "failed" }); calls[0].finish(null); });
  await act(async () => h.result.current.start([yt]));
  await act(async () => { calls[1].update({ phase: "uploading", progress: 0.2 }); });
  await act(async () => { calls[0].update({ phase: "done", url: "old" }); });
  expect(h.result.current.rows.youtube).toMatchObject({ phase: "uploading", progress: 0.2 });
  expect(onPosted).not.toHaveBeenCalled();
});

test("unmount cancels and later updates do nothing", async () => {
  const { h, onPosted } = await setup();
  await act(async () => h.result.current.start([yt]));
  const err = jest.spyOn(console, "error").mockImplementation(() => {});
  await h.unmount();
  expect(calls[0].signal.aborted).toBe(true);
  await act(async () => { calls[0].update({ phase: "done", url: "u" }); calls[0].finish(info); });
  expect(onPosted).not.toHaveBeenCalled();
  expect(err).not.toHaveBeenCalled();
  err.mockRestore();
});

test("retry passes the stored info after needsReconnect too", async () => {
  const { h } = await setup();
  await act(async () => h.result.current.start([yt]));
  await act(async () => { calls[0].update({ phase: "needsReconnect" }); calls[0].finish(info); });
  await act(async () => h.result.current.retry(yt));
  expect(calls[1].resume).toBe(info);
});

test("start and retry ignore a platform that is already running", async () => {
  const { h } = await setup();
  await act(async () => { h.result.current.start([yt]); h.result.current.start([yt]); });
  await act(async () => h.result.current.retry(yt));
  expect(calls).toHaveLength(1);
});

test("a throwing onPosted leaves the row done", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  const onPosted = jest.fn(() => { throw new Error("boom"); });
  const h = await renderHook(() => usePost(video, onPosted));
  await act(async () => h.result.current.start([yt]));
  await act(async () => { calls[0].update({ phase: "done", url: "u" }); });
  expect(h.result.current.rows.youtube.phase).toBe("done");
  expect(warn).toHaveBeenCalled();
  warn.mockRestore();
});
