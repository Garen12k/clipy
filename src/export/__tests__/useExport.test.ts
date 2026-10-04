import { act, renderHook } from "@testing-library/react-native";
jest.mock("@/modules/clipy-video", () => ({
  isNativeAvailable: () => true,
  exportTimeline: jest.fn(async () => "job1"),
  addExportListener: jest.fn(() => ({ remove() {} })),
  cancelExport: jest.fn(),
  toExportOverlay: jest.requireActual("@/modules/clipy-video").toExportOverlay,
  toExportClip: jest.requireActual("@/modules/clipy-video").toExportClip,
  toExportEffect: jest.requireActual("@/modules/clipy-video").toExportEffect,
  toExportLayer: jest.requireActual("@/modules/clipy-video").toExportLayer,
  toExportAudioTrack: jest.requireActual("@/modules/clipy-video").toExportAudioTrack,
}));
jest.mock("@/src/projects/expoFs", () => ({
  expoFs: { cacheDir: "file:///cache/", freeBytes: async () => 1e12, mkdir: async () => {} },
}));
jest.mock("@/src/lib/id", () => ({ newId: () => "split-right" }));
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { exportTimeline } from "@/modules/clipy-video";
import { insertFreezeFrame, setClipReversed, setTransition, splitClipAt } from "@/src/editor/model/ops";
import { makeAudioTrack, makeClip, makeEffect, makeKeyframe, makeLayer, makeOverlay, makePhotoClip, makeProject, makeSticker } from "@/src/editor/model/types";
import { toExportLayer as toLayer } from "@/modules/clipy-video";
import { estimateBytes } from "../estimate";
import { useExport } from "../useExport";

const a = makeClip({ id: "a", sourceDuration: 4, volume: 1.5, muted: true, speed: 2, filter: "warm", transitionOut: { type: "fade", duration: 0.5 } });
const b = makeClip({ id: "b", sourceDuration: 6 }); // sourceUri file:///media/b.mp4
const c = makeClip({ id: "c", sourceDuration: 5 }); // sourceUri file:///media/c.mp4
const project = makeProject({
  id: "p1",
  clips: [a, b, c],
  overlays: [
    makeOverlay({ id: "o", text: "Hey", fontId: "anton", start: 0, end: 2 }),
    makeSticker({ id: "s", emoji: "⭐", shape: null, start: 0, end: 2 }),
  ],
  audioTracks: [makeAudioTrack({ id: "m", sourceUri: "file:///media/m.m4a", sourceDuration: 9 })],
});

beforeEach(() => jest.clearAllMocks());

test("exports only clips whose source file is present", async () => {
  const { result } = await renderHook(() => useExport(project, [c.sourceUri]));
  await act(() => result.current.start(1080));
  expect(exportTimeline).toHaveBeenCalledTimes(1);
  expect((exportTimeline as jest.Mock).mock.calls[0][0]).toEqual(
    expect.objectContaining({
      overlays: [
        expect.objectContaining({ kind: "text", text: "Hey", fontPostScriptName: "Anton-Regular", x: 0.5 }),
        expect.objectContaining({ kind: "sticker", emoji: "⭐", shape: null }),
      ],
      // 9 s of music in an 8 s video: cut at the end, with the safety fade over its last second
      audioTracks: [{ sourceUri: "file:///media/m.m4a", start: 0, trimStart: 0, trimEnd: 8, gain: [{ time: 0, gain: 1 }, { time: 7, gain: 1 }, { time: 8, gain: 0 }] }],
      clips: [
        expect.objectContaining({ volume: 1.5, muted: true, speed: 2, filter: "warm", transition: { type: "fade", duration: 0.5 }, gain: [{ time: 0, gain: 0 }, { time: 2, gain: 0 }] }),
        expect.objectContaining({ sourceUri: b.sourceUri }),
      ],
      fps: 30, bitrate: 0,
    }),
  );
  expect(result.current.state.status).toBe("exporting");
});

test("errors when every clip's source is missing", async () => {
  const { result } = await renderHook(() => useExport(project, [a.sourceUri, b.sourceUri, c.sourceUri]));
  await act(() => result.current.start(1080));
  expect(exportTimeline).not.toHaveBeenCalled();
  expect(result.current.state.status).toBe("error");
});

test("drops the audio track when its source file is missing", async () => {
  const { result } = await renderHook(() => useExport(project, [c.sourceUri, "file:///media/m.m4a"]));
  await act(() => result.current.start(1080));
  expect(exportTimeline).toHaveBeenCalledTimes(1);
  const req = (exportTimeline as jest.Mock).mock.calls[0][0];
  expect(req.audioTracks).toEqual([]);
  expect(req).not.toHaveProperty("audio");
});

