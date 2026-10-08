jest.mock("expo-modules-core", () => {
  const actual = jest.requireActual("expo-modules-core");
  return { ...actual, requireOptionalNativeModule: jest.fn() };
});
import { requireOptionalNativeModule } from "expo-modules-core";
import { addSteadyListener, cancelSteady, isSteadyAvailable, isSteadyCancelled, measureShake, renderSteady, STEADY_CANCELLED, type ShakeRequest, type SteadyRequest } from "../index";

const link = (m: unknown) => jest.mocked(requireOptionalNativeModule).mockReturnValue(m as never);
const shake: ShakeRequest = { jobId: "j", sourceUri: "file:///a.mov", from: 2, to: 12, minFrameGap: 0.008, measureSide: 512 };
const steady: SteadyRequest = { jobId: "j", sourceUri: "file:///a.mov", outputPath: "file:///out.mov", from: 2, to: 12, maxSide: 1920, minFrameGap: 0.008, grid: 60, zoom: 1.1, times: [2], dx: [0], dy: [0], bitRate: 7000000, blendFloor: 0.02 };

beforeEach(() => jest.clearAllMocks());

test("the calls go to the module with the request as it is", async () => {
  const native = {
    measureShake: jest.fn(async () => ({ times: [2], dx: [0], dy: [0], frames: 1, failed: 0 })),
    renderSteady: jest.fn(async () => ({ fileUri: "file:///out.mov", seconds: 12, frames: 600 })),
    cancelSteady: jest.fn(), addListener: jest.fn(() => ({ remove: jest.fn() })),
  };
  link(native);
  expect(isSteadyAvailable()).toBe(true);
  expect(await measureShake(shake)).toEqual({ times: [2], dx: [0], dy: [0], frames: 1, failed: 0 });
  expect(native.measureShake).toHaveBeenCalledWith(shake);
  expect(await renderSteady(steady)).toEqual({ fileUri: "file:///out.mov", seconds: 12, frames: 600 });
  expect(native.renderSteady).toHaveBeenCalledWith(steady);
  cancelSteady("j");
  expect(native.cancelSteady).toHaveBeenCalledWith("j");
  const cb = jest.fn();
  addSteadyListener(cb);
  expect(native.addListener).toHaveBeenCalledWith("onSteadyEvent", cb);
});

test("Expo Go (no module) and an older build (no function): not available, and a call says so instead of crashing", () => {
  link(null);
  expect(isSteadyAvailable()).toBe(false);
  expect(() => renderSteady(steady)).toThrow(/not linked/);
  link({ hello: () => "x", renderCutout: jest.fn() });                 // the build of 2026-10-09
  expect(isSteadyAvailable()).toBe(false);
  expect(() => measureShake(shake)).toThrow("This build of the app cannot do that yet. Install the latest Clipy build.");
  expect(() => renderSteady(steady)).toThrow("This build of the app cannot do that yet. Install the latest Clipy build.");
  expect(() => cancelSteady("j")).toThrow("This build of the app cannot do that yet. Install the latest Clipy build.");
});

test("a cancelled render is told apart by its code", () => {
  expect(STEADY_CANCELLED).toBe("E_STEADY_CANCELLED");
  expect(isSteadyCancelled(Object.assign(new Error("Steady cancelled"), { code: "E_STEADY_CANCELLED" }))).toBe(true);
  expect(isSteadyCancelled(new Error("steady writer: boom"))).toBe(false);
  expect(isSteadyCancelled(null)).toBe(false);
});
