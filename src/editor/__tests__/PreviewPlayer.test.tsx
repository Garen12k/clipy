import { act, fireEvent, render, screen } from "@testing-library/react-native";
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
import { replaceClipMedia, setClipAnimation, setClipReversed, setClipSpeed, setClipSpeedCurve, setClipTransform } from "@/src/editor/model/ops";
import { StyleSheet } from "react-native";
import { FILTERS } from "@/src/editor/effects";
import { shakeOffset } from "@/src/editor/model/effectMath";
import { DEFAULT_ADJUST, makeClip, makeEffect, makeOverlay, makePhotoClip, makeProject, type Clip } from "@/src/editor/model/types";
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

  test("the layers stack in order: picture → filter → adjust → effect colours → transition → text", async () => {
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
    const order = ["effect-transform", "preview-video", "filter-tint", "adjust-light", "adjust-vignette", "effect-layer-0", "transition-layer", "overlay-t", "preview-tag"];
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
