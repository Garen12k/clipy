import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@/src/editor/components/thumbnails", () => ({ getThumb: jest.fn(async () => "file:///thumb.jpg") }));
// A fake expo-video player that models AVPlayer: assigning a non-zero playbackRate starts playback
// (expo-video's setter does `ref.rate = playbackRate` unconditionally on iOS). The native property is a Float, so
// reading it back rounds (0.3 comes back as 0.30000001…).
jest.mock("expo-video", () => {
  const { View } = require("react-native");
  let rate = 1;
  let time = 0;
  const listeners: Record<string, (e: unknown) => void> = {};
  const mockPlayer = {
    listeners,
    seeks: [] as number[], // every currentTime write, in order
    rates: [] as number[], // every playbackRate write, in order
    playing: false, loop: false, timeUpdateEventInterval: 0, muted: false, audioMixingMode: "auto", volume: 1, preservesPitch: true,
    get currentTime() { return time; },
    set currentTime(v: number) { time = v; mockPlayer.seeks.push(v); },
    get playbackRate() { return Math.fround(rate); },
    set playbackRate(v: number) { rate = v; mockPlayer.rates.push(v); if (v !== 0) mockPlayer.playing = true; },
    play: jest.fn(() => { mockPlayer.playing = true; }),
    pause: jest.fn(() => { mockPlayer.playing = false; }),
    replaceAsync: jest.fn(async () => {}),
    addListener: jest.fn((event: string, fn: (e: unknown) => void) => { listeners[event] = fn; return { remove: () => {} }; }),
  };
  return { __mockPlayer: mockPlayer, useVideoPlayer: () => mockPlayer, VideoView: View };
});
// A video layer's own player is covered by LayerStack.test.tsx; here the fake above is the main player alone, so a layer's video is
// a plain view (the shared fake would otherwise take the layer's writes as the main player's).
jest.mock("../components/LayerVideo", () => {
  const { View } = require("react-native");
  return { LayerVideo: ({ layer }: { layer: { id: string } }) => <View testID={`layer-video-${layer.id}`} /> };
});
import { replaceClipMedia, setClipAnimation, setClipMask, setClipOpacity, setClipReversed, setClipSpeed, setClipSpeedCurve, setClipTransform } from "@/src/editor/model/ops";
import { StyleSheet } from "react-native";
import { FILTERS } from "@/src/editor/effects";
import { shakeOffset } from "@/src/editor/model/effectMath";
import { DEFAULT_ADJUST, makeAudioTrack, makeClip, makeEffect, makeLayer, makeOverlay, makePhotoClip, makeProject, type Clip, type LayerClip } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { PreviewPlayer } from "../components/PreviewPlayer";

type MockPlayer = { playing: boolean; currentTime: number; playbackRate: number; seeks: number[]; rates: number[]; play: jest.Mock; pause: jest.Mock; replaceAsync: jest.Mock; listeners: Record<string, (e: unknown) => void> };
const player = (jest.requireMock("expo-video") as { __mockPlayer: MockPlayer }).__mockPlayer;
const layout = () => fireEvent(screen.getByLabelText("Preview"), "layout", { nativeEvent: { layout: { width: 270, height: 480 } } });

beforeEach(() => {
  jest.clearAllMocks();
  player.playing = false;
  player.currentTime = 0;
  player.playbackRate = 1; // as on a fresh player
  player.playing = false;
  player.seeks.length = 0;
  player.rates.length = 0;
  useEditorStore.getState().reset();
  useEditorStore.getState().setProject(makeProject({ clips: [
    makeClip({ id: "a", sourceDuration: 4, speed: 2 }),
    makeClip({ id: "b", sourceDuration: 4, sourceUri: "file:///media/a.mp4" }), // same file as a: the no-reload path
    makeClip({ id: "c", sourceDuration: 4, speed: 0.5 }),
  ] }));
});

test("scrubbing, crossing clips and changing speed while paused never leaves the player playing", async () => {
  await render(<PreviewPlayer />);
  expect(player.playing).toBe(false);
  for (const t of [0.5, 1.2, 2.5, 4, 5.9, 7, 1]) {
    await act(() => { useEditorStore.getState().seek(t); });
    expect(player.playing).toBe(false);
  }
  await act(() => { useEditorStore.getState().apply((p) => setClipSpeed(p, "a", 3)); });
  expect(player.playing).toBe(false);
  expect(player.play).not.toHaveBeenCalled();
});

test("playing still plays", async () => {
  await render(<PreviewPlayer />);
  await act(() => { useEditorStore.getState().setPlaying(true); });
  expect(player.play).toHaveBeenCalled();
  expect(player.playing).toBe(true);
});

describe("moving to another clip of the same file while that file is still loading", () => {
  // a (speed 2, 0–2 s) and b (2–6 s) share file:///media/a.mp4; b's source time at playhead 3 is 1.
  test("paused: the pending seek lands on the second clip's source time and nothing plays", async () => {
    player.currentTime = -1;
    await render(<PreviewPlayer />);
    expect(player.replaceAsync).toHaveBeenCalledTimes(1);
    await act(() => { useEditorStore.getState().seek(3); });
    expect(player.replaceAsync).toHaveBeenCalledTimes(1); // same file: no reload
    expect(player.currentTime).toBe(-1); // still loading: no seek yet
    await act(() => { player.listeners.statusChange?.({ status: "readyToPlay" }); });
    expect(player.currentTime).toBe(1);
    expect(player.play).not.toHaveBeenCalled();
    expect(player.playing).toBe(false);
  });

  test("playing: the pending seek lands on the second clip's source time, then plays", async () => {
    player.currentTime = -1;
    await render(<PreviewPlayer />);
    await act(() => { useEditorStore.getState().setPlaying(true); });
    await act(() => { useEditorStore.getState().seek(3); });
    expect(player.replaceAsync).toHaveBeenCalledTimes(1);
    expect(player.currentTime).toBe(-1);
    player.play.mockClear();
    await act(() => { player.listeners.statusChange?.({ status: "readyToPlay" }); });
    expect(player.currentTime).toBe(1);
    expect(player.play).toHaveBeenCalledTimes(1);
    await act(() => { useEditorStore.getState().setPlaying(false); });
  });
});

describe("photo clips", () => {
  beforeEach(() => {
    useEditorStore.getState().setProject(makeProject({ clips: [
      makePhotoClip({ id: "p", seconds: 1 }),
      makeClip({ id: "v", sourceDuration: 4 }),
    ] }));
  });
  afterEach(() => { jest.useRealTimers(); });

  test("a photo under the playhead renders an Image, no video, and pauses the player", async () => {
    await render(<PreviewPlayer />);
    await layout();
    expect(screen.getByTestId("clip-photo").props.source).toEqual({ uri: "file:///media/p.jpg" });
    expect(screen.queryByTestId("preview-video")).toBeNull();
    expect(player.pause).toHaveBeenCalled();
    expect(player.replaceAsync).not.toHaveBeenCalledWith({ uri: "file:///media/p.jpg" });
    expect(player.playing).toBe(false);
  });

  test("play on a photo advances the playhead without playing the video player", async () => {
    jest.useFakeTimers();
    await render(<PreviewPlayer />);
    await layout();
    await act(() => { useEditorStore.getState().setPlaying(true); });
    const pausesAtStart = player.pause.mock.calls.length;
    await act(() => { jest.advanceTimersByTime(500); });
    expect(useEditorStore.getState().playhead).toBeCloseTo(0.5, 5);
    expect(player.play).not.toHaveBeenCalled();
    expect(player.playing).toBe(false);
    // The photo's playhead ticks do not re-pause the (already paused) player each time.
    expect(player.pause.mock.calls.length).toBe(pausesAtStart);
    // A stray timeUpdate from the (paused) player must not move the playhead while the photo plays.
    await act(() => { player.listeners.timeUpdate?.({ currentTime: 3 }); });
    expect(useEditorStore.getState().playhead).toBeCloseTo(0.5, 5);
  });

  test("at the photo's end playback hands over to the next video clip", async () => {
    jest.useFakeTimers();
    await render(<PreviewPlayer />);
    await layout();
    await act(() => { useEditorStore.getState().setPlaying(true); });
    await act(() => { jest.advanceTimersByTime(1000); });
    expect(useEditorStore.getState().playhead).toBe(1);
    expect(useEditorStore.getState().isPlaying).toBe(true);
    expect(screen.getByTestId("preview-video")).toBeTruthy();
    expect(player.replaceAsync).toHaveBeenCalledWith({ uri: "file:///media/v.mp4" });
    await act(() => { player.listeners.statusChange?.({ status: "readyToPlay" }); });
    expect(player.play).toHaveBeenCalled();
    expect(player.playing).toBe(true);
  });

  test("a video source that becomes ready while a photo is on screen does not start the player", async () => {
    useEditorStore.getState().seek(2); // on the video: its source starts loading
    await render(<PreviewPlayer />);
    await layout();
    await act(() => { useEditorStore.getState().seek(0.5); }); // back onto the photo
    await act(() => { useEditorStore.getState().setPlaying(true); });
    await act(() => { player.listeners.statusChange?.({ status: "readyToPlay" }); });
    expect(player.playing).toBe(false);
    await act(() => { useEditorStore.getState().setPlaying(false); });
  });
});

