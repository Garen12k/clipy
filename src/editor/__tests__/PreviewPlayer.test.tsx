import { act, fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@/src/editor/components/thumbnails", () => ({ getThumb: jest.fn(async () => "file:///thumb.jpg") }));
// A fake expo-video player that models AVPlayer: assigning a non-zero playbackRate starts playback
// (expo-video's setter does `ref.rate = playbackRate` unconditionally on iOS).
jest.mock("expo-video", () => {
  const { View } = require("react-native");
  let rate = 1;
  let time = 0;
  const listeners: Record<string, (e: unknown) => void> = {};
  const mockPlayer = {
    listeners,
    seeks: [] as number[], // every currentTime write, in order
    playing: false, loop: false, timeUpdateEventInterval: 0, muted: false, audioMixingMode: "auto", volume: 1, preservesPitch: true,
    get currentTime() { return time; },
    set currentTime(v: number) { time = v; mockPlayer.seeks.push(v); },
    get playbackRate() { return rate; },
    set playbackRate(v: number) { rate = v; if (v !== 0) mockPlayer.playing = true; },
    play: jest.fn(() => { mockPlayer.playing = true; }),
    pause: jest.fn(() => { mockPlayer.playing = false; }),
    replaceAsync: jest.fn(async () => {}),
    addListener: jest.fn((event: string, fn: (e: unknown) => void) => { listeners[event] = fn; return { remove: () => {} }; }),
  };
  return { __mockPlayer: mockPlayer, useVideoPlayer: () => mockPlayer, VideoView: View };
});
import { replaceClipMedia, setClipSpeed, setClipTransform } from "@/src/editor/model/ops";
import { makeClip, makePhotoClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { PreviewPlayer } from "../components/PreviewPlayer";

type MockPlayer = { playing: boolean; currentTime: number; seeks: number[]; play: jest.Mock; pause: jest.Mock; replaceAsync: jest.Mock; listeners: Record<string, (e: unknown) => void> };
const player = (jest.requireMock("expo-video") as { __mockPlayer: MockPlayer }).__mockPlayer;
const layout = () => fireEvent(screen.getByLabelText("Preview"), "layout", { nativeEvent: { layout: { width: 270, height: 480 } } });

beforeEach(() => {
  jest.clearAllMocks();
  player.playing = false;
  player.currentTime = 0;
  player.seeks.length = 0;
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