test("a split, sped-up clip with transitions and a shape sticker maps into one export request", async () => {
  const fast = makeClip({ id: "f", sourceDuration: 8, speed: 2, transitionOut: { type: "slide", duration: 0.6 } });   // 4 s output
  const tail = makeClip({ id: "t", sourceDuration: 4 });
  let p = makeProject({ id: "p2", clips: [fast, tail], overlays: [makeSticker({ id: "st", emoji: null, shape: "star", color: "#FF2D7A", start: 1, end: 3 })] });
  p = splitClipAt(p, 2);                                                       // output 2 s → source 4 s
  p = setTransition(p, "f", { type: "dissolve", duration: 0.5 });
  const { result } = await renderHook(() => useExport(p, []));
  await act(() => result.current.start(1080));
  const req = (exportTimeline as jest.Mock).mock.calls[0][0];
  expect(req.clips).toEqual([
    expect.objectContaining({ sourceUri: fast.sourceUri, trimStart: 0, trimEnd: 4, speed: 2, transition: { type: "dissolve", duration: 0.5 } }),
    expect.objectContaining({ sourceUri: fast.sourceUri, trimStart: 4, trimEnd: 8, speed: 2, transition: { type: "slide", duration: 0.6 } }),
    expect.objectContaining({ sourceUri: tail.sourceUri, speed: 1, transition: { type: "none", duration: 0 } }),
  ]);
  expect(req.overlays).toEqual([expect.objectContaining({ kind: "sticker", emoji: null, shape: "star", color: "#FF2D7A", start: 1, end: 3 })]);
});

test("clears the last exported clip's transition when a trailing clip's source is missing", async () => {
  const { result } = await renderHook(() => useExport(project, [b.sourceUri, c.sourceUri]));
  await act(() => result.current.start(1080));
  expect((exportTimeline as jest.Mock).mock.calls[0][0].clips).toEqual([
    expect.objectContaining({ transition: { type: "none", duration: 0 } }),
  ]);
});

test("a photo, a reversed clip and a freeze frame are sent in order with transitions normalised", async () => {
  const photo = makePhotoClip({ id: "ph", seconds: 3, transitionOut: { type: "fade", duration: 0.5 } });
  const vid = makeClip({ id: "v", sourceDuration: 6, transitionOut: { type: "slide", duration: 0.5 } });
  let p = makeProject({ id: "p3", clips: [photo, vid] });
  p = setClipReversed(p, "v", true);
  p = insertFreezeFrame(p, 4, { id: "still", sourceUri: "file:///media/still.jpg", width: 1080, height: 1920 });
  const { result } = await renderHook(() => useExport(p, []));
  await act(() => result.current.start(1080));
  const req = (exportTimeline as jest.Mock).mock.calls[0][0];
  expect(req.clips.map((c: { kind: string; reversed: boolean; sourceUri: string }) => [c.kind, c.reversed, c.sourceUri])).toEqual([
    ["photo", false, photo.sourceUri],
    ["video", true, vid.sourceUri],
    ["photo", false, "file:///media/still.jpg"],
    ["video", true, vid.sourceUri],
  ]);
  expect(req.clips[0]).toMatchObject({ muted: true, speed: 1, sourceWidth: 1080, sourceHeight: 1920, background: { type: "black", color: null } });
  expect(req.clips[3].transition).toEqual({ type: "none", duration: 0 });
});

test("sends timeline effects in order, clipped to the exported duration, dropping ones outside", async () => {
  const p = makeProject({
    id: "p4", clips: [makeClip({ id: "x", sourceDuration: 4 })],   // exports 4 s
    effects: [
      makeEffect({ id: "e1", type: "glitch", start: 0.5, end: 1.5, intensity: 0.3 }),
      makeEffect({ id: "e2", type: "vhs", start: 3, end: 6, intensity: 0.8 }),
      makeEffect({ id: "e3", type: "blur", start: 4.5, end: 6 }),
      makeEffect({ id: "e4", type: "flash", start: 3.97, end: 5 }),
    ],
  });
  const { result } = await renderHook(() => useExport(p, []));
  await act(() => result.current.start(1080));
  expect((exportTimeline as jest.Mock).mock.calls[0][0].effects).toEqual([
    { type: "glitch", start: 0.5, end: 1.5, intensity: 0.3, rect: null },
    { type: "vhs", start: 3, end: 4, intensity: 0.8, rect: null },
  ]);
});

