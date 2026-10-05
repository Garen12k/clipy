import { fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-05T10:00:00.000Z" }));
jest.mock("@/src/editor/components/thumbnails", () => ({ getThumb: jest.fn(async () => "file:///thumb.jpg") }));
let mockVideoMounts = 0;
jest.mock("expo-video", () => {
  const { View } = require("react-native");
  const { useEffect, useState } = require("react");
  const make = () => ({ playing: false, loop: false, muted: false, volume: 1, currentTime: 0, playbackRate: 1, timeUpdateEventInterval: 0, audioMixingMode: "auto", preservesPitch: true,
    play: jest.fn(), pause: jest.fn(), replaceAsync: jest.fn(async () => {}), addListener: jest.fn(() => ({ remove: () => {} })) });
  const VideoView = (props: object) => { useEffect(() => { mockVideoMounts++; }, []); return <View {...props} />; };
  return { useVideoPlayer: (_source: unknown, setup?: (p: unknown) => void) => useState(() => { const p = make(); setup?.(p); return p; })[0], VideoView };
});
import { makeClip, makeOverlay, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { PreviewPlayer } from "../components/PreviewPlayer";

const layout = (width: number, height: number) => fireEvent(screen.getByLabelText("Preview"), "layout", { nativeEvent: { layout: { width, height } } });

test("a resize of the preview keeps the one VideoView mounted and lays the overlays out at the new size", async () => {
  mockVideoMounts = 0;
  useEditorStore.getState().reset();
  useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 })], overlays: [makeOverlay({ id: "t", text: "Hi", start: 0, end: 3 })] }));
  await render(<PreviewPlayer />);
  await layout(270, 480);
  const video = screen.getByTestId("preview-video");
  expect(screen.getByText("Hi")).toBeTruthy();
  await layout(135, 240);          // a tall panel opened: the frame is half the size
  expect(screen.getByTestId("preview-video")).toBe(video);
  await layout(270, 480);          // and closed again
  expect(screen.getByTestId("preview-video")).toBe(video);
  expect(screen.getByText("Hi")).toBeTruthy();
  expect(mockVideoMounts).toBe(1);
});
