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
import { curveSteps } from "@/src/editor/model/timeline";
import { DEFAULT_ADJUST, makeClip, makeEffect, makeKeyframe, makeOverlay, makePhotoClip, makeSticker } from "@/src/editor/model/types";
import { addExportListener, cancelExport, cancelTranscribe, exportTimeline, hello, isNativeAvailable, toExportClip, toExportEffect, toExportOverlay, transcribe } from "../index";

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
        background: { type: "black" as const, color: null }, reversed: false, filterIntensity: 1, adjust: { ...DEFAULT_ADJUST },
        animIn: null, animOut: null, animCombo: null, keyframes: [], speedSpans: [] }],
      effects: [{ type: "glitch", start: 0, end: 1, intensity: 0.7 }],
      overlays: [{
        kind: "text" as const, text: "Hi", fontPostScriptName: "Anton-Regular", fontScale: 0.07, color: "#fff",
        backgroundColor: null, backgroundOpacity: 0, outline: true, align: "center" as const, emoji: null, shape: null,
        x: 0.5, y: 0.5, scale: 1, rotation: 0, start: 0, end: 2,
        animIn: null, animOut: null, animLoop: null, keyframes: [],
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
      filterIntensity: 1, adjust: { ...DEFAULT_ADJUST },
      animIn: null, animOut: null, animCombo: null, keyframes: [], speedSpans: [],
    });
  });
  it("maps filter strength and adjust values", () => {
    const adjust = { ...DEFAULT_ADJUST, brightness: 0.3, grain: 0.5, tint: -0.2 };
    const e = toExportClip(makeClip({ id: "a", sourceDuration: 4, filter: "warm", filterIntensity: 0.4, adjust }));
    expect(e.filterIntensity).toBe(0.4);
    expect(e.adjust).toEqual(adjust);
    expect(e.adjust).not.toBe(adjust);
  });
  it("maps an effect", () => {
    expect(toExportEffect(makeEffect({ id: "e", type: "glitch", start: 1, end: 2.5, intensity: 0.6 })))
      .toEqual({ type: "glitch", start: 1, end: 2.5, intensity: 0.6 });
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
    expect(e.adjust).not.toBe(c.adjust);
  });

  it("sends keyframes of a sped-up clip as output-local seconds", () => {
    const e = toExportClip(makeClip({ id: "a", sourceDuration: 8, speed: 2, keyframes: [makeKeyframe({ t: 2, x: 0.1 }), makeKeyframe({ t: 6, scale: 2 })] }));
    expect(e).not.toHaveProperty("outputDuration");   // nothing native reads it: the composition knows the clip's length
    expect(e.keyframes).toEqual([makeKeyframe({ t: 1, x: 0.1 }), makeKeyframe({ t: 3, scale: 2 })]);
  });
  it("sends a reversed clip's pins in reversed order", () => {
    const e = toExportClip(makeClip({ id: "a", sourceDuration: 4, reversed: true, keyframes: [makeKeyframe({ t: 1, x: 0.1 }), makeKeyframe({ t: 3, x: 0.3 })] }));
    expect(e.keyframes).toEqual([makeKeyframe({ t: 1, x: 0.3 }), makeKeyframe({ t: 3, x: 0.1 })]);
  });
  it("keeps the pins inside the clip plus the nearest one on each side, unclamped", () => {
    const keyframes = [0, 1, 2, 4, 6, 7, 8].map((t) => makeKeyframe({ t, x: t / 10 }));
    const e = toExportClip(makeClip({ id: "a", sourceDuration: 10, trimStart: 2, trimEnd: 6, keyframes }));
    expect(e.keyframes.map((k) => k.t)).toEqual([-1, 0, 2, 4, 5]);
    expect(e.keyframes.map((k) => k.x)).toEqual([0.1, 0.2, 0.4, 0.6, 0.7]);
  });
  it("sends clip animation edges scaled to the clip length, or null for a zero edge", () => {
    const e = toExportClip(makeClip({ id: "a", sourceDuration: 1, animation: { in: { id: "fade", duration: 1 }, out: { id: "zoomOut", duration: 1 }, combo: null } }));
    expect(e).toMatchObject({ animIn: { id: "fade", duration: 0.5 }, animOut: { id: "zoomOut", duration: 0.5 }, animCombo: null });
    const z = toExportClip(makeClip({ id: "a", sourceDuration: 4, animation: { in: { id: "fade", duration: 0 }, out: null, combo: null } }));
    expect(z.animIn).toBeNull();
    const c = toExportClip(makeClip({ id: "a", sourceDuration: 4, animation: { in: null, out: null, combo: "sway" } }));
    expect(c.animCombo).toBe("sway");
  });
  it("sends fresh keyframe and edge copies", () => {
    const c = makeClip({ id: "a", sourceDuration: 4, keyframes: [makeKeyframe({ t: 1 })], animation: { in: { id: "fade", duration: 0.5 }, out: null, combo: null } });
    const e = toExportClip(c);
    expect(e.keyframes[0]).not.toBe(c.keyframes[0]);
    expect(e.animIn).not.toBe(c.animation.in);
  });

  describe("speed spans", () => {
    const flashIn = () => {
      const c = makeClip({ id: "a", sourceDuration: 8 });
      return { ...c, speedCurve: { id: "flashIn" as const, steps: curveSteps("flashIn", c.trimStart, c.trimEnd) } };
    };
    it("sends no spans for a constant-speed clip, whatever its speed or direction", () => {
      expect(toExportClip(makeClip({ id: "a", sourceDuration: 4 })).speedSpans).toEqual([]);
      expect(toExportClip(makeClip({ id: "a", sourceDuration: 4, speed: 2, reversed: true })).speedSpans).toEqual([]);
      expect(toExportClip(makePhotoClip({ id: "p", seconds: 3 })).speedSpans).toEqual([]);
    });
    it("sends a curved clip's spans in playback order, with speed 1", () => {
      const e = toExportClip(flashIn());
      expect(e.speed).toBe(1);
      expect(e.speedSpans).toEqual([4, 3, 2, 1.5, 1, 1, 1, 1].map((speed) => ({ duration: 1, speed })));
    });
    it("sends a reversed curved clip's spans back to front", () => {
      const e = toExportClip({ ...flashIn(), reversed: true });
      expect(e.reversed).toBe(true);
      expect(e.speedSpans).toEqual([1, 1, 1, 1, 1.5, 2, 3, 4].map((speed) => ({ duration: 1, speed })));
    });
    it("sends only the spans inside the trim", () => {
      const e = toExportClip({ ...flashIn(), trimStart: 2.5, trimEnd: 4 });
      expect(e.speedSpans).toEqual([{ duration: 0.5, speed: 2 }, { duration: 1, speed: 1.5 }]);
    });
  });
});