test("sends a region effect's rectangle and a layer's blend and green-screen key", async () => {
  const p = makeProject({
    id: "p6", clips: [makeClip({ id: "x", sourceDuration: 4 })],
    effects: [makeEffect({ id: "b", type: "mosaicBox", start: 0, end: 2, rect: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 } })],
    layers: [makeLayer({ id: "l", sourceDuration: 4, start: 0, blend: "multiply", chroma: { color: "#00ff00", strength: 0.5 } })],
  });
  const { result } = await renderHook(() => useExport(p, []));
  await act(() => result.current.start(1080));
  const req = (exportTimeline as jest.Mock).mock.calls[0][0];
  expect(req.effects[0].rect).toEqual({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 });
  expect(req.layers[0]).toMatchObject({ blend: "multiply", chroma: { color: "#00ff00", strength: 0.5 } });
  expect(req.clips[0]).toMatchObject({ blend: "normal", chroma: null });
});

test("effects clip to the clips actually exported, and a project with none sends []", async () => {
  const p = makeProject({
    id: "p5", clips: [makeClip({ id: "x", sourceDuration: 4 }), makeClip({ id: "y", sourceDuration: 6 })],
    effects: [makeEffect({ id: "e", type: "glow", start: 3, end: 8 })],
  });
  const { result } = await renderHook(() => useExport(p, ["file:///media/y.mp4"]));
  await act(() => result.current.start(1080));
  expect((exportTimeline as jest.Mock).mock.calls[0][0].effects).toEqual([{ type: "glow", start: 3, end: 4, intensity: 0.7, rect: null }]);
  jest.clearAllMocks();
  const { result: r2 } = await renderHook(() => useExport(project, []));
  await act(() => r2.current.start(1080));
  expect((exportTimeline as jest.Mock).mock.calls[0][0].effects).toEqual([]);
});

test("clip and overlay motion reaches the export request", async () => {
  const clip = makeClip({ id: "m", sourceDuration: 8, speed: 2, keyframes: [makeKeyframe({ t: 2, x: 0.2 })], animation: { in: { id: "fade", duration: 0.5 }, out: null, combo: null } });
  const st = makeSticker({ id: "ms", start: 0, end: 2, animation: { in: null, out: null, loop: "wiggle" }, keyframes: [makeKeyframe({ t: 1, scale: 2 })] });
  const { result } = await renderHook(() => useExport(makeProject({ id: "p9", clips: [clip], overlays: [st] }), []));
  await act(() => result.current.start(1080));
  const req = (exportTimeline as jest.Mock).mock.calls[0][0];
  expect(req.clips[0]).toMatchObject({ animIn: { id: "fade", duration: 0.5 }, keyframes: [makeKeyframe({ t: 1, x: 0.2 })] });
  expect(req.clips[0]).not.toHaveProperty("outputDuration");
  expect(req.overlays[0]).toMatchObject({ animLoop: "wiggle", keyframes: [makeKeyframe({ t: 1, scale: 2 })] });
});

