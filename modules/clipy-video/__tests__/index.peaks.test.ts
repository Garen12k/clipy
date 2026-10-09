jest.mock("expo-modules-core", () => {
  const actual = jest.requireActual("expo-modules-core");
  return { ...actual, requireOptionalNativeModule: jest.fn() };
});
import { requireOptionalNativeModule } from "expo-modules-core";
import { cancelSoundPeaks, isPeaksAvailable, isPeaksCancelled, PEAKS_CANCELLED, soundPeaks, type SoundPeaksRequest } from "../index";

const link = (m: unknown) => jest.mocked(requireOptionalNativeModule).mockReturnValue(m as never);
const request: SoundPeaksRequest = { jobId: "j", uri: "file:///music.m4a", from: 2, to: 12, count: 200 };

beforeEach(() => jest.clearAllMocks());

test("the calls go to the module with the request as it is", async () => {
  const native = { soundPeaks: jest.fn(async () => ({ peaks: [0, 0.5, 1], from: 2, to: 12 })), cancelSoundPeaks: jest.fn() };
  link(native);
  expect(isPeaksAvailable()).toBe(true);
  expect(await soundPeaks(request)).toEqual({ peaks: [0, 0.5, 1], from: 2, to: 12 });
  expect(native.soundPeaks).toHaveBeenCalledWith(request);
  cancelSoundPeaks("j");
  expect(native.cancelSoundPeaks).toHaveBeenCalledWith("j");
});

test("Expo Go (no module) and an older build (no function): not available, and a call says so instead of crashing", () => {
  link(null);
  expect(isPeaksAvailable()).toBe(false);
  expect(() => soundPeaks(request)).toThrow(/not linked/);
  link({ hello: () => "x", renderSteady: jest.fn(), blurAndCuts: () => true });      // the build of 2026-10-11
  expect(isPeaksAvailable()).toBe(false);
  expect(() => soundPeaks(request)).toThrow("This build of the app cannot do that yet. Install the latest Clipy build.");
  expect(() => cancelSoundPeaks("j")).toThrow("This build of the app cannot do that yet. Install the latest Clipy build.");
});

test("a cancelled waveform is told apart by its code", () => {
  expect(PEAKS_CANCELLED).toBe("E_PEAKS_CANCELLED");
  expect(isPeaksCancelled(Object.assign(new Error("Peaks cancelled"), { code: "E_PEAKS_CANCELLED" }))).toBe(true);
  expect(isPeaksCancelled(new Error("peaks reader: boom"))).toBe(false);
  expect(isPeaksCancelled(null)).toBe(false);
});
