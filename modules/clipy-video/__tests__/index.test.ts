jest.mock("expo-modules-core", () => {
  const actual = jest.requireActual("expo-modules-core");
  return {
    ...actual,
    requireOptionalNativeModule: jest.fn((name: string) =>
      name === "ClipyVideo"
        ? { hello: () => "mock hello", exportTimeline: jest.fn(), cancelExport: jest.fn(), addListener: jest.fn(() => ({ remove: jest.fn() })) }
        : actual.requireOptionalNativeModule(name),
    ),
  };
});

import { requireOptionalNativeModule } from "expo-modules-core";
import { addExportListener, cancelExport, exportTimeline, hello, isNativeAvailable } from "../index";

describe("clipy-video wrapper", () => {
  it("hello() returns the native module's greeting", () => {
    expect(hello()).toBe("mock hello");
  });

  it("throws a helpful error when the native module is not linked (e.g. Expo Go)", () => {
    jest.mocked(requireOptionalNativeModule).mockReturnValueOnce(null);
    expect(() => hello()).toThrow(/not linked/);
  });
});

describe("export API", () => {
  it("isNativeAvailable is false when the module is missing", () => {
    jest.mocked(requireOptionalNativeModule).mockReturnValueOnce(null);
    expect(isNativeAvailable()).toBe(false);
  });
  it("exportTimeline forwards the request and returns the job id; listener wraps the native event", async () => {
    const listeners: ((e: unknown) => void)[] = [];
    const native = { hello: () => "x", exportTimeline: jest.fn(async () => "job1"), cancelExport: jest.fn(),
      addListener: jest.fn((_: string, cb: (e: unknown) => void) => { listeners.push(cb); return { remove: jest.fn() }; }) };
    jest.mocked(requireOptionalNativeModule)
      .mockReturnValueOnce(native as never)
      .mockReturnValueOnce(native as never)
      .mockReturnValueOnce(native as never);
    const req = { clips: [{ sourceUri: "file:///a.mov", trimStart: 0, trimEnd: 2 }], aspectRatio: "9:16" as const, resolution: 1080 as const, outputPath: "/tmp/out.mp4" };
    await expect(exportTimeline(req)).resolves.toBe("job1");
    expect(native.exportTimeline).toHaveBeenCalledWith(req);
    const cb = jest.fn();
    addExportListener(cb);
    listeners[0]({ jobId: "job1", type: "progress", progress: 0.5 });
    expect(cb).toHaveBeenCalledWith({ jobId: "job1", type: "progress", progress: 0.5 });
    cancelExport("job1");
    expect(native.cancelExport).toHaveBeenCalledWith("job1");
  });
});
