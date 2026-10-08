// The layers' player can say when it has actually PRESENTED a frame of the file it was last handed (`onShown`): the main clip's
// follower needs that, a layer does not ask.
jest.mock("expo-video", () => {
  const { View } = require("react-native");
  const { useState } = require("react");
  const listeners: Record<string, (e: unknown) => void> = {};
  const mockPlayer = {
    listeners, currentTime: 0, playbackRate: 1, volume: 1, muted: false, loop: false, audioMixingMode: "auto", preservesPitch: true,
    play: jest.fn(), pause: jest.fn(), replaceAsync: jest.fn(async () => {}),
    addListener: jest.fn((event: string, fn: (e: unknown) => void) => { listeners[event] = fn; return { remove: () => {} }; }),
  };
  return { __mockPlayer: mockPlayer, useVideoPlayer: (_s: unknown, setup?: (p: unknown) => void) => useState(() => { setup?.({}); return mockPlayer; })[0], VideoView: View };
});
import { act, render, screen } from "@testing-library/react-native";
import { makeLayer } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { LayerVideo, SHOWN_DEADLINE_MS } from "../components/LayerVideo";

const player = (jest.requireMock("expo-video") as { __mockPlayer: { listeners: Record<string, (e: unknown) => void>; replaceAsync: jest.Mock } }).__mockPlayer;
const A = "file:///copies/a.mov", B = "file:///copies/b.mov";
const layer = (uri: string) => makeLayer({ id: "L", sourceDuration: 6, sourceUri: uri });
const status = (s: string) => act(() => { player.listeners.statusChange({ status: s }); });
const firstFrame = () => act(() => { screen.getByTestId("layer-video-L").props.onFirstFrameRender(); });

beforeEach(() => { useEditorStore.getState().reset(); jest.clearAllMocks(); });

test("a file is reported shown only once it is ready AND the view has rendered its first frame — never on load, never on ready alone", async () => {
  const onShown = jest.fn();
  await render(<LayerVideo layer={layer(A)} offset={0} onShown={onShown} />);
  expect(player.replaceAsync).toHaveBeenCalledWith({ uri: A });
  expect(onShown).not.toHaveBeenCalled();
  await status("loading");
  await status("readyToPlay");
  expect(onShown).not.toHaveBeenCalled();                                   // ready to play is not yet a picture
  await firstFrame();
  expect(onShown).toHaveBeenCalledTimes(1);
  expect(onShown).toHaveBeenLastCalledWith(A);
});

test("the two signals in the other order: the frame first, then ready", async () => {
  const onShown = jest.fn();
  await render(<LayerVideo layer={layer(A)} offset={0} onShown={onShown} />);
  await firstFrame();
  expect(onShown).not.toHaveBeenCalled();
  await status("readyToPlay");
  expect(onShown).toHaveBeenLastCalledWith(A);
});

test("handed another file, nothing is reported for it until THAT file is ready and has rendered a frame", async () => {
  const onShown = jest.fn();
  const view = await render(<LayerVideo layer={layer(A)} offset={0} onShown={onShown} />);
  await status("readyToPlay");
  await firstFrame();
  onShown.mockClear();
  await view.rerender(<LayerVideo layer={layer(B)} offset={0} onShown={onShown} />);
  expect(player.replaceAsync).toHaveBeenLastCalledWith({ uri: B });
  expect(onShown).not.toHaveBeenCalled();
  await status("loading");
  await status("readyToPlay");
  expect(onShown).not.toHaveBeenCalled();                                   // the frame seen so far was the old file's
  await firstFrame();
  expect(onShown).toHaveBeenCalledTimes(1);
  expect(onShown).toHaveBeenLastCalledWith(B);
});

test("a re-render that changes nothing for the player (the playhead moving) reports nothing again", async () => {
  const onShown = jest.fn();
  const view = await render(<LayerVideo layer={layer(A)} offset={0} onShown={onShown} />);
  await status("readyToPlay");
  await firstFrame();
  await view.rerender(<LayerVideo layer={layer(A)} offset={1.5} onShown={onShown} />);
  await view.rerender(<LayerVideo layer={layer(A)} offset={2.5} onShown={onShown} />);
  expect(onShown).toHaveBeenCalledTimes(1);
});

describe("the deadline: a first-frame report that never comes must not hold the copy back for ever", () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });
  const pass = (ms: number) => act(() => { jest.advanceTimersByTime(ms); });

  test("ready and no first frame: counted as shown once SHOWN_DEADLINE_MS has passed since ready — not before, and only once", async () => {
    const onShown = jest.fn();
    await render(<LayerVideo layer={layer(A)} offset={0} onShown={onShown} />);
    await pass(5000);
    expect(onShown).not.toHaveBeenCalled();                                 // the clock starts at ready, not at load
    await status("readyToPlay");
    await pass(SHOWN_DEADLINE_MS - 1);
    expect(onShown).not.toHaveBeenCalled();
    await pass(1);
    expect(onShown).toHaveBeenCalledTimes(1);
    expect(onShown).toHaveBeenLastCalledWith(A);
    await pass(5000);
    expect(onShown).toHaveBeenCalledTimes(1);
  });

  test("another file before the deadline: the old file's timer does nothing, and the new file gets a deadline of its own from ITS ready", async () => {
    const onShown = jest.fn();
    const view = await render(<LayerVideo layer={layer(A)} offset={0} onShown={onShown} />);
    await status("readyToPlay");
    await pass(SHOWN_DEADLINE_MS - 100);
    await view.rerender(<LayerVideo layer={layer(B)} offset={0} onShown={onShown} />);
    await pass(5000);
    expect(onShown).not.toHaveBeenCalled();                                 // neither A (replaced) nor B (not ready yet)
    await status("readyToPlay");
    await pass(SHOWN_DEADLINE_MS - 1);
    expect(onShown).not.toHaveBeenCalled();
    await pass(1);
    expect(onShown).toHaveBeenCalledTimes(1);
    expect(onShown).toHaveBeenLastCalledWith(B);
  });

  test("the first frame before the deadline: shown at once, and the timer is cleared", async () => {
    const onShown = jest.fn();
    await render(<LayerVideo layer={layer(A)} offset={0} onShown={onShown} />);
    await status("readyToPlay");
    await pass(100);
    await firstFrame();
    expect(onShown).toHaveBeenCalledTimes(1);
    await pass(5000);
    expect(onShown).toHaveBeenCalledTimes(1);                               // a timer left running would have reported again
  });

  test("unmounted before the deadline: nothing is reported afterwards", async () => {
    const onShown = jest.fn();
    const view = await render(<LayerVideo layer={layer(A)} offset={0} onShown={onShown} />);
    await status("readyToPlay");
    await view.unmount();
    await pass(5000);
    expect(onShown).not.toHaveBeenCalled();
  });

  test("a layer (nobody asks) starts no timer", async () => {
    const timers = jest.spyOn(globalThis, "setTimeout");
    await render(<LayerVideo layer={layer(A)} offset={0} />);
    await status("readyToPlay");
    expect(timers.mock.calls.filter(([, ms]) => ms === SHOWN_DEADLINE_MS)).toEqual([]);
    timers.mockRestore();
  });
});

test("a layer (nobody asks): the view is handed no first-frame handler at all — exactly as it always was", async () => {
  await render(<LayerVideo layer={layer(A)} offset={0} />);
  expect("onFirstFrameRender" in screen.getByTestId("layer-video-L").props).toBe(false);
  await status("readyToPlay");                                              // and ready still only syncs the player
});