describe("no redundant native writes while paused", () => {
  // Clip a: speed 2, file a.mp4. Playhead t → a's source time 2t.
  const ready = async () => {
    await render(<PreviewPlayer />);
    await layout();
    await act(() => { player.listeners.statusChange?.({ status: "readyToPlay" }); });
    player.seeks.length = 0;
    player.pause.mockClear();
  };

  test("changing only the clip's transform writes nothing to the player", async () => {
    await ready();
    const volumeSet = jest.fn();
    let volume = 1;
    Object.defineProperty(player, "volume", { configurable: true, get: () => volume, set: (v: number) => { volume = v; volumeSet(v); } });
    for (const x of [0.1, 0.2, 0.3]) {
      await act(() => { useEditorStore.getState().applyTransient((p) => setClipTransform(p, "a", { x })); });
    }
    expect(player.seeks).toEqual([]);
    expect(player.pause).not.toHaveBeenCalled();
    expect(volumeSet).not.toHaveBeenCalled();
    Object.defineProperty(player, "volume", { configurable: true, writable: true, value: 1 });
  });

  test("changing the playhead still seeks; seeking to the same time twice writes once", async () => {
    await ready();
    await act(() => { useEditorStore.getState().seek(1); });
    await act(() => { useEditorStore.getState().applyTransient((p) => setClipTransform(p, "a", { x: 0.2 })); });
    await act(() => { useEditorStore.getState().seek(0.5); });
    expect(player.seeks).toEqual([2, 1]);
  });

  test("a trim or speed change that moves the source time still seeks", async () => {
    await ready();
    await act(() => { useEditorStore.getState().seek(0.5); }); // source 1
    await act(() => { useEditorStore.getState().apply((p) => setClipSpeed(p, "a", 1)); }); // same playhead, source 0.5
    expect(player.seeks).toEqual([1, 0.5]);
  });

  test("play → pause → scrub back to the earlier time still seeks", async () => {
    await ready();
    await act(() => { useEditorStore.getState().seek(0.5); }); // source 1
    await act(() => { useEditorStore.getState().setPlaying(true); });
    player.currentTime = 1.6; player.seeks.length = 0; // the player moved on by itself while playing
    await act(() => { useEditorStore.getState().setPlaying(false); });
    await act(() => { useEditorStore.getState().seek(0.5); });
    expect(player.seeks[player.seeks.length - 1]).toBe(1);
  });

  test("a timeUpdate from the paused player (reporting our own seek) does not make the next gesture frame re-seek", async () => {
    await ready();
    await act(() => { useEditorStore.getState().seek(0.5); }); // source 1
    await act(() => { player.listeners.timeUpdate?.({ currentTime: 1 }); });
    await act(() => { useEditorStore.getState().applyTransient((p) => setClipTransform(p, "a", { x: 0.1 })); });
    expect(player.seeks).toEqual([1]);
  });

  test("crossing onto another clip of the same file while playing, then pausing at once, still seeks", async () => {
    await ready();
    await act(() => { useEditorStore.getState().setPlaying(true); });
    await act(() => { useEditorStore.getState().seek(2.5); }); // clip b, same file: source 0.5, then play
    expect(player.seeks).toEqual([0.5]);
    await act(() => { useEditorStore.getState().setPlaying(false); }); // before any timeUpdate
    expect(player.seeks).toEqual([0.5, 0.5]);
  });

  test("a timeUpdate while playing forgets the remembered seek", async () => {
    await ready();
    await act(() => { useEditorStore.getState().seek(0.5); }); // source 1
    await act(() => { useEditorStore.getState().setPlaying(true); });
    await act(() => { player.listeners.timeUpdate?.({ currentTime: 1.4 }); }); // playhead → 0.7
    await act(() => { useEditorStore.getState().setPlaying(false); });
    player.seeks.length = 0;
    await act(() => { useEditorStore.getState().seek(0.5); });
    expect(player.seeks).toEqual([1]);
  });
});

describe("replacing a clip's media (same clip id, new file)", () => {
  const newMedia = { sourceUri: "file:///media/new.mp4", sourceDuration: 8, width: 1080, height: 1920, kind: "video" as const };

  test("paused: the new file is loaded and seeked to the clip's source time; undo reloads the old file", async () => {
    await render(<PreviewPlayer />);
    await layout();
    await act(() => { player.listeners.statusChange?.({ status: "readyToPlay" }); });
    await act(() => { useEditorStore.getState().seek(0.5); }); // clip a (speed 2): source 1
    player.replaceAsync.mockClear(); player.seeks.length = 0;

    await act(() => { useEditorStore.getState().apply((p) => replaceClipMedia(p, "a", newMedia)); });
    expect(player.replaceAsync).toHaveBeenCalledWith({ uri: "file:///media/new.mp4" });
    expect(player.seeks).toEqual([]); // not seeking inside the old file
    await act(() => { player.listeners.statusChange?.({ status: "readyToPlay" }); });
    expect(player.seeks).toEqual([1]);
    expect(player.play).not.toHaveBeenCalled();

    player.replaceAsync.mockClear(); player.seeks.length = 0;
    await act(() => { useEditorStore.getState().undo(); });
    expect(player.replaceAsync).toHaveBeenCalledWith({ uri: "file:///media/a.mp4" });
    expect(player.seeks).toEqual([]);
    await act(() => { player.listeners.statusChange?.({ status: "readyToPlay" }); });
    expect(player.seeks).toEqual([1]);

    player.replaceAsync.mockClear(); player.seeks.length = 0;
    await act(() => { useEditorStore.getState().redo(); });
    expect(player.replaceAsync).toHaveBeenCalledWith({ uri: "file:///media/new.mp4" });
    await act(() => { player.listeners.statusChange?.({ status: "readyToPlay" }); });
    expect(player.seeks).toEqual([1]);
  });
});

test("the selected clip under the playhead gets the gesture layer and gold frame", async () => {
  await render(<PreviewPlayer />);
  await layout();
  expect(screen.queryByTestId("clip-selection-frame")).toBeNull();
  await act(() => { useEditorStore.getState().select("a"); });
  expect(screen.getByTestId("clip-selection-frame")).toBeTruthy();
  expect(screen.getByTestId("clip-gesture-area")).toBeTruthy();
});

