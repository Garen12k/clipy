import { act, render } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
// A fake expo-video player that models AVPlayer: assigning a non-zero playbackRate starts playback
// (expo-video's setter does `ref.rate = playbackRate` unconditionally on iOS).
jest.mock("expo-video", () => {
  const { View } = require("react-native");
  let rate = 1;
  const mockPlayer = {
    playing: false, loop: false, timeUpdateEventInterval: 0, muted: false, audioMixingMode: "auto", volume: 1, preservesPitch: true, currentTime: 0,
    get playbackRate() { return rate; },
    set playbackRate(v: number) { rate = v; if (v !== 0) mockPlayer.playing = true; },
    play: jest.fn(() => { mockPlayer.playing = true; }),
    pause: jest.fn(() => { mockPlayer.playing = false; }),
    replaceAsync: jest.fn(async () => {}),
    addListener: jest.fn(() => ({ remove: () => {} })),
  };
  return { __mockPlayer: mockPlayer, useVideoPlayer: () => mockPlayer, VideoView: View };
});
import { setClipSpeed } from "@/src/editor/model/ops";
import { makeClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { PreviewPlayer } from "../components/PreviewPlayer";

const player = (jest.requireMock("expo-video") as { __mockPlayer: { playing: boolean; play: jest.Mock; pause: jest.Mock } }).__mockPlayer;

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
