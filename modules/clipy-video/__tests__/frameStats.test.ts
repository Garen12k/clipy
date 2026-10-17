const mockNative: { module: Record<string, unknown> | null } = { module: null };
jest.mock("expo-modules-core", () => ({ ...jest.requireActual("expo-modules-core"), requireOptionalNativeModule: jest.fn(() => mockNative.module) }));
import { cancelFrameStats, frameStats, isFrameStatsAvailable, isStatsCancelled, isStatsInterrupted, STATS_CANCELLED, STATS_INTERRUPTED } from "../frameStats";

const answer = { frames: [{ time: 1, histogram: new Array(64).fill(0), r: 0.5, g: 0.5, b: 0.5, saturation: 0.2, pixels: 10 }], failed: 0 };
const full = () => ({ frameStats: jest.fn(async () => answer), cancelFrameStats: jest.fn() });
/** A build from before "auto enhance": the module with older functions only. */
const older = () => ({ hello: jest.fn(), soundPeaks: jest.fn(), textReveal: jest.fn() });
const req = { jobId: "j", uri: "file:///a.mov", kind: "video" as const, times: [1], maxSide: 256 };

test("the build is known by the presence of frameStats", () => {
  mockNative.module = null;
  expect(isFrameStatsAvailable()).toBe(false);
  mockNative.module = older();
  expect(isFrameStatsAvailable()).toBe(false);
  mockNative.module = full();
  expect(isFrameStatsAvailable()).toBe(true);
});

test("without it nothing is called, frameStats rejects (never throws) and the cancel is quiet", async () => {
  for (const m of [null, older()]) {
    mockNative.module = m;
    const p = frameStats(req);
    await expect(p).rejects.toThrow("Install the latest Clipy build");
    expect(() => cancelFrameStats("j")).not.toThrow();
    if (m) for (const fn of Object.values(m)) expect(fn).not.toHaveBeenCalled();
  }
});

test("on the build the calls go through with their arguments", async () => {
  const m = full();
  mockNative.module = m;
  await expect(frameStats(req)).resolves.toEqual(answer);
  expect(m.frameStats).toHaveBeenCalledWith(req);
  cancelFrameStats("j");
  expect(m.cancelFrameStats).toHaveBeenCalledWith("j");
});

test("a module that throws is the module missing", () => {
  const { requireOptionalNativeModule } = jest.requireMock("expo-modules-core") as { requireOptionalNativeModule: jest.Mock };
  requireOptionalNativeModule.mockImplementationOnce(() => { throw new Error("boom"); });
  expect(isFrameStatsAvailable()).toBe(false);
});

test("the two codes", () => {
  expect(STATS_CANCELLED).toBe("E_STATS_CANCELLED");
  expect(STATS_INTERRUPTED).toBe("E_STATS_INTERRUPTED");
  expect(isStatsCancelled({ code: "E_STATS_CANCELLED" })).toBe(true);
  expect(isStatsInterrupted({ code: "E_STATS_INTERRUPTED" })).toBe(true);
  expect(isStatsCancelled(new Error("x"))).toBe(false);
  expect(isStatsInterrupted(null)).toBe(false);
});