describe("Preview tag", () => {
  test("shows for a reversed clip", async () => {
    useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "r", sourceDuration: 4, reversed: true })] }));
    await render(<PreviewPlayer />);
    expect(screen.getByTestId("preview-tag")).toBeTruthy();
  });
  test("shows for a visible blur background, not for a covered one", async () => {
    const transform = { scale: 0.5, x: 0, y: 0, rotation: 0, flipH: false, flipV: false };
    useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "b", sourceDuration: 4, background: { type: "blur" }, transform })] }));
    const { unmount } = await render(<PreviewPlayer />);
    expect(screen.getByTestId("preview-tag")).toBeTruthy();
    await unmount();
    useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "b", sourceDuration: 4, background: { type: "blur" } })] }));
    await render(<PreviewPlayer />);
    expect(screen.queryByTestId("preview-tag")).toBeNull();
  });
});

test("a reversed clip plays muted (the export is silent); a normal clip does not", async () => {
  const mp = player as unknown as { muted: boolean; volume: number };
  useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "r", sourceDuration: 4, reversed: true }), makeClip({ id: "n", sourceDuration: 4 })] }));
  await render(<PreviewPlayer />);
  expect(mp.muted).toBe(true);
  expect(mp.volume).toBe(0);
  await act(() => { useEditorStore.getState().seek(5); });
  expect(mp.muted).toBe(false);
  expect(mp.volume).toBe(1);
});

describe("the video's own sound follows the clip's fades", () => {
  // One 4 s clip fading in over 2 s and out over 1 s, at volume 0.8.
  const faded = (over: Partial<Clip> = {}) =>
    useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "f", sourceDuration: 4, volume: 0.8, fadeIn: 2, fadeOut: 1, ...over })] }));
  /** Records every `volume` / `muted` write from here on; `restore` puts the plain properties back. */
  const watch = () => {
    const mp = player as unknown as { volume: number; muted: boolean };
    let volume = mp.volume;
    let muted = mp.muted;
    const volumes: number[] = [];
    const mutes: boolean[] = [];
    Object.defineProperty(player, "volume", { configurable: true, get: () => volume, set: (v: number) => { volume = v; volumes.push(v); } });
    Object.defineProperty(player, "muted", { configurable: true, get: () => muted, set: (v: boolean) => { muted = v; mutes.push(v); } });
    return { volumes, mutes, restore: () => {
      Object.defineProperty(player, "volume", { configurable: true, writable: true, value: 1 });
      Object.defineProperty(player, "muted", { configurable: true, writable: true, value: false });
    } };
  };
  const ready = async () => {
    await render(<PreviewPlayer />);
    await layout();
    await act(() => { player.listeners.statusChange?.({ status: "readyToPlay" }); });
  };
  const tick = (currentTime: number) => act(() => { player.listeners.timeUpdate?.({ currentTime }); });

  test("paused: the volume is the clip's gain at the playhead", async () => {
    faded();
    const w = watch();
    await ready();
    expect(w.volumes).toEqual([0]); // the very start of the fade-in
    await act(() => { useEditorStore.getState().seek(1); });
    await act(() => { useEditorStore.getState().seek(2.5); });
    await act(() => { useEditorStore.getState().seek(3.5); });
    expect(w.volumes).toHaveLength(4);
    expect(w.volumes[1]).toBeCloseTo(0.4, 10); // fade-in midpoint
    expect(w.volumes[2]).toBeCloseTo(0.8, 10);
    expect(w.volumes[3]).toBeCloseTo(0.4, 10); // fade-out midpoint
    expect(w.mutes).toEqual([false]);
    w.restore();
  });

  test("playing through the fade writes the volume only: no seek, no pause, no play, no rate, no mute", async () => {
    faded();
    await ready();
    await act(() => { useEditorStore.getState().setPlaying(true); });
    const w = watch();
    player.seeks.length = 0; player.rates.length = 0; player.pause.mockClear(); player.play.mockClear();
    for (const t of [0.5, 1, 1.5]) await tick(t);
    expect(w.volumes).toHaveLength(3);
    [0.2, 0.4, 0.6].forEach((v, i) => expect(w.volumes[i]).toBeCloseTo(v, 10));
    expect(w.mutes).toEqual([]);
    expect(player.seeks).toEqual([]);
    expect(player.rates).toEqual([]);
    expect(player.pause).not.toHaveBeenCalled();
    expect(player.play).not.toHaveBeenCalled();
    expect(player.playing).toBe(true);
    await act(() => { useEditorStore.getState().setPlaying(false); });
    w.restore();
  });

  test("volume writes are throttled: only a change above 0.01, or arriving at exactly 0 or 1, is written", async () => {
    faded({ volume: 1 });
    await ready();
    await act(() => { useEditorStore.getState().setPlaying(true); });
    await tick(1);
    const w = watch();
    for (const t of [1.01, 1.016, 0.99]) await tick(t); // 0.505, 0.508, 0.495 against the 0.5 already written
    expect(w.volumes).toEqual([]);
    await tick(1.03);
    expect(w.volumes).toEqual([0.515]);
    await tick(1.99);
    await tick(2); // exactly the cap: written although it is within 0.01 of 0.995
    await tick(2.5);
    expect(w.volumes).toEqual([0.515, 0.995, 1]);
    await act(() => { useEditorStore.getState().setPlaying(false); });
    w.restore();
  });

  test("an un-faded clip keeps its one volume write, capped at 1", async () => {
    faded({ fadeIn: 0, fadeOut: 0, volume: 1.5 });
    const w = watch();
    await ready();
    for (const t of [0.5, 2, 3.9, 4]) await act(() => { useEditorStore.getState().seek(t); });
    await act(() => { useEditorStore.getState().setPlaying(true); });
    await tick(1);
    await act(() => { useEditorStore.getState().setPlaying(false); });
    expect(w.volumes).toEqual([1]);
    expect(w.mutes).toEqual([false]);
    w.restore();
  });

  test("a muted or reversed faded clip stays at 0", async () => {
    faded({ muted: true });
    const w = watch();
    await ready();
    await act(() => { useEditorStore.getState().seek(2.5); });
    await act(() => { useEditorStore.getState().apply((p) => ({ ...p, clips: p.clips.map((c) => ({ ...c, muted: false, reversed: true })) })); });
    expect(w.volumes).toEqual([0]);
    expect(w.mutes).toEqual([true]);
    w.restore();
  });

  test("recording mutes the video and un-mutes it afterwards, without a seek, a pause or a play", async () => {
    faded({ fadeIn: 0, fadeOut: 0 });
    await ready();
    await act(() => { useEditorStore.getState().seek(1); });
    const w = watch();
    player.seeks.length = 0; player.pause.mockClear(); player.play.mockClear();
    await act(() => { useEditorStore.getState().setRecording(true); });
    expect(w.volumes).toEqual([0]);
    expect(w.mutes).toEqual([true]);
    await act(() => { useEditorStore.getState().setRecording(false); });
    expect(w.volumes).toEqual([0, 0.8]);
    expect(w.mutes).toEqual([true, false]);
    expect(player.seeks).toEqual([]);
    expect(player.pause).not.toHaveBeenCalled();
    expect(player.play).not.toHaveBeenCalled();
    w.restore();
  });
});

