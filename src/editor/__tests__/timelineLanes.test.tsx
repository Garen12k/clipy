import { fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { makeAudioTrack, makeClip, makeEffect, makeOverlay, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { MusicLane } from "../components/MusicLane";
import { OverlayLane } from "../components/OverlayLane";

const p = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })],
  overlays: [makeOverlay({ id: "o1", text: "Hello", start: 2, end: 5 })],
  audioTracks: [makeAudioTrack({ id: "m", title: "Song", sourceDuration: 30, start: 1, trimStart: 0, trimEnd: 4 })] });
beforeEach(() => { useEditorStore.getState().reset(); useEditorStore.getState().setProject(p); useEditorStore.getState().setZoom(50); });

test("overlay pill is placed by time and selects on press", async () => {
  await render(<OverlayLane />);
  const pill = screen.getByTestId("overlay-pill-o1");
  expect(pill).toHaveStyle({ left: 100, width: 150 });
  expect(screen.getByText("Hello")).toBeTruthy();
  await fireEvent.press(pill);
  expect(useEditorStore.getState().selectedOverlayId).toBe("o1");
});

test("music bar is placed by start and trimmed length", async () => {
  await render(<MusicLane />);
  expect(screen.getByTestId("music-bar")).toHaveStyle({ left: 50, width: 200 });
  expect(screen.getByText("Song")).toBeTruthy();
});

test("tapping the music bar deselects a selected effect", async () => {
  useEditorStore.getState().setProject({ ...p, effects: [makeEffect({ id: "e1", start: 1, end: 3 })] });
  useEditorStore.getState().selectEffect("e1");
  await render(<MusicLane />);
  await fireEvent.press(screen.getByTestId("music-bar"));
  expect(useEditorStore.getState().selectedEffectId).toBeNull();
});
