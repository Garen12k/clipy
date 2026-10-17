jest.mock("@/modules/clipy-video/frameStats", () => ({
  isFrameStatsAvailable: jest.fn(() => true), frameStats: jest.fn(), cancelFrameStats: jest.fn(),
  isStatsCancelled: (e: { code?: string }) => e?.code === "E_STATS_CANCELLED",
  isStatsInterrupted: (e: { code?: string }) => e?.code === "E_STATS_INTERRUPTED",
}));
import { cancelFrameStats, frameStats, isFrameStatsAvailable } from "@/modules/clipy-video/frameStats";
import { AUTO_DEADLINE_MS, AUTO_MEMORY, lookAt, lookKey, rememberApplied, resetAutoLooks, setStrength, stopLooking, useAutoLooks, type LookSource } from "../autoLook";
import { frame, VECTORS } from "../model/__tests__/autoEnhance.vectors";

const fs = frameStats as jest.Mock;
const src: LookSource = { clipId: "a", uri: "file:///a.mov", kind: "video", from: 0, to: 10 };
const darkAnswer = { frames: [VECTORS[1].f], failed: 0 };
const deferred = <T,>() => { let resolve!: (v: T) => void, reject!: (e: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

beforeEach(() => { fs.mockReset(); (cancelFrameStats as jest.Mock).mockReset(); (isFrameStatsAvailable as jest.Mock).mockReturnValue(true); resetAutoLooks(); jest.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => { jest.useRealTimers(); (console.warn as jest.Mock).mockRestore(); });

test("asks the phone once with the clip's file, kind, times and side; remembers the target for the session", async () => {
  fs.mockResolvedValue(darkAnswer);
  await expect(lookAt(src)).resolves.toEqual({ status: "ready", target: VECTORS[1].want });
  expect(fs).toHaveBeenCalledTimes(1);
  expect(fs.mock.calls[0][0]).toMatchObject({ uri: "file:///a.mov", kind: "video", times: [1, 3, 5, 7, 9], maxSide: 256 });
  expect(useAutoLooks.getState().targets[lookKey(src)]).toEqual(VECTORS[1].want);
  await expect(lookAt(src)).resolves.toEqual({ status: "ready", target: VECTORS[1].want });
  expect(fs).toHaveBeenCalledTimes(1);   // known: no second read
  expect(lookKey(src)).toBe("a|file:///a.mov|0|10");
  expect(lookKey({ ...src, to: 9 })).not.toBe(lookKey(src));   // another trim is another look
});

test("a photo is asked as one picture", async () => {
  fs.mockResolvedValue(darkAnswer);
  await lookAt({ ...src, kind: "photo" });
  expect(fs.mock.calls[0][0]).toMatchObject({ kind: "photo", times: [0] });
});

test("without the build nothing is asked", async () => {
  (isFrameStatsAvailable as jest.Mock).mockReturnValue(false);
  await expect(lookAt(src)).resolves.toEqual({ status: "unavailable" });
  expect(fs).not.toHaveBeenCalled();
});

test("one at a time: a second look while one runs is busy", async () => {
  const d = deferred<typeof darkAnswer>();
  fs.mockReturnValue(d.promise);
  const first = lookAt(src);
  await expect(lookAt({ ...src, clipId: "b" })).resolves.toEqual({ status: "busy" });
  d.resolve(darkAnswer);
  await expect(first).resolves.toMatchObject({ status: "ready" });
});

test("stop ends it at once, tells the phone, and a late answer is dropped (nothing remembered)", async () => {
  const d = deferred<typeof darkAnswer>();
  fs.mockReturnValue(d.promise);
  const look = lookAt(src);
  await Promise.resolve();
  stopLooking();
  await expect(look).resolves.toEqual({ status: "cancelled" });
  expect(cancelFrameStats).toHaveBeenCalledWith(fs.mock.calls[0][0].jobId);
  d.resolve(darkAnswer);
  await Promise.resolve();
  expect(useAutoLooks.getState().targets).toEqual({});
});

test("the deadline counts time in front only; past it the phone is told to stop and the look failed", async () => {
  jest.useFakeTimers();
  fs.mockReturnValue(new Promise(() => {}));
  const look = lookAt(src);
  await jest.advanceTimersByTimeAsync(AUTO_DEADLINE_MS);
  await expect(look).resolves.toEqual({ status: "failed" });
  expect(cancelFrameStats).toHaveBeenCalledTimes(1);
});

test("interrupted (Clipy was away) is asked again in front, at most twice more; a failure is failed and logged", async () => {
  const away = { code: "E_STATS_INTERRUPTED", message: "stats interrupted: …" };
  fs.mockRejectedValueOnce(away).mockResolvedValueOnce(darkAnswer);
  await expect(lookAt(src)).resolves.toMatchObject({ status: "ready" });
  expect(fs).toHaveBeenCalledTimes(2);
  fs.mockReset(); resetAutoLooks();
  fs.mockRejectedValue(away);
  await expect(lookAt(src)).resolves.toEqual({ status: "failed" });
  expect(fs).toHaveBeenCalledTimes(3);
  fs.mockReset();
  fs.mockRejectedValue(new Error("stats frames: no frame could be read"));
  await expect(lookAt(src)).resolves.toEqual({ status: "failed" });
  expect(console.warn).toHaveBeenCalledWith("auto enhance failed", "stats frames: no frame could be read");
  fs.mockResolvedValue({ frames: [{ ...frame(0, 1, 0, 0, 0, 0), histogram: [1] }], failed: 1 });
  await expect(lookAt(src)).resolves.toEqual({ status: "failed" });   // nothing usable came back
});

test("memory: applied entries, the strength, and a cap of AUTO_MEMORY", () => {
  rememberApplied("k", { base: VECTORS[0].want, strength: 1 });
  setStrength("k", 0.4);
  expect(useAutoLooks.getState().applied.k).toEqual({ base: VECTORS[0].want, strength: 0.4 });
  setStrength("none", 0.4);
  expect(useAutoLooks.getState().applied.none).toBeUndefined();
  for (let i = 0; i < AUTO_MEMORY + 3; i++) rememberApplied(`k${i}`, { base: VECTORS[0].want, strength: 1 });
  const keys = Object.keys(useAutoLooks.getState().applied);
  expect(keys).toHaveLength(AUTO_MEMORY);
  expect(keys[keys.length - 1]).toBe(`k${AUTO_MEMORY + 2}`);
  expect(keys).not.toContain("k");
});