describe("audio in the export request", () => {
  const clip = makeClip({ id: "x", sourceDuration: 10 });   // a 10 s video
  const request = async (p: ReturnType<typeof makeProject>, missing: string[] = []) => {
    const { result } = await renderHook(() => useExport(p, missing));
    await act(() => result.current.start(1080));
    return (exportTimeline as jest.Mock).mock.calls[0][0];
  };
  test("one plain music track: a flat curve, nothing else changed", async () => {
    const m = makeAudioTrack({ id: "m", sourceDuration: 30, start: 1, trimStart: 2, trimEnd: 6, volume: 0.6 });
    const req = await request(makeProject({ id: "a1", clips: [clip], audioTracks: [m] }));
    expect(req.audioTracks).toEqual([{ sourceUri: m.sourceUri, start: 1, trimStart: 2, trimEnd: 6, gain: [{ time: 1, gain: 0.6 }, { time: 5, gain: 0.6 }] }]);
    expect(req).not.toHaveProperty("audio");
  });
  test("fades become breakpoints", async () => {
    const m = makeAudioTrack({ id: "m", sourceDuration: 30, start: 1, trimEnd: 8, fadeIn: 2, fadeOut: 1 });
    const req = await request(makeProject({ id: "a2", clips: [clip], audioTracks: [m] }));
    expect(req.audioTracks[0].gain).toEqual([{ time: 1, gain: 0 }, { time: 3, gain: 1 }, { time: 8, gain: 1 }, { time: 9, gain: 0 }]);
  });
  test("every track is sent, in order; music is ducked under the voice", async () => {
    const m = makeAudioTrack({ id: "m", sourceDuration: 30, trimEnd: 9 });
    const v = makeAudioTrack({ id: "v", sourceDuration: 2, kind: "voice", start: 5 });
    const s = makeAudioTrack({ id: "s", sourceDuration: 0.5, kind: "sfx", start: 2, volume: 2 });
    const req = await request(makeProject({ id: "a3", clips: [clip], audioTracks: [m, v, s], ducking: true }));
    expect(req.audioTracks.map((t: { sourceUri: string }) => t.sourceUri)).toEqual([m.sourceUri, v.sourceUri, s.sourceUri]);
    const music = req.audioTracks[0].gain as { time: number; gain: number }[];
    expect(music.map((b) => b.time)).toEqual([0, 4.7, 5, 7, 7.3, 9]);
    [1, 1, 0.3, 0.3, 1, 1].forEach((g, i) => expect(music[i].gain).toBeCloseTo(g, 9));
    expect(req.audioTracks[1]).toEqual({ sourceUri: v.sourceUri, start: 5, trimStart: 0, trimEnd: 2, gain: [{ time: 5, gain: 1 }, { time: 7, gain: 1 }] });
    expect(req.audioTracks[2].gain).toEqual([{ time: 2, gain: 2 }, { time: 2.5, gain: 2 }]);
  });
  test("a track running past the end is clipped to the exported duration; one wholly after it is dropped", async () => {
    const v = makeAudioTrack({ id: "v", sourceDuration: 30, kind: "voice", start: 6, trimStart: 1, trimEnd: 9, fadeOut: 2 });   // 6 … 14, fading 12 … 14
    const late = makeAudioTrack({ id: "l", sourceDuration: 3, kind: "sfx", start: 10 });
    const req = await request(makeProject({ id: "a4", clips: [clip], audioTracks: [v, late] }));
    expect(req.audioTracks).toEqual([{ sourceUri: v.sourceUri, start: 6, trimStart: 1, trimEnd: 5, gain: [{ time: 6, gain: 1 }, { time: 10, gain: 1 }] }]);
  });
  test("a track whose file is missing is left out, and a missing voice does not duck the music", async () => {
    const m = makeAudioTrack({ id: "m", sourceDuration: 30, trimEnd: 9 });
    const v = makeAudioTrack({ id: "v", sourceDuration: 2, kind: "voice", start: 5 });
    const req = await request(makeProject({ id: "a5", clips: [clip], audioTracks: [m, v], ducking: true }), [v.sourceUri]);
    expect(req.audioTracks).toEqual([{ sourceUri: m.sourceUri, start: 0, trimStart: 0, trimEnd: 9, gain: [{ time: 0, gain: 1 }, { time: 9, gain: 1 }] }]);
  });
  test("a muted clip sends a flat 0 curve; a clip with fades at speed 2 sends them in output seconds", async () => {
    const muted = makeClip({ id: "q", sourceDuration: 4, muted: true, volume: 1.5 });
    const faded = makeClip({ id: "f", sourceDuration: 10, trimStart: 1, trimEnd: 9, speed: 2, volume: 1.5, fadeIn: 1, fadeOut: 2 });
    const req = await request(makeProject({ id: "a6", clips: [muted, faded] }));
    expect(req.clips[0].gain).toEqual([{ time: 0, gain: 0 }, { time: 4, gain: 0 }]);
    expect(req.clips[1].gain).toEqual([{ time: 0, gain: 0 }, { time: 1, gain: 1.5 }, { time: 2, gain: 1.5 }, { time: 4, gain: 0 }]);
    expect(req.audioTracks).toEqual([]);
  });
});