describe("look layers (filter strength, adjust, effects)", () => {
  type Json = { props: { testID?: string }; children: (Json | string)[] | null };
  /** Every testID under `node`, depth-first: the paint order (later = on top). */
  const ids = (node: Json | string | null, out: string[] = []): string[] => {
    if (!node || typeof node === "string") return out;
    if (node.props.testID) out.push(node.props.testID);
    for (const c of node.children ?? []) ids(c, out);
    return out;
  };
  const find = (node: Json | string | null, id: string): Json | null => {
    if (!node || typeof node === "string") return null;
    if (node.props.testID === id) return node;
    for (const c of node.children ?? []) { const hit = find(c, id); if (hit) return hit; }
    return null;
  };
  const tree = () => screen.toJSON() as unknown as Json;

  test("an untouched project renders no filter, adjust or effect nodes, and the wrapper carries no transform", async () => {
    await render(<PreviewPlayer />);
    await layout();
    const all = ids(tree());
    expect(all.filter((id) => /^(filter-|adjust-|effect-layer|effect-overlays)/.test(id))).toEqual([]);
    expect(screen.queryByTestId("preview-tag")).toBeNull();
    expect(StyleSheet.flatten(screen.getByTestId("effect-transform").props.style).transform).toBeUndefined();
  });

  test("the layers stack in order: picture → filter → adjust → transition → effect colours → text", async () => {
    useEditorStore.getState().setProject(makeProject({
      clips: [
        makeClip({ id: "a", sourceDuration: 4, filter: "vintage", filterIntensity: 0.5, adjust: { ...DEFAULT_ADJUST, brightness: 1, vignette: 1 }, transitionOut: { type: "fade", duration: 1 } }),
        makeClip({ id: "b", sourceDuration: 4 }),
      ],
      overlays: [makeOverlay({ id: "t", start: 0, end: 8 })],
      effects: [makeEffect({ id: "f", type: "flash", start: 3, end: 5, intensity: 1 }), makeEffect({ id: "s", type: "shake", start: 3, end: 5, intensity: 1 })],
    }));
    useEditorStore.getState().seek(3.6);
    await render(<PreviewPlayer />);
    await layout();
    const all = ids(tree());
    const order = ["effect-transform", "preview-video", "filter-tint", "adjust-light", "adjust-vignette", "transition-layer", "effect-layer-0", "overlay-t", "preview-tag"];
    expect(order.map((id) => all.indexOf(id))).toEqual([...order.map((id) => all.indexOf(id))].sort((x, y) => x - y));
    expect(order.filter((id) => !all.includes(id))).toEqual([]);
    // The filter layers carry the clip's strength.
    expect(screen.getByTestId("filter-tint")).toHaveStyle({ opacity: FILTERS.vintage.preview.tintOpacity * 0.5 });
    // Only the picture is inside the shaken view.
    const inside = ids(find(tree(), "effect-transform"));
    expect(inside).toContain("preview-video");
    expect(inside.filter((id) => /^(filter-|adjust-|effect-layer|transition-|overlay-|preview-tag|clip-gesture|clip-selection)/.test(id))).toEqual([]);
    const o = shakeOffset(3.6 - 3, 2, 1);
    expect(StyleSheet.flatten(screen.getByTestId("effect-transform").props.style).transform).toEqual([{ translateX: o.x * 270 }, { translateY: o.y * 480 }, { scale: 1.06 }]);
  });

  test("the gold selection frame stays outside the shaken view", async () => {
    useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 })], effects: [makeEffect({ id: "s", type: "shake", start: 0, end: 2 })] }));
    useEditorStore.getState().seek(1);
    await render(<PreviewPlayer />);
    await layout();
    await act(() => { useEditorStore.getState().select("a"); });
    expect(ids(tree())).toContain("clip-selection-frame");
    expect(ids(find(tree(), "effect-transform"))).not.toContain("clip-selection-frame");
  });

  test("an effect starting and ending never remounts the video view", async () => {
    useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 })], effects: [makeEffect({ id: "s", type: "shake", start: 1, end: 2 })] }));
    await render(<PreviewPlayer />);
    await layout();
    const video = screen.getByTestId("preview-video");
    await act(() => { useEditorStore.getState().seek(1.5); });
    expect(StyleSheet.flatten(screen.getByTestId("effect-transform").props.style).transform).toBeDefined();
    expect(screen.getByTestId("preview-tag")).toBeTruthy();
    expect(screen.getByTestId("preview-video")).toBe(video);
    await act(() => { useEditorStore.getState().seek(3); });
    expect(StyleSheet.flatten(screen.getByTestId("effect-transform").props.style).transform).toBeUndefined();
    expect(screen.getByTestId("preview-video")).toBe(video);
    expect(player.replaceAsync).toHaveBeenCalledTimes(1);
  });
});

describe("layers, opacity and masks", () => {
  type Json = { props: { testID?: string }; children: (Json | string)[] | null };
  const ids = (node: Json | string | null, out: string[] = []): string[] => {
    if (!node || typeof node === "string") return out;
    if (node.props.testID) out.push(node.props.testID);
    for (const c of node.children ?? []) ids(c, out);
    return out;
  };
  const find = (node: Json | string | null, id: string): Json | null => {
    if (!node || typeof node === "string") return null;
    if (node.props.testID === id) return node;
    for (const c of node.children ?? []) { const hit = find(c, id); if (hit) return hit; }
    return null;
  };
  const tree = () => screen.toJSON() as unknown as Json;
  const mainBox = () => StyleSheet.flatten(within(screen.getByTestId("effect-transform")).getByTestId("clip-box").props.style);
  const small = { scale: 0.4, x: 0, y: 0, rotation: 0, flipH: false, flipV: false };
  const photo = (id: string, start: number): LayerClip => ({ ...makePhotoClip({ id, seconds: 2 }), transform: small, start });
  const setLayers = (layers: LayerClip[]) => act(() => { useEditorStore.getState().apply((p) => ({ ...p, layers })); });

  test("a project without layers renders the tree it always did: no layer nodes, only the picture in the shaken view", async () => {
    await render(<PreviewPlayer />);
    await layout();
    expect(ids(tree()).filter((id) => /^layer-/.test(id))).toEqual([]);
    expect(ids(find(tree(), "effect-transform"))).toEqual(["effect-transform", "clip-box", "clip-content", "preview-video"]);
    expect(Object.keys(mainBox()).sort()).toEqual(["height", "left", "overflow", "position", "top", "transform", "width"]);
  });

  test("draw order: main picture → its filter / adjust → transition → layers in list order → effect colours → text", async () => {
    // The export draws the layers over the already-transitioned main frame: the transition's dip must not dim them.
    useEditorStore.getState().setProject(makeProject({
      clips: [
        makeClip({ id: "a", sourceDuration: 4, filter: "vintage", filterIntensity: 0.5, adjust: { ...DEFAULT_ADJUST, brightness: 1 }, transitionOut: { type: "fade", duration: 1 } }),
        makeClip({ id: "b", sourceDuration: 4 }),
      ],
      layers: [photo("one", 3), { ...makeLayer({ id: "two", sourceDuration: 4, start: 3 }), transform: small }],
      overlays: [makeOverlay({ id: "t", start: 0, end: 8 })],
      effects: [makeEffect({ id: "f", type: "flash", start: 3, end: 5, intensity: 1 }), makeEffect({ id: "s", type: "shake", start: 3, end: 5, intensity: 1 })],
    }));
    useEditorStore.getState().seek(3.6);
    await render(<PreviewPlayer />);
    await layout();
    const all = ids(tree());
    const order = ["effect-transform", "preview-video", "filter-tint", "adjust-light", "transition-layer", "layer-stack", "layer-one", "layer-two", "layer-video-two", "effect-layer-0", "overlay-t", "preview-tag"];
    expect(order.filter((id) => !all.includes(id))).toEqual([]);
    expect(order.map((id) => all.indexOf(id))).toEqual([...order.map((id) => all.indexOf(id))].sort((x, y) => x - y));
    // The layers shake with the picture: their stack carries the same transform. The main clip's look layers stay off the layers.
    const shaken = StyleSheet.flatten(screen.getByTestId("effect-transform").props.style).transform;
    expect(shaken).toBeDefined();
    expect(StyleSheet.flatten(screen.getByTestId("layer-stack").props.style).transform).toEqual(shaken);
    expect(ids(find(tree(), "layer-stack")).filter((id) => /^(filter-|adjust-|effect-layer|transition-|overlay-|clip-background)/.test(id))).toEqual([]);
    expect(ids(find(tree(), "effect-transform")).filter((id) => /^layer-/.test(id))).toEqual([]);
    expect(screen.getByTestId("layer-stack").props.pointerEvents).toBe("none");
  });

  test("layers appearing, changing and disappearing never remount the main video view or reload its file", async () => {
    await render(<PreviewPlayer />);
    await layout();
    const video = screen.getByTestId("preview-video");
    await setLayers([photo("one", 0)]);
    expect(screen.getByTestId("layer-one")).toBeTruthy();
    expect(screen.getByTestId("preview-video")).toBe(video);
    await setLayers([photo("one", 0), { ...makeLayer({ id: "two", sourceDuration: 4, start: 0.5 }), transform: small }]);
    await act(() => { useEditorStore.getState().seek(1); });
    expect(screen.getByTestId("layer-video-two")).toBeTruthy();
    expect(screen.getByTestId("preview-video")).toBe(video);
    await act(() => { useEditorStore.getState().seek(1.9); }); // "one" (0–2) still on
    await act(() => { useEditorStore.getState().seek(0.2); }); // "two" gone
    expect(screen.queryByTestId("layer-two")).toBeNull();
    expect(screen.getByTestId("preview-video")).toBe(video);
    await setLayers([]);
    expect(screen.queryByTestId("layer-stack")).toBeNull();
    expect(screen.getByTestId("preview-video")).toBe(video);
    expect(player.replaceAsync).toHaveBeenCalledTimes(1);
    expect(ids(find(tree(), "effect-transform"))).toEqual(["effect-transform", "clip-box", "clip-content", "preview-video"]);
  });

  test("a main clip's static opacity fades its picture over its background; back at 1 the default styles return", async () => {
    await render(<PreviewPlayer />);
    await layout();
    const video = screen.getByTestId("preview-video");
    await act(() => { useEditorStore.getState().apply((p) => setClipOpacity(p, "a", 0.4)); });
    expect(mainBox().opacity).toBe(0.4);
    expect(mainBox()).toMatchObject({ left: 0, top: 0, width: 270, height: 480 }); // no transform override
    expect(screen.getByTestId("clip-background")).toBeTruthy();
    await act(() => { useEditorStore.getState().apply((p) => setClipOpacity(p, "a", 1)); });
    expect("opacity" in mainBox()).toBe(false);
    expect(screen.queryByTestId("clip-background")).toBeNull();
    expect(screen.getByTestId("preview-video")).toBe(video);
  });

  test("a main clip's mask rounds its picture box and shows the background around it, without a remount", async () => {
    await render(<PreviewPlayer />);
    await layout();
    const video = screen.getByTestId("preview-video");
    await act(() => { useEditorStore.getState().apply((p) => setClipMask(p, "a", "circle")); });
    expect(mainBox().borderRadius).toBe(135);
    expect(screen.getByTestId("clip-background")).toBeTruthy();
    await act(() => { useEditorStore.getState().apply((p) => setClipMask(p, "a", "none")); });
    expect("borderRadius" in mainBox()).toBe(false);
    expect(screen.getByTestId("preview-video")).toBe(video);
  });

  test("the Preview tag shows while a layer with a filter is at the playhead", async () => {
    useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 8 })], layers: [{ ...photo("one", 2), filter: "vintage" }] }));
    await render(<PreviewPlayer />);
    await layout();
    expect(screen.queryByTestId("preview-tag")).toBeNull();
    await act(() => { useEditorStore.getState().seek(3); });
    expect(screen.getByTestId("preview-tag")).toBeTruthy();
    await act(() => { useEditorStore.getState().seek(5); });
    expect(screen.queryByTestId("preview-tag")).toBeNull();
  });
});

