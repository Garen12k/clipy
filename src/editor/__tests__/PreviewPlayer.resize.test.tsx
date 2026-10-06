import { act, fireEvent, render, screen } from "@testing-library/react-native";
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
import { setAspectRatio } from "@/src/editor/model/ops";
import { frameSize } from "@/src/editor/model/overlayLayout";
import { makeClip, makeOverlay, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
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

test("changing the ratio reshapes the frame (Auto = the first clip's shape) and never remounts the VideoView", async () => {
  mockVideoMounts = 0;
  useEditorStore.getState().reset();
  useEditorStore.getState().setProject(makeProject({ aspectRatio: "auto", clips: [makeClip({ id: "a", sourceDuration: 4, width: 1920, height: 1080 }), makeClip({ id: "b", sourceDuration: 4 })] }));
  await render(<PreviewPlayer />);
  await layout(480, 270);
  const video = screen.getByTestId("preview-video");
  expect(screen.getByLabelText("Preview")).toHaveStyle({ aspectRatio: 1920 / 1080 });
  for (const [id, value] of [["21:9", 21 / 9], ["2:3", 2 / 3], ["3:4", 3 / 4], ["auto", 16 / 9]] as const) {
    await act(() => { useEditorStore.getState().apply((p) => setAspectRatio(p, id)); });
    expect(screen.getByLabelText("Preview")).toHaveStyle({ aspectRatio: value });
    expect(screen.getByTestId("preview-video")).toBe(video);
  }
  expect(mockVideoMounts).toBe(1);
});

/** The slot the editor gives the preview (the padded container around the frame — the frame's parent) is laid out at this size. */
const slotLayout = (width: number, height: number) => fireEvent(screen.getByLabelText("Preview").parent!, "layout", { nativeEvent: { layout: { width, height } } });
const PAD = theme.space.xs;
const frameStyle = () => { const { width, height } = screen.getByLabelText("Preview").props.style as { width?: number; height?: number }; return { w: width, h: height }; };
const RATIOS = [["9:16", 9 / 16], ["1:1", 1], ["16:9", 16 / 9], ["21:9", 21 / 9], ["auto", 1920 / 1080]] as const;
const landscape = () => makeProject({ aspectRatio: "auto", clips: [makeClip({ id: "a", sourceDuration: 4, width: 1920, height: 1080 })] });

test("before the slot is measured the frame is what it always was: the ratio, growing into the slot", async () => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setProject(landscape());
  await render(<PreviewPlayer />);
  expect(screen.getByLabelText("Preview")).toHaveStyle({ aspectRatio: 1920 / 1080, flex: 1, maxWidth: "100%", maxHeight: "100%" });
  expect(frameStyle()).toEqual({ w: undefined, h: undefined });
  expect(screen.queryByTestId("preview-video")).toBeNull();
});

test("in a measured slot the frame is exactly the project's shape: the largest box of the ratio inside the slot's margin", async () => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setProject(landscape());
  await render(<PreviewPlayer />);
  // A tall slot (393 × 445: clips only), a shorter one (three lanes) and a wide, short one.
  const expected: Record<string, { w: number; h: number }[]> = {
    "9:16": [{ w: 245.8125, h: 437 }, { w: 191.8125, h: 341 }, { w: 108, h: 192 }],
    "1:1": [{ w: 385, h: 385 }, { w: 341, h: 341 }, { w: 192, h: 192 }],
    "16:9": [{ w: 385, h: 216.5625 }, { w: 385, h: 216.5625 }, { w: 341.3333, h: 192 }],
    "21:9": [{ w: 385, h: 165 }, { w: 385, h: 165 }, { w: 448, h: 192 }],
    auto: [{ w: 385, h: 216.5625 }, { w: 385, h: 216.5625 }, { w: 341.3333, h: 192 }],
  };
  for (const [id, ratio] of RATIOS) {
    await act(() => { useEditorStore.getState().apply((p) => setAspectRatio(p, id)); });
    const slots = [[393, 445], [393, 349], [700, 200]] as const;
    for (let i = 0; i < slots.length; i++) {
      const [w, h] = slots[i];
      await slotLayout(w, h);
      expect(frameStyle()).toEqual(expected[id][i]);
      expect(frameStyle()).toEqual(frameSize(ratio, w - 2 * PAD, h - 2 * PAD));
      // Exactly the shape, and inside the margin on every side.
      expect(frameStyle().w! / frameStyle().h!).toBeCloseTo(ratio, 3);
      expect(frameStyle().w!).toBeLessThanOrEqual(w - 2 * PAD);
      expect(frameStyle().h!).toBeLessThanOrEqual(h - 2 * PAD);
      // The size is explicit: nothing is left for the layout engine to derive from the ratio.
      expect(screen.getByLabelText("Preview").props.style).not.toHaveProperty("aspectRatio");
      expect(screen.getByLabelText("Preview").props.style).not.toHaveProperty("flex");
    }
  }
});

test("a slot with no room falls back to the ratio style instead of a 0 × 0 frame", async () => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setProject(landscape());
  await render(<PreviewPlayer />);
  await slotLayout(393, 445);
  expect(frameStyle()).toEqual({ w: 385, h: 216.5625 });
  await slotLayout(393, 2 * PAD);
  expect(frameStyle()).toEqual({ w: undefined, h: undefined });
  expect(screen.getByLabelText("Preview")).toHaveStyle({ aspectRatio: 1920 / 1080, flex: 1 });
});

test("a ratio change and a slot resize keep the one VideoView: same instance, mounted once", async () => {
  mockVideoMounts = 0;
  useEditorStore.getState().reset();
  useEditorStore.getState().setProject(landscape());
  await render(<PreviewPlayer />);
  await slotLayout(393, 445);
  await layout(385, 216.5625);       // the frame reports the size it was given
  const video = screen.getByTestId("preview-video");
  for (const [id, ratio] of RATIOS) {
    await act(() => { useEditorStore.getState().apply((p) => setAspectRatio(p, id)); });
    expect(screen.getByTestId("preview-video")).toBe(video);
    for (const [w, h] of [[393, 349], [700, 200], [393, 445]] as const) {
      await slotLayout(w, h);
      expect(screen.getByTestId("preview-video")).toBe(video);
      const f = frameSize(ratio, w - 2 * PAD, h - 2 * PAD);
      await layout(f.w, f.h);
      expect(screen.getByTestId("preview-video")).toBe(video);
    }
  }
  expect(mockVideoMounts).toBe(1);
});