describe("layers", () => {
  const run = async (p: ReturnType<typeof makeProject>, missing: string[] = []) => {
    const { result } = await renderHook(() => useExport(p, missing));
    await act(() => result.current.start(1080));
    return (exportTimeline as jest.Mock).mock.calls[0][0];
  };
  const main = makeClip({ id: "x", sourceDuration: 4 });   // exports 4 s

  test("a project without layers sends []", async () => {
    expect((await run(makeProject({ id: "pl0", clips: [main] }))).layers).toEqual([]);
  });
  test("sends layers in order with their start, whole even when running past the end", async () => {
    const l1 = makeLayer({ id: "l1", sourceDuration: 2, start: 1 });
    const l2 = makeLayer({ id: "l2", sourceDuration: 9, start: 3, opacity: 0.5, mask: "circle" });
    const req = await run(makeProject({ id: "pl1", clips: [main], layers: [l1, l2] }));
    expect(req.layers).toEqual([toLayer(l1), toLayer(l2)]);
    expect(req.layers.map((l: { start: number }) => l.start)).toEqual([1, 3]);
    expect(req.layers[1]).toMatchObject({ opacity: 0.5, mask: "circle", transition: { type: "none", duration: 0 }, background: { type: "black", color: null } });
  });
  test("drops layers with a missing source and layers starting at or after the end (within 0.05 s)", async () => {
    const gone = makeLayer({ id: "gone", sourceDuration: 2, start: 0 });
    const late = makeLayer({ id: "late", sourceDuration: 2, start: 4 });
    const nearly = makeLayer({ id: "nearly", sourceDuration: 2, start: 3.97 });
    const ok = makeLayer({ id: "ok", sourceDuration: 2, start: 3.9 });
    const req = await run(makeProject({ id: "pl2", clips: [main], layers: [gone, late, nearly, ok] }), [gone.sourceUri]);
    expect(req.layers.map((l: { sourceUri: string }) => l.sourceUri)).toEqual([ok.sourceUri]);
  });
  test("the exported duration is the exportable clips (a missing main clip shortens it)", async () => {
    const y = makeClip({ id: "y", sourceDuration: 6 });
    const l = makeLayer({ id: "l", sourceDuration: 2, start: 5 });
    const req = await run(makeProject({ id: "pl3", clips: [main, y], layers: [l] }), [y.sourceUri]);
    expect(req.layers).toEqual([]);
  });
  test("a keyframed, masked, half-opaque layer keeps its motion in layer-local output time", async () => {
    const l = makeLayer({ id: "k", sourceDuration: 4, start: 1, opacity: 0.5, mask: "rounded", keyframes: [makeKeyframe({ t: 0, x: 0.1 }), makeKeyframe({ t: 2, x: 0.3, opacity: 0.2 })] });
    const req = await run(makeProject({ id: "pl4", clips: [main], layers: [l] }));
    expect(req.layers[0]).toEqual(toLayer(l));
    expect(req.layers[0].keyframes.map((k: { t: number }) => k.t)).toEqual([0, 2]);
  });
});

describe("export options in the request", () => {
  const main = makeClip({ id: "x", sourceDuration: 4 });
  const run = async (p: ReturnType<typeof makeProject>) => {
    const { result } = await renderHook(() => useExport(p, []));
    await act(() => result.current.start(1080));
    return (exportTimeline as jest.Mock).mock.calls[0][0];
  };
  test("the default export is today's request plus fps 30 and bitrate 0", async () => {
    const req = await run(makeProject({ id: "o1", clips: [main] }));
    expect(req).toMatchObject({ fps: 30, bitrate: 0, resolution: 1080, aspectRatio: "9:16" });
  });
  test("start(res) uses the project's saved settings", async () => {
    const req = await run(makeProject({ id: "o2", clips: [main], exportSettings: { fps: 60, quality: "small" } }));
    expect(req).toMatchObject({ fps: 60, bitrate: 9_000_000 });
  });
  test("explicit settings win over the project's", async () => {
    const { result } = await renderHook(() => useExport(makeProject({ id: "o3", clips: [main], exportSettings: { fps: 60, quality: "small" } }), []));
    await act(() => result.current.start(720, { fps: 24, quality: "high" }));
    expect((exportTimeline as jest.Mock).mock.calls[0][0]).toMatchObject({ fps: 24, bitrate: 0, resolution: 720 });
  });
  test("garbage settings still send finite whole numbers", async () => {
    const req = await run(makeProject({ id: "o4", clips: [main], exportSettings: { fps: NaN, quality: "small" } as never }));
    expect(req.fps).toBe(30);
    expect(Number.isInteger(req.bitrate) && req.bitrate >= 0).toBe(true);
    const { result } = await renderHook(() => useExport(makeProject({ id: "o5", clips: [main] }), []));
    jest.clearAllMocks();
    await act(() => result.current.start(1080, { fps: Infinity, quality: null } as never));
    expect((exportTimeline as jest.Mock).mock.calls[0][0]).toMatchObject({ fps: 30, bitrate: 0 });
  });
  test("the free-space check uses the settings", async () => {
    const p = makeProject({ id: "o6", clips: [main] });
    const need = estimateBytes(4, 1080, { fps: 60, quality: "high" }) * 2;
    const fs = jest.requireMock("@/src/projects/expoFs").expoFs;
    const orig = fs.freeBytes;
    fs.freeBytes = async () => need - 1;
    try {
      const { result } = await renderHook(() => useExport(p, []));
      await act(() => result.current.start(1080, { fps: 60, quality: "high" }));
      expect(exportTimeline).not.toHaveBeenCalled();
      expect(result.current.state).toMatchObject({ status: "error", message: expect.stringContaining("Not enough free space") });
    } finally { fs.freeBytes = orig; }
  });
});