describe("blur / mosaic boxes, blend modes and green screen", () => {
  type Json = { props: { testID?: string }; children: (Json | string)[] | null };
  const ids = (node: Json | string | null, out: string[] = []): string[] => {
    if (!node || typeof node === "string") return out;
    if (node.props.testID) out.push(node.props.testID);
    for (const c of node.children ?? []) ids(c, out);
    return out;
  };
  const find = (node: Json | string | null, id: string): Json | null => {
    if (!node || typeof node === "string") return null;
    if (node.props.testID === id) return node;
    for (const c of node.children ?? []) { const hit = find(c, id); if (hit) return hit; }
    return null;
  };
  const tree = () => screen.toJSON() as unknown as Json;
  const st = () => useEditorStore.getState();
  const small = { scale: 0.4, x: 0, y: 0, rotation: 0, flipH: false, flipV: false };
  const rect = { x: 0.1, y: 0.2, w: 0.4, h: 0.25 };
  const boxed = () => makeProject({
    clips: [makeClip({ id: "a", sourceDuration: 8 })],
    layers: [{ ...makePhotoClip({ id: "one", seconds: 6 }), transform: small, start: 0 }],
    overlays: [makeOverlay({ id: "t", start: 0, end: 8 })],
    effects: [makeEffect({ id: "f", type: "flash", start: 0, end: 8, intensity: 1 }), makeEffect({ id: "box", type: "blurBox", start: 2, end: 4, rect })],
  });

  test("a project without boxes renders the tree it always did: no region nodes", async () => {
    await render(<PreviewPlayer />);
    await layout();
    expect(ids(tree()).filter((id) => /^region-/.test(id))).toEqual([]);
    expect(ids(tree())).toEqual(["effect-transform", "clip-box", "clip-content", "preview-video"]);
    await act(() => { st().select("a"); });
    expect(ids(tree())).toEqual(["effect-transform", "clip-box", "clip-content", "preview-video", "clip-gesture-area", "clip-selection-frame"]);
  });

  test("a box is drawn at its pixels above the picture, layers and effect colours and below text, only while it covers the playhead", async () => {
    st().setProject(boxed());
    await render(<PreviewPlayer />);
    await layout();
    expect(screen.queryByTestId("region-boxes")).toBeNull();
    await act(() => { st().seek(3); });
    expect(screen.getByTestId("region-box-box")).toHaveStyle({ left: 27, top: 96, width: 108, height: 120 });
    const all = ids(tree());
    const order = ["effect-transform", "preview-video", "layer-stack", "layer-one", "effect-layer-0", "region-boxes", "region-box-box", "overlay-t", "preview-tag"];
    expect(order.filter((id) => !all.includes(id))).toEqual([]);
    expect(order.map((id) => all.indexOf(id))).toEqual([...order.map((id) => all.indexOf(id))].sort((x, y) => x - y));
    // The box neither shakes with the picture nor sits inside the layers.
    expect(ids(find(tree(), "effect-transform")).filter((id) => /^region-/.test(id))).toEqual([]);
    expect(ids(find(tree(), "layer-stack")).filter((id) => /^region-/.test(id))).toEqual([]);
    expect(screen.getByTestId("region-box-box").props.pointerEvents).toBe("none");
    await act(() => { st().seek(4); });
    expect(screen.queryByTestId("region-boxes")).toBeNull();
  });

  test("a box appearing, being selected and moved never remounts the main video view", async () => {
    st().setProject(boxed());
    await render(<PreviewPlayer />);
    await layout();
    const video = screen.getByTestId("preview-video");
    await act(() => { st().seek(3); });
    await act(() => { st().selectEffect("box"); });
    expect(screen.getByTestId("region-handle-tl")).toBeTruthy();
    expect(screen.getByTestId("region-handle-br")).toBeTruthy();
    const [pan] = (screen.getByTestId("region-box-box").props.gesture as { gestures: { handlers: Record<string, (e: unknown) => void> }[] }).gestures;
    await act(() => { pan.handlers.onBegin({}); pan.handlers.onStart({}); pan.handlers.onUpdate({ translationX: 27, translationY: 0 }); pan.handlers.onFinalize({}); });
    expect(st().project!.effects[1].rect!.x).toBeCloseTo(0.2, 9);
    expect(st().past).toHaveLength(1);
    expect(screen.getByTestId("region-box-box")).toHaveStyle({ left: 54 });
    expect(screen.getByTestId("preview-video")).toBe(video);
    expect(player.replaceAsync).toHaveBeenCalledTimes(1);
  });

  test("while a box is selected the clip gesture layer is off (selection is exclusive), and the other way round", async () => {
    st().setProject(boxed());
    st().seek(3);
    await render(<PreviewPlayer />);
    await layout();
    await act(() => { st().select("a"); });
    expect(screen.getByTestId("clip-gesture-area")).toBeTruthy();
    expect(screen.queryByTestId("region-handle-tl")).toBeNull();
    await act(() => { st().selectEffect("box"); });
    expect(st().selectedClipId).toBeNull();
    expect(screen.queryByTestId("clip-gesture-area")).toBeNull();
    expect(screen.queryByTestId("clip-selection-frame")).toBeNull();
    expect(screen.getByTestId("region-handle-tl")).toBeTruthy();
    await act(() => { st().select("one"); });
    expect(screen.queryByTestId("region-handle-tl")).toBeNull();
    expect(screen.getByTestId("region-box-box").props.pointerEvents).toBe("none");
    expect(screen.getByTestId("clip-gesture-area")).toBeTruthy();
  });

  test("a tap on the preview with a box selected still deselects it (the press handler is unchanged)", async () => {
    st().setProject(boxed());
    st().seek(3);
    st().selectEffect("box");
    await render(<PreviewPlayer />);
    await layout();
    await fireEvent.press(screen.getByLabelText("Preview"), { nativeEvent: { locationX: 260, locationY: 470 } });
    expect(st().selectedEffectId).toBeNull();
    expect(st().isPlaying).toBe(false);
    expect(screen.queryByTestId("region-handle-tl")).toBeNull();
    expect(screen.getByTestId("region-box-box")).toBeTruthy();
  });

  test("the Preview tag shows for a box, a layer's blend mode and a green screen", async () => {
    st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 8 })], effects: [makeEffect({ id: "box", type: "mosaicBox", start: 2, end: 4 })] }));
    await render(<PreviewPlayer />);
    await layout();
    expect(screen.queryByTestId("preview-tag")).toBeNull();
    await act(() => { st().seek(3); });
    expect(screen.getByTestId("preview-tag")).toBeTruthy();
    await act(() => { st().seek(5); });
    expect(screen.queryByTestId("preview-tag")).toBeNull();
    const layer = (over: Partial<LayerClip>): LayerClip => ({ ...makePhotoClip({ id: "one", seconds: 2 }), transform: small, start: 2, ...over });
    for (const over of [{ blend: "screen" as const }, { chroma: { color: "#00FF00", strength: 0.5 } }]) {
      await act(() => { st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 8 })], layers: [layer(over)] })); });
      expect(screen.queryByTestId("preview-tag")).toBeNull();
      await act(() => { st().seek(3); });
      expect(screen.getByTestId("preview-tag")).toBeTruthy();
      // The picture itself is untouched: the same nodes as for a plain layer.
      expect(ids(tree()).filter((id) => /^region-/.test(id))).toEqual([]);
    }
    await act(() => { st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 8, chroma: { color: "#0000FF", strength: 1 } })] })); });
    expect(screen.getByTestId("preview-tag")).toBeTruthy();
  });
});

