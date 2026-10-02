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

test("retry of a resumable failure passes the stored ResumeInfo; non-resumable passes null", async () => {
  const { h } = await setup();
  await act(async () => h.result.current.start([yt]));
  await act(async () => { calls[0].update({ phase: "failed", resumable: true }); calls[0].finish(info); });
  await act(async () => h.result.current.retry(yt));
  expect(calls[1].resume).toBe(info);
  await act(async () => { calls[1].update({ phase: "failed", resumable: false }); calls[1].finish(info); });
  await act(async () => h.result.current.retry(yt));
  expect(calls[2].resume).toBeNull();
});

test("cancel aborts every controller", async () => {
  const { h } = await setup();
  await act(async () => h.result.current.start([yt, tt]));
  await act(async () => h.result.current.cancel());
  expect(calls.every((c) => c.signal.aborted)).toBe(true);
});

test("a stale run's update is ignored and cannot overwrite a newer run", async () => {
  const { h, onPosted } = await setup();
  await act(async () => h.result.current.start([yt]));
  await act(async () => h.result.current.cancel());
  await act(async () => h.result.current.start([yt]));
  expect(calls[0].signal.aborted).toBe(true);
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
