jest.mock("expo-modules-core", () => {
  const actual = jest.requireActual("expo-modules-core");
  const native = {
    hello: () => "mock hello", exportTimeline: jest.fn(), cancelExport: jest.fn(), addListener: jest.fn(() => ({ remove: jest.fn() })),
    transcribe: jest.fn(async () => [{ text: "hi", start: 0, end: 1 }]), cancelTranscribe: jest.fn(),
  };
  return {
    ...actual,
    requireOptionalNativeModule: jest.fn((name: string) => (name === "ClipyVideo" ? native : actual.requireOptionalNativeModule(name))),
  };
});

import { requireOptionalNativeModule } from "expo-modules-core";
import { makeClip, makePhotoClip } from "@/src/editor/model/types";
import { addExportListener, cancelExport, cancelTranscribe, exportTimeline, hello, isNativeAvailable, toExportClip, transcribe } from "../index";

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
    const req = {
      clips: [{ sourceUri: "file:///a.mov", trimStart: 0, trimEnd: 2, volume: 1, muted: false, speed: 1, filter: null, transition: { type: "none", duration: 0 },
        kind: "video" as const, sourceWidth: 1080, sourceHeight: 1920,
        transform: { scale: 1, x: 0, y: 0, rotation: 0, flipH: false, flipV: false }, crop: { x: 0, y: 0, w: 1, h: 1 },
        background: { type: "black" as const, color: null }, reversed: false }],
      overlays: [{
        kind: "text" as const, text: "Hi", fontPostScriptName: "Anton-Regular", fontScale: 0.07, color: "#fff",
        backgroundColor: null, backgroundOpacity: 0, outline: true, align: "center" as const, emoji: null, shape: null,
        x: 0.5, y: 0.5, scale: 1, rotation: 0, start: 0, end: 2,
      }],
      audio: null, aspectRatio: "9:16" as const, resolution: 1080 as const, outputPath: "/tmp/out.mp4",
    };
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

describe("transcribe API", () => {
  it("transcribe forwards the trim range and returns segments", async () => {
    const native = jest.mocked(requireOptionalNativeModule)("ClipyVideo") as unknown as { transcribe: jest.Mock; cancelTranscribe: jest.Mock };
    await expect(transcribe("file:///a.mov", 1, 3)).resolves.toEqual([{ text: "hi", start: 0, end: 1 }]);
    expect(native.transcribe).toHaveBeenCalledWith("file:///a.mov", 1, 3);
    cancelTranscribe();
    expect(native.cancelTranscribe).toHaveBeenCalled();
  });
});

describe("toExportClip", () => {
  const base = { sourceUri: "file:///media/a.mp4", trimStart: 0, trimEnd: 4, volume: 1, muted: false, speed: 1, filter: null, transition: { type: "none", duration: 0 } };
  it("maps a default video clip", () => {
    expect(toExportClip(makeClip({ id: "a", sourceDuration: 4 }))).toEqual({
      ...base, kind: "video", sourceWidth: 1080, sourceHeight: 1920,
      transform: { scale: 1, x: 0, y: 0, rotation: 0, flipH: false, flipV: false }, crop: { x: 0, y: 0, w: 1, h: 1 },
      background: { type: "black", color: null }, reversed: false,
    });
  });
  it("maps transform, crop and a colour background", () => {
    const e = toExportClip(makeClip({
      id: "a", sourceDuration: 4, width: 1920, height: 1080,
      transform: { scale: 1.5, x: 0.1, y: -0.2, rotation: 90, flipH: true, flipV: false },
      crop: { x: 0.1, y: 0.2, w: 0.5, h: 0.6 }, background: { type: "color", color: "#FF2D7A" },
    }));
    expect(e).toMatchObject({
      sourceWidth: 1920, sourceHeight: 1080,
      transform: { scale: 1.5, x: 0.1, y: -0.2, rotation: 90, flipH: true, flipV: false },
      crop: { x: 0.1, y: 0.2, w: 0.5, h: 0.6 }, background: { type: "color", color: "#FF2D7A" },
    });
  });
  it("maps a blur background with a null colour", () => {
    expect(toExportClip(makeClip({ id: "a", sourceDuration: 4, background: { type: "blur" } })).background).toEqual({ type: "blur", color: null });
  });
  it("maps a reversed clip", () => {
    expect(toExportClip(makeClip({ id: "a", sourceDuration: 4, reversed: true })).reversed).toBe(true);
  });
  it("maps a photo", () => {
    const e = toExportClip(makePhotoClip({ id: "p", seconds: 3 }));
    expect(e).toMatchObject({ kind: "photo", sourceUri: "file:///media/p.jpg", trimStart: 0, trimEnd: 3, speed: 1, muted: true, reversed: false });
  });
  it("sends fresh copies, not references into the project", () => {
    const c = makeClip({ id: "a", sourceDuration: 4 });
    const e = toExportClip(c);
    expect(e.transform).not.toBe(c.transform);
    expect(e.crop).not.toBe(c.crop);
    expect(e.transition).not.toBe(c.transitionOut);
    expect(e.background).not.toBe(c.background);
  });
});