test("tapping the preview with an effect selected deselects it without starting playback; the next tap plays", async () => {
  useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 })], effects: [makeEffect({ id: "e1", start: 0, end: 2 })] }));
  useEditorStore.getState().selectEffect("e1");
  await render(<PreviewPlayer />);
  await fireEvent.press(screen.getByLabelText("Preview"));
  expect(useEditorStore.getState().selectedEffectId).toBeNull();
  expect(useEditorStore.getState().isPlaying).toBe(false);
  await fireEvent.press(screen.getByLabelText("Preview"));
  expect(useEditorStore.getState().isPlaying).toBe(true);
});

test("tapping the preview with an audio track selected deselects it without starting playback; the next tap plays", async () => {
  useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 })], audioTracks: [makeAudioTrack({ id: "m1", sourceDuration: 4 })] }));
  useEditorStore.getState().selectAudio("m1");
  await render(<PreviewPlayer />);
  await fireEvent.press(screen.getByLabelText("Preview"));
  expect(useEditorStore.getState().selectedAudioId).toBeNull();
  expect(useEditorStore.getState().isPlaying).toBe(false);
  await fireEvent.press(screen.getByLabelText("Preview"));
  expect(useEditorStore.getState().isPlaying).toBe(true);
});

describe("tapping layers on the preview", () => {
  const st = () => useEditorStore.getState();
  const tf = (x: number, rotation = 0) => ({ scale: 0.4, x, y: 0, rotation, flipH: false, flipV: false });
  /** A photo layer whose 108×192 box sits around (135 + x·270, 240) in the 270×480 frame. */
  const photo = (id: string, x: number, start = 0, over: Partial<LayerClip> = {}): LayerClip => ({ ...makePhotoClip({ id, seconds: 2 }), transform: tf(x), start, ...over });
  const mount = async (layers: LayerClip[]) => {
    st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 8 })], layers, overlays: [makeOverlay({ id: "t", text: "Hi", start: 0, end: 8 })] }));
    await render(<PreviewPlayer />);
    await layout();
  };
  const tap = (x: number, y: number) => fireEvent.press(screen.getByLabelText("Preview"), { nativeEvent: { locationX: x, locationY: y } });

  test("a tap on a layer's picture selects it and does not start playback; it then takes the gestures", async () => {
    await mount([photo("one", 0)]);
    await tap(135, 240);
    expect(st().selectedClipId).toBe("one");
    expect(st().isPlaying).toBe(false);
    expect(screen.getByTestId("clip-gesture-area")).toBeTruthy();
    expect(screen.getByTestId("clip-selection-frame")).toHaveStyle({ left: 81, top: 144, width: 108, height: 192 });
  });

  test("where layers overlap, the topmost (drawn last) is selected", async () => {
    await mount([photo("low", 0), photo("top", 0.2)]); // low spans x 81–189, top 135–243
    await tap(160, 240);
    expect(st().selectedClipId).toBe("top");
    await tap(100, 240);
    expect(st().selectedClipId).toBe("low");
    await tap(230, 240);
    expect(st().selectedClipId).toBe("top");
    expect(st().isPlaying).toBe(false);
  });

  test("a turned layer is hit by its turned box", async () => {
    await mount([photo("one", 0, 0, { transform: tf(0, 45) })]);
    await tap(135, 150); // inside the upright box only
    expect(st().selectedClipId).toBeNull();
    expect(st().isPlaying).toBe(true);
    await tap(205, 240); // inside the turned box only
    expect(st().selectedClipId).toBe("one");
  });

  test("a tap beside every layer, nothing selected: plays / pauses as it always did", async () => {
    await mount([photo("one", 0)]);
    await tap(20, 20);
    expect(st().selectedClipId).toBeNull();
    expect(st().isPlaying).toBe(true);
    await tap(20, 20);
    expect(st().isPlaying).toBe(false);
  });

  test("a tap on the already-selected layer plays / pauses and keeps it selected (a full-frame layer does not block the preview tap)", async () => {
    await mount([photo("full", 0, 0, { transform: { scale: 1, x: 0, y: 0, rotation: 0, flipH: false, flipV: false } })]);
    await tap(20, 20);
    expect(st().selectedClipId).toBe("full");
    expect(st().isPlaying).toBe(false);
    await tap(20, 20);
    expect(st().selectedClipId).toBe("full");
    expect(st().isPlaying).toBe(true);
    await tap(200, 400);
    expect(st().selectedClipId).toBe("full");
    expect(st().isPlaying).toBe(false);
  });

  test("with a layer selected: a tap on it toggles play and keeps it, a tap elsewhere deselects it without playing, the next one plays", async () => {
    await mount([photo("one", 0)]);
    await tap(135, 240);
    await tap(150, 250);
    expect(st().selectedClipId).toBe("one");
    expect(st().isPlaying).toBe(true);
    await tap(150, 250);
    expect(st().isPlaying).toBe(false);
    await tap(20, 20);
    expect(st().selectedClipId).toBeNull();
    expect(st().isPlaying).toBe(false);
    expect(screen.queryByTestId("clip-gesture-area")).toBeNull();
    await tap(20, 20);
    expect(st().isPlaying).toBe(true);
  });

  test("a selected layer that is not on screen is deselected by a tap anywhere", async () => {
    await mount([photo("late", 0, 4)]); // on screen 4–6
    await act(() => { st().select("late"); });
    await tap(135, 240); // where it would be: it is not drawn now
    expect(st().selectedClipId).toBeNull();
    expect(st().isPlaying).toBe(false);
  });

  test("a layer that is not on screen at the playhead, or all but invisible, is not hit", async () => {
    await mount([photo("late", 0, 4), photo("ghost", 0, 0, { opacity: 0.01 })]);
    await tap(135, 240);
    expect(st().selectedClipId).toBeNull();
    expect(st().isPlaying).toBe(true);
  });

  test("with a main clip selected a tap beside the layers still plays and keeps the selection; a tap on a layer selects the layer", async () => {
    await mount([photo("one", 0)]);
    await act(() => { st().select("a"); });
    await tap(20, 20);
    expect(st().selectedClipId).toBe("a");
    expect(st().isPlaying).toBe(true);
    await tap(135, 240);
    expect(st().selectedClipId).toBe("one");
  });

  test("a tap on a layer while a text is selected selects the layer (the selection stays exclusive)", async () => {
    await mount([photo("one", 0)]);
    await act(() => { st().selectOverlay("t"); });
    await tap(135, 240);
    expect(st().selectedClipId).toBe("one");
    expect(st().selectedOverlayId).toBeNull();
    expect(st().isPlaying).toBe(false);
  });

  test("a tap that carries no position hits no layer", async () => {
    await mount([photo("one", 0)]);
    await fireEvent.press(screen.getByLabelText("Preview"));
    expect(st().selectedClipId).toBeNull();
    expect(st().isPlaying).toBe(true);
  });

  test("a layer's keyframed place at the playhead is what is hit", async () => {
    const kf = (t: number, x: number) => ({ t, x, y: 0, scale: 0.4, rotation: 0, opacity: 1 });
    await mount([{ ...makeLayer({ id: "v", sourceDuration: 4, start: 0, keyframes: [kf(0, 0), kf(2, 0.4)] }), transform: tf(0) }]);
    await act(() => { st().seek(2); }); // the picture is now around x = 243
    await tap(135, 240);
    expect(st().selectedClipId).toBeNull();
    await act(() => { st().setPlaying(false); });
    await tap(243, 240);
    expect(st().selectedClipId).toBe("v");
  });
});

