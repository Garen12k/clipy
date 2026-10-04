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
import { resolveClipMotion, sampleKeyframes } from "@/src/editor/model/motion";
import { curveSteps, outputOffsetOf } from "@/src/editor/model/timeline";
import { DEFAULT_ADJUST, makeAudioTrack, makeClip, makeEffect, makeKeyframe, makeOverlay, makePhotoClip, makeProject, makeSticker } from "@/src/editor/model/types";
import { addExportListener, cancelExport, cancelTranscribe, exportTimeline, hello, isNativeAvailable, toExportAudioTrack, toExportClip, toExportEffect, toExportOverlay, transcribe } from "../index";

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
        animIn: null, animOut: null, animCombo: null, keyframes: [], speedSpans: [], gain: [{ time: 0, gain: 1 }, { time: 2, gain: 1 }] }],
      effects: [{ type: "glitch", start: 0, end: 1, intensity: 0.7 }],
      overlays: [{
        kind: "text" as const, text: "Hi", fontPostScriptName: "Anton-Regular", fontScale: 0.07, color: "#fff",
        backgroundColor: null, backgroundOpacity: 0, outline: true, align: "center" as const, emoji: null, shape: null,
        x: 0.5, y: 0.5, scale: 1, rotation: 0, start: 0, end: 2,
        animIn: null, animOut: null, animLoop: null, keyframes: [],
        style: { opacity: 1, letterSpacing: 0, lineSpacing: 1, outlineColor: null, outlineWidth: 1, shadowColor: null, shadowOpacity: 0, shadowDistance: 0, shadowBlur: 0, glowColor: null, glowSize: 0 },
        words: [], highlightColor: null,
      }],
      audioTracks: [{ sourceUri: "file:///m.m4a", start: 0, trimStart: 0, trimEnd: 2, gain: [{ time: 0, gain: 1 }, { time: 2, gain: 1 }] }], aspectRatio: "9:16" as const, resolution: 1080 as const, outputPath: "/tmp/out.mp4",
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
      gain: [{ time: 0, gain: 1 }, { time: 4, gain: 1 }],
    });
  });
  describe("gain", () => {
    it("sends the clip's own-sound gain curve in clip-local output seconds: fades at speed 2", () => {
      const e = toExportClip(makeClip({ id: "a", sourceDuration: 10, trimStart: 1, trimEnd: 9, speed: 2, volume: 1.5, fadeIn: 1, fadeOut: 2 }));
      expect(e.gain).toEqual([{ time: 0, gain: 0 }, { time: 1, gain: 1.5 }, { time: 2, gain: 1.5 }, { time: 4, gain: 0 }]);
      expect(e).toMatchObject({ volume: 1.5, muted: false });
    });
    it("sends a flat 0 curve for a muted clip and for a photo", () => {
      expect(toExportClip(makeClip({ id: "a", sourceDuration: 4, volume: 1.5, muted: true, fadeIn: 1 })).gain).toEqual([{ time: 0, gain: 0 }, { time: 4, gain: 0 }]);
      expect(toExportClip(makePhotoClip({ id: "p", seconds: 3 })).gain).toEqual([{ time: 0, gain: 0 }, { time: 3, gain: 0 }]);
    });
    it("covers a curved clip's output length", () => {
      const c = makeClip({ id: "a", sourceDuration: 8, volume: 0.5 });
      const curved = { ...c, speedCurve: { id: "flashIn" as const, steps: curveSteps("flashIn", c.trimStart, c.trimEnd) } };
      const e = toExportClip(curved);
      const length = e.speedSpans.reduce((sum, x) => sum + x.duration / x.speed, 0);
      expect(e.gain.map((b) => b.gain)).toEqual([0.5, 0.5]);
      expect(e.gain[0].time).toBe(0);
      expect(e.gain[1].time).toBeCloseTo(length, 4);
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
    it("treats a curve with no steps as constant speed: no spans", () => {
      const c = makeClip({ id: "a", sourceDuration: 4 });
      expect(toExportClip({ ...c, speedCurve: { id: "hero", steps: [] } }).speedSpans).toEqual([]);
    });
    it("keyframes on a curved clip: the preview shows what the exported pins give at that output time", () => {
      const pins = [makeKeyframe({ t: 0, x: 0 }), makeKeyframe({ t: 8, x: 1 })];
      const base = makeClip({ id: "b", sourceDuration: 8, keyframes: pins });
      const bullet = { ...base, speedCurve: { id: "bullet" as const, steps: curveSteps("bullet", 0, 8) } };
      for (const c of [bullet, { ...bullet, reversed: true }, { ...bullet, trimStart: 1.5, trimEnd: 6.5 }]) {
        const exported = toExportClip(c).keyframes;
        for (const source of [2, 3, 4.25, 6]) {
          const offset = outputOffsetOf(c, source);
          const want = sampleKeyframes(exported, offset)!;
          const got = resolveClipMotion(c, offset);
          expect({ x: got.transform.x, y: got.transform.y, scale: got.transform.scale, rotation: got.transform.rotation, opacity: got.opacity }).toEqual(want);
        }
      }
      // Bullet, forward, source 3 s: far from the 37.5 % a source-time ease would give.
      expect(resolveClipMotion(bullet, outputOffsetOf(bullet, 3)).transform.x).not.toBeCloseTo(sampleKeyframes(pins, 3)!.x, 2);
    });
    it("sends only the spans inside the trim", () => {
      const e = toExportClip({ ...flashIn(), trimStart: 2.5, trimEnd: 4 });
      expect(e.speedSpans).toEqual([{ duration: 0.5, speed: 2 }, { duration: 1, speed: 1.5 }]);
    });
  });
});