describe("toExportOverlay", () => {
  it("maps a default text overlay, whole", () => {
    expect(toExportOverlay(makeOverlay({ id: "o", fontId: "anton" }))).toEqual({
      kind: "text", text: "Your text", fontPostScriptName: "Anton-Regular", fontScale: 0.07, color: "#F4F4F5",
      backgroundColor: null, backgroundOpacity: 0, outline: true, align: "center", emoji: null, shape: null,
      x: 0.5, y: 0.5, scale: 1, rotation: 0, start: 0, end: 3,
      animIn: null, animOut: null, animLoop: null, keyframes: [],
    });
  });
  it("maps a default sticker, whole", () => {
    expect(toExportOverlay(makeSticker({ id: "s" }))).toEqual({
      kind: "sticker", text: "", fontPostScriptName: "", fontScale: 0, color: "#F5C542",
      backgroundColor: null, backgroundOpacity: 0, outline: false, align: "center", emoji: "⭐", shape: null,
      x: 0.5, y: 0.5, scale: 1, rotation: 0, start: 0, end: 3,
      animIn: null, animOut: null, animLoop: null, keyframes: [],
    });
  });
  it("sends overlay animation scaled to its length and keyframes as stored", () => {
    const kf = [makeKeyframe({ t: 0.5, x: 0.2 }), makeKeyframe({ t: 1, opacity: 0.5 })];
    const e = toExportOverlay(makeSticker({ id: "s", start: 1, end: 2, keyframes: kf,
      animation: { in: { id: "pop", duration: 1 }, out: { id: "fade", duration: 1 }, loop: "wiggle" } }));
    expect(e).toMatchObject({ animIn: { id: "pop", duration: 0.5 }, animOut: { id: "fade", duration: 0.5 }, animLoop: "wiggle" });
    expect(e.keyframes).toEqual(kf);
    expect(e.keyframes[0]).not.toBe(kf[0]);
  });
  it("sends no motion for a caption", () => {
    const e = toExportOverlay(makeOverlay({ id: "c", kind: "caption", fontId: "anton", keyframes: [makeKeyframe({ t: 0 })],
      animation: { in: { id: "fade", duration: 0.5 }, out: null, loop: "pulse" } }));
    expect(e).toMatchObject({ animIn: null, animOut: null, animLoop: null, keyframes: [] });
  });
});