describe("clip motion (animations and keyframes)", () => {
  const box = () => StyleSheet.flatten(screen.getByTestId("clip-box").props.style);
  const pin = (t: number, over: Partial<{ x: number; y: number; scale: number; rotation: number; opacity: number }> = {}) =>
    ({ t, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, ...over });
  const one = (over: Partial<Clip> & { id: string }) => useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ ...over, sourceDuration: 4 })] }));

  test("a default project passes no overrides: the picture box has no opacity and sits on the frame", async () => {
    one({ id: "a" });
    await render(<PreviewPlayer />);
    await layout();
    expect("opacity" in box()).toBe(false);
    expect(box()).toMatchObject({ left: 0, top: 0, width: 270, height: 480 });
    expect(screen.queryByTestId("clip-background")).toBeNull();
  });

  test("a fade In shows the picture at opacity 0 at the clip's start (over its background) and 1 after the In", async () => {
    one({ id: "a", animation: { in: { id: "fade", duration: 1 }, out: null, combo: null } });
    await render(<PreviewPlayer />);
    await layout();
    expect(box().opacity).toBe(0);
    expect(screen.getByTestId("clip-background")).toBeTruthy();
    await act(() => { useEditorStore.getState().seek(0.5); });
    expect(box().opacity).toBeCloseTo(1 - 0.5 ** 3, 10); // easeOut(0.5)
    await act(() => { useEditorStore.getState().seek(2); });
    expect(box().opacity).toBe(1);
    expect(screen.queryByTestId("clip-background")).toBeNull();
  });

  test("a keyframed clip moves between its pins", async () => {
    one({ id: "a", keyframes: [pin(0), pin(2, { x: 0.4 })] });
    await render(<PreviewPlayer />);
    await layout();
    expect(box().left).toBeCloseTo(0, 10);
    await act(() => { useEditorStore.getState().seek(1); });
    expect(box().left).toBeCloseTo(0.2 * 270, 10); // smooth(0.5) = 0.5
    await act(() => { useEditorStore.getState().seek(3); });
    expect(box().left).toBeCloseTo(0.4 * 270, 10); // holds after the last pin
  });

  test("motion starting, changing and ending never remounts the video view", async () => {
    one({ id: "a" });
    await render(<PreviewPlayer />);
    await layout();
    const video = screen.getByTestId("preview-video");
    await act(() => { useEditorStore.getState().apply((p) => setClipAnimation(p, "a", { in: { id: "fade", duration: 1 } })); });
    expect(box().opacity).toBe(0);
    expect(screen.getByTestId("preview-video")).toBe(video);
    await act(() => { useEditorStore.getState().seek(0.5); });
    expect(screen.getByTestId("preview-video")).toBe(video);
    await act(() => { useEditorStore.getState().seek(2); });
    expect(box().opacity).toBe(1);
    expect(screen.getByTestId("preview-video")).toBe(video);
    await act(() => { useEditorStore.getState().apply((p) => setClipAnimation(p, "a", { in: null })); });
    expect("opacity" in box()).toBe(false);
    expect(screen.getByTestId("preview-video")).toBe(video);
    expect(player.replaceAsync).toHaveBeenCalledTimes(1);
  });
});