describe("toExportOverlay", () => {
  /** The neutral style as the native record has it: shadow / glow flattened, a null colour = off. */
  const neutral = { opacity: 1, letterSpacing: 0, lineSpacing: 1, outlineColor: null, outlineWidth: 1, shadowColor: null, shadowOpacity: 0, shadowDistance: 0, shadowBlur: 0, glowColor: null, glowSize: 0 };
  it("maps a default text overlay, whole", () => {
    expect(toExportOverlay(makeOverlay({ id: "o", fontId: "anton" }))).toEqual({
      kind: "text", text: "Your text", fontPostScriptName: "Anton-Regular", fontScale: 0.07, color: "#F4F4F5",
      backgroundColor: null, backgroundOpacity: 0, outline: true, align: "center", emoji: null, shape: null,
      x: 0.5, y: 0.5, scale: 1, rotation: 0, start: 0, end: 3,
      animIn: null, animOut: null, animLoop: null, keyframes: [],
      style: neutral, words: [], highlightColor: null,
    });
  });
  it("maps a default sticker, whole", () => {
    expect(toExportOverlay(makeSticker({ id: "s" }))).toEqual({
      kind: "sticker", text: "", fontPostScriptName: "", fontScale: 0, color: "#F5C542",
      backgroundColor: null, backgroundOpacity: 0, outline: false, align: "center", emoji: "⭐", shape: null,
      x: 0.5, y: 0.5, scale: 1, rotation: 0, start: 0, end: 3,
      animIn: null, animOut: null, animLoop: null, keyframes: [],
      style: neutral, words: [], highlightColor: null,
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
  it("maps a styled text, whole: shadow and glow flattened", () => {
    const style = { opacity: 0.8, letterSpacing: 0.1, lineSpacing: 1.5, outlineColor: "#FF2D7A", outlineWidth: 2,
      shadow: { color: "#101010", opacity: 0.6, distance: 0.06, blur: 0.1 }, glow: { color: "#00E5FF", size: 0.25 } };
    const o = makeOverlay({ id: "o", fontId: "anton", style, words: [{ text: "Your", start: 0, end: 1 }], highlightColor: "#FFE600" });
    const e = toExportOverlay(o);
    expect(e).toEqual({
      kind: "text", text: "Your text", fontPostScriptName: "Anton-Regular", fontScale: 0.07, color: "#F4F4F5",
      backgroundColor: null, backgroundOpacity: 0, outline: true, align: "center", emoji: null, shape: null,
      x: 0.5, y: 0.5, scale: 1, rotation: 0, start: 0, end: 3,
      animIn: null, animOut: null, animLoop: null, keyframes: [],
      style: { opacity: 0.8, letterSpacing: 0.1, lineSpacing: 1.5, outlineColor: "#FF2D7A", outlineWidth: 2,
        shadowColor: "#101010", shadowOpacity: 0.6, shadowDistance: 0.06, shadowBlur: 0.1, glowColor: "#00E5FF", glowSize: 0.25 },
      words: [], highlightColor: null,   // a plain text never sends words or a highlight
    });
  });
  it("maps a shadow without a glow and a glow without a shadow", () => {
    const base = makeOverlay({ id: "o", fontId: "anton" }).style;
    const shadowOnly = toExportOverlay(makeOverlay({ id: "o", fontId: "anton", style: { ...base, shadow: { color: "#000000", opacity: 0.5, distance: 0.1, blur: 0.2 } } }));
    expect(shadowOnly.style).toEqual({ ...neutral, shadowColor: "#000000", shadowOpacity: 0.5, shadowDistance: 0.1, shadowBlur: 0.2 });
    const glowOnly = toExportOverlay(makeOverlay({ id: "o", fontId: "anton", style: { ...base, glow: { color: "#FFFFFF", size: 0.3 } } }));
    expect(glowOnly.style).toEqual({ ...neutral, glowColor: "#FFFFFF", glowSize: 0.3 });
  });
  it("maps a caption with words and a highlight, whole, as fresh copies", () => {
    const words = [{ text: "Hello", start: 0, end: 0.4 }, { text: "there", start: 0.5, end: 1 }];
    const o = makeOverlay({ id: "c", kind: "caption", fontId: "anton", text: "Hello there", start: 2, end: 3, y: 0.8, words, highlightColor: "#FFE600" });
    const e = toExportOverlay(o);
    expect(e).toEqual({
      kind: "caption", text: "Hello there", fontPostScriptName: "Anton-Regular", fontScale: 0.07, color: "#F4F4F5",
      backgroundColor: null, backgroundOpacity: 0, outline: true, align: "center", emoji: null, shape: null,
      x: 0.5, y: 0.8, scale: 1, rotation: 0, start: 2, end: 3,
      animIn: null, animOut: null, animLoop: null, keyframes: [],
      style: neutral, words: [{ text: "Hello", start: 0, end: 0.4 }, { text: "there", start: 0.5, end: 1 }], highlightColor: "#FFE600",
    });
    expect(e.words).not.toBe(words);
    expect(e.words[0]).not.toBe(words[0]);
  });
});

describe("toExportAudioTrack", () => {
  const music = makeAudioTrack({ id: "m", sourceDuration: 30, start: 1, trimStart: 2, trimEnd: 12, volume: 0.8, fadeIn: 2, fadeOut: 1 });   // 1 … 11
  it("maps a track inside the video whole: source range as stored, gain curve in composition seconds", () => {
    expect(toExportAudioTrack(makeProject({ audioTracks: [music] }), music, 20)).toEqual({
      sourceUri: "file:///media/m.m4a", start: 1, trimStart: 2, trimEnd: 12,
      gain: [{ time: 1, gain: 0 }, { time: 3, gain: 0.8 }, { time: 10, gain: 0.8 }, { time: 11, gain: 0 }],
    });
  });
  it("clips a track that runs past the end: trimEnd reduced, the curve cut with an interpolated last breakpoint", () => {
    const e = toExportAudioTrack(makeProject({ audioTracks: [music] }), music, 10.5)!;
    expect(e).toMatchObject({ start: 1, trimStart: 2, trimEnd: 11.5 });
    expect(e.gain.map((b) => b.time)).toEqual([1, 3, 10, 10.5]);
    expect(e.gain[3].gain).toBeCloseTo(0.4, 9);
  });
  it("clips a track that starts before 0", () => {
    const sfx = makeAudioTrack({ id: "s", sourceDuration: 5, kind: "sfx", start: -2 });
    expect(toExportAudioTrack(makeProject({ audioTracks: [sfx] }), sfx, 20)).toEqual({
      sourceUri: "file:///media/s.m4a", start: 0, trimStart: 2, trimEnd: 5, gain: [{ time: 0, gain: 1 }, { time: 3, gain: 1 }],
    });
  });
  it("is null for a track outside the video or with no length", () => {
    const late = makeAudioTrack({ id: "l", sourceDuration: 5, start: 10 });
    expect(toExportAudioTrack(makeProject({ audioTracks: [late] }), late, 10)).toBeNull();
    const empty = makeAudioTrack({ id: "e", sourceDuration: 5, trimStart: 2, trimEnd: 2 });
    expect(toExportAudioTrack(makeProject({ audioTracks: [empty] }), empty, 10)).toBeNull();
  });
  it("sends a fresh curve", () => {
    const a = toExportAudioTrack(makeProject({ audioTracks: [music] }), music, 20)!;
    const b = toExportAudioTrack(makeProject({ audioTracks: [music] }), music, 20)!;
    expect(a.gain).not.toBe(b.gain);
  });
});
