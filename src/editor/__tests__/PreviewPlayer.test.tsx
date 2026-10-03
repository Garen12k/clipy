import { act, fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@/src/editor/components/thumbnails", () => ({ getThumb: jest.fn(async () => "file:///thumb.jpg") }));
// A fake expo-video player that models AVPlayer: assigning a non-zero playbackRate starts playback
// (expo-video's setter does `ref.rate = playbackRate` unconditionally on iOS).
jest.mock("expo-video", () => {
  const { View } = require("react-native");
  let rate = 1;
  const listeners: Record<string, (e: unknown) => void> = {};
  const mockPlayer = {
    listeners,
    playing: false, loop: false, timeUpdateEventInterval: 0, muted: false, audioMixingMode: "auto", volume: 1, preservesPitch: true, currentTime: 0,
    get playbackRate() { return rate; },
    set playbackRate(v: number) { rate = v; if (v !== 0) mockPlayer.playing = true; },
    play: jest.fn(() => { mockPlayer.playing = true; }),
    pause: jest.fn(() => { mockPlayer.playing = false; }),
    replaceAsync: jest.fn(async () => {}),
    addListener: jest.fn((event: string, fn: (e: unknown) => void) => { listeners[event] = fn; return { remove: () => {} }; }),
  };
  return { __mockPlayer: mockPlayer, useVideoPlayer: () => mockPlayer, VideoView: View };
});
import { setClipSpeed } from "@/src/editor/model/ops";
import { makeClip, makePhotoClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { PreviewPlayer } from "../components/PreviewPlayer";

type MockPlayer = { playing: boolean; play: jest.Mock; pause: jest.Mock; replaceAsync: jest.Mock; listeners: Record<string, (e: unknown) => void> };
const player = (jest.requireMock("expo-video") as { __mockPlayer: MockPlayer }).__mockPlayer;
const layout = () => fireEvent(screen.getByLabelText("Preview"), "layout", { nativeEvent: { layout: { width: 270, height: 480 } } });

beforeEach(() => {
  jest.clearAllMocks();
  player.playing = false;
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
    await act(() => { jest.advanceTimersByTime(500); });
    expect(useEditorStore.getState().playhead).toBeCloseTo(0.5, 5);
    expect(player.play).not.toHaveBeenCalled();
    expect(player.playing).toBe(false);
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