describe("speed curves: the playback rate follows the steps", () => {
  // Hero over 8 s of source: 1 s slices at 1, 2, 3, 0.5, 0.5, 3, 2, 1 → output boundaries 1, 1.5, 1.833, 3.833, 5.833, 6.167, 6.667.
  const curved = (id: "hero" | "bullet" | "flashIn" = "hero") =>
    useEditorStore.getState().setProject(setClipSpeedCurve(makeProject({ clips: [makeClip({ id: "k", sourceDuration: 8 })] }), "k", id));
  const ready = async () => {
    await render(<PreviewPlayer />);
    await layout();
    await act(() => { player.listeners.statusChange?.({ status: "readyToPlay" }); });
  };
  const tick = (currentTime: number) => act(() => { player.listeners.timeUpdate?.({ currentTime }); });

  /** Arms the next `play()`; the returned getter gives the rate writes that had been made by the time it ran. */
  const ratesAtPlay = () => { let seen: number[] | null = null; player.play.mockImplementationOnce(() => { seen = player.rates.slice(); player.playing = true; }); return () => seen; };

  test("paused: scrubbing across step boundaries writes no rate and never pauses again or starts the player", async () => {
    curved();
    await ready();
    player.rates.length = 0; player.pause.mockClear();
    for (const t of [0.5, 1.2, 1.6, 2.5, 6, 7, 0.2]) { // crosses 1, 1.5, 1.833 … and back
      await act(() => { useEditorStore.getState().seek(t); });
      expect(player.playing).toBe(false);
    }
    expect(player.rates).toEqual([]);
    expect(player.pause).not.toHaveBeenCalled();
    expect(player.play).not.toHaveBeenCalled();
  });

  test("pressing play after a paused scrub writes the current step's rate exactly once, before play()", async () => {
    curved();
    await ready();
    for (const t of [1.2, 1.6, 2.5]) await act(() => { useEditorStore.getState().seek(t); }); // three boundaries; ends in the 0.5× step
    expect(player.rates).toEqual([]);
    player.seeks.length = 0;
    const atPlay = ratesAtPlay();
    await act(() => { useEditorStore.getState().setPlaying(true); });
    expect(atPlay()).toEqual([0.5]); // already written when play() ran
    expect(player.rates).toEqual([0.5]);
    expect(player.play).toHaveBeenCalledTimes(1);
    expect(player.seeks).toEqual([]);
    await act(() => { useEditorStore.getState().setPlaying(false); });
    // Pausing and playing again inside the same step writes nothing more.
    await act(() => { useEditorStore.getState().setPlaying(true); });
    expect(player.rates).toEqual([0.5]);
    await act(() => { useEditorStore.getState().setPlaying(false); });
  });

  test("playing from a load: the rate of the step is applied before play() once the source is ready", async () => {
    curved();
    useEditorStore.getState().seek(1.2); // the 2× step
    await render(<PreviewPlayer />);
    await layout();
    expect(player.rates).toEqual([]); // paused, still loading
    await act(() => { useEditorStore.getState().setPlaying(true); });
    player.play.mockClear();
    const atPlay = ratesAtPlay();
    await act(() => { player.listeners.statusChange?.({ status: "readyToPlay" }); });
    expect(atPlay()).toEqual([2]);
    expect(player.rates).toEqual([2]);
    await act(() => { useEditorStore.getState().setPlaying(false); });
  });

  test("paused: scrubbing inside one step seeks through the curve and writes no rate", async () => {
    curved();
    await ready();
    await act(() => { useEditorStore.getState().seek(2); }); // in the first 0.5× step (source 3–4, output 1.833–3.833)
    player.rates.length = 0; player.seeks.length = 0;
    await act(() => { useEditorStore.getState().seek(2.5); });
    await act(() => { useEditorStore.getState().seek(3.5); });
    expect(player.rates).toEqual([]);
    expect(player.seeks).toHaveLength(2);
    expect(player.seeks[0]).toBeCloseTo(3 + (2.5 - (1 + 0.5 + 1 / 3)) * 0.5, 9);
    expect(player.seeks[1]).toBeCloseTo(3 + (3.5 - (1 + 0.5 + 1 / 3)) * 0.5, 9);
  });

  test("playing: a timeUpdate that crosses a step boundary changes the rate once, with no seek, pause or play", async () => {
    curved();
    await ready();
    await act(() => { useEditorStore.getState().setPlaying(true); });
    player.rates.length = 0; player.seeks.length = 0; player.pause.mockClear(); player.play.mockClear();
    await tick(0.5);
    await tick(0.9);
    expect(player.rates).toEqual([]); // still in the 1× step
    await tick(1.1); // source 1.1 → playhead 1.05, in the 2× step
    expect(useEditorStore.getState().playhead).toBeCloseTo(1.05, 9);
    expect(player.rates).toEqual([2]);
    await tick(1.5);
    await tick(1.9);
    expect(player.rates).toEqual([2]); // same step: nothing written
    await tick(2.2);
    await tick(3.4); // source 3.4 → the 0.5× step
    expect(player.rates).toEqual([2, 3, 0.5]);
    expect(player.seeks).toEqual([]);
    expect(player.pause).not.toHaveBeenCalled();
    expect(player.play).not.toHaveBeenCalled();
    expect(player.playing).toBe(true);
    expect(useEditorStore.getState().isPlaying).toBe(true);
    await act(() => { useEditorStore.getState().setPlaying(false); });
  });

  test("a rate the native Float cannot hold exactly (0.3) is still written once per step, playing or paused", async () => {
    curved("bullet"); // 3.5 ×3, 0.3 ×2, 3.5 ×3 over 1 s slices
    await ready();
    await act(() => { useEditorStore.getState().setPlaying(true); });
    await tick(2.9);
    player.rates.length = 0;
    for (const t of [3.1, 3.2, 3.3, 3.4, 4.5]) await tick(t);
    expect(player.rates).toEqual([0.3]);
    await act(() => { useEditorStore.getState().setPlaying(false); });
    player.rates.length = 0; player.pause.mockClear();
    for (const x of [0.1, 0.2, 0.3]) await act(() => { useEditorStore.getState().applyTransient((p) => setClipTransform(p, "k", { x })); });
    expect(player.rates).toEqual([]);
    expect(player.pause).not.toHaveBeenCalled();
  });

  test("the last step's rate holds to the clip's end and playback ends there", async () => {
    curved();
    await ready();
    await act(() => { useEditorStore.getState().seek(7); });
    await act(() => { useEditorStore.getState().setPlaying(true); });
    player.rates.length = 0;
    await tick(7.6);
    await tick(8.1);
    expect(player.rates).toEqual([]);
    expect(useEditorStore.getState().isPlaying).toBe(false);
  });

  test("a reversed curved clip (previewed forwards) takes the rate of the step the player is actually in", async () => {
    curved("flashIn"); // 4, 3, 2, 1.5, 1, 1, 1, 1 in source order
    useEditorStore.getState().apply((p) => setClipReversed(p, "k", true));
    await ready();
    await act(() => { useEditorStore.getState().setPlaying(true); });
    expect(player.rates).toEqual([4]); // the preview shows source 0 at playhead 0
    await tick(1.2); // source 1.2: the second slice
    expect(player.rates).toEqual([4, 3]);
    await act(() => { useEditorStore.getState().setPlaying(false); });
  });

  test("picking and clearing a curve while paused writes no rate and leaves the player paused; the video view is not remounted", async () => {
    useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "k", sourceDuration: 8 })] }));
    await ready();
    const video = screen.getByTestId("preview-video");
    await act(() => { useEditorStore.getState().seek(1.2); });
    expect(player.rates).toEqual([]);
    await act(() => { useEditorStore.getState().apply((p) => setClipSpeedCurve(p, "k", "hero")); });
    expect(player.rates).toEqual([]);
    expect(player.playing).toBe(false);
    await act(() => { useEditorStore.getState().apply((p) => setClipSpeedCurve(p, "k", null)); });
    expect(player.rates).toEqual([]);
    expect(player.playing).toBe(false);
    expect(screen.getByTestId("preview-video")).toBe(video);
    expect(player.replaceAsync).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("preview-tag")).toBeNull();
  });

  test("the Preview tag shows on a curved clip", async () => {
    curved();
    await ready();
    expect(screen.getByTestId("preview-tag")).toBeTruthy();
  });
});

describe("constant-speed clips: the rate is written exactly as before", () => {
  // The default project: a (2×, 0–2 s), b (1×, 2–6 s, same file), c (0.5×).
  test("one write on arriving at a clip whose speed differs, none while scrubbing or playing inside it", async () => {
    await render(<PreviewPlayer />);
    await layout();
    await act(() => { player.listeners.statusChange?.({ status: "readyToPlay" }); });
    expect(player.rates).toEqual([2]);
    for (const t of [0.5, 1, 1.9]) await act(() => { useEditorStore.getState().seek(t); });
    expect(player.rates).toEqual([2]);
    await act(() => { useEditorStore.getState().setPlaying(true); });
    player.seeks.length = 0;
    for (const t of [3.9, 3.95]) await act(() => { player.listeners.timeUpdate?.({ currentTime: t }); });
    expect(player.rates).toEqual([2]);
    expect(player.seeks).toEqual([]);
    await act(() => { player.listeners.timeUpdate?.({ currentTime: 4 }); }); // a's end → b (1×), same file
    expect(player.rates).toEqual([2, 1]);
    await act(() => { useEditorStore.getState().setPlaying(false); });
  });

  test("a project at 1× never writes the rate", async () => {
    useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "n", sourceDuration: 4 })] }));
    await render(<PreviewPlayer />);
    await layout();
    await act(() => { player.listeners.statusChange?.({ status: "readyToPlay" }); });
    for (const t of [0.5, 2, 3.5]) await act(() => { useEditorStore.getState().seek(t); });
    await act(() => { useEditorStore.getState().setPlaying(true); });
    await act(() => { player.listeners.timeUpdate?.({ currentTime: 3.7 }); });
    await act(() => { useEditorStore.getState().setPlaying(false); });
    expect(player.rates).toEqual([]);
  });
});
