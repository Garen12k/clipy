import { Profiler } from "react";
import { act, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
// Count every render of a text / sticker, by overlay id (the real components still draw).
const renders = new Map<string, number>();
const count = (id: string) => renders.set(id, (renders.get(id) ?? 0) + 1);
jest.mock("../components/OverlayText", () => {
  const actual = jest.requireActual("../components/OverlayText");
  return { ...actual, OverlayText: (p: { overlay: { id: string }; frameOnly?: boolean }) => { if (!p.frameOnly) count(p.overlay.id); return actual.OverlayText(p); } };
});
jest.mock("../components/StickerView", () => {
  const actual = jest.requireActual("../components/StickerView");
  return { ...actual, StickerView: (p: { sticker: { id: string }; frameOnly?: boolean }) => { if (!p.frameOnly) count(p.sticker.id); return actual.StickerView(p); } };
});
import { makeClip, makeOverlay, makeProject, makeSticker, type Overlay } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { OverlayLayer } from "../components/OverlayLayer";

// What playback costs: a still text sitting on the video renders NOTHING while the playhead moves; an animated one renders on every
// tick inside its In / Out window and on none outside it; and the layer itself does not render per tick (a tick where nothing drawn
// changes commits nothing at all).
const STILL = Array.from({ length: 8 }, (_, i) => makeOverlay({ id: `still${i}`, text: `Still ${i}`, start: 0, end: 10, y: 0.1 + i * 0.1 }));
const ANIM = makeOverlay({ id: "anim", text: "Moves", start: 2, end: 6, animation: { in: { id: "slideUp", duration: 0.5 }, out: { id: "fade", duration: 0.5 }, loop: null } });
const STICKER = makeSticker({ id: "sticker", emoji: "🎉", start: 0, end: 10 });
const TICKS = Array.from({ length: 181 }, (_, k) => k / 20);   // 0 … 9 s, a tick every 0.05 s

async function playThrough(overlays: Overlay[], selected: string | null = null) {
  useEditorStore.getState().reset();
  useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })], overlays }));
  if (selected) useEditorStore.getState().selectOverlay(selected);
  let commits = 0;
  await render(<Profiler id="layer" onRender={() => { commits++; }}><OverlayLayer frameW={300} frameH={533} onOpenPanel={() => {}} /></Profiler>);
  renders.clear();
  const perTick: { t: number; commits: number; anim: number }[] = [];
  for (const t of TICKS.slice(1)) {
    const before = { commits, anim: renders.get("anim") ?? 0 };
    await act(() => { useEditorStore.setState({ playhead: t, isPlaying: true }); });
    perTick.push({ t, commits: commits - before.commits, anim: (renders.get("anim") ?? 0) - before.anim });
  }
  return perTick;
}

beforeEach(() => renders.clear());

test("still texts and a still sticker render 0 times during playback; nothing commits", async () => {
  const ticks = await playThrough([...STILL, STICKER]);
  for (const o of [...STILL, STICKER]) expect(renders.get(o.id) ?? 0).toBe(0);
  expect(ticks.reduce((n, k) => n + k.commits, 0)).toBe(0);
});

test("the same while one of them is selected (its frame stays put)", async () => {
  const ticks = await playThrough([...STILL, STICKER], "still3");
  for (const o of [...STILL, STICKER]) expect(renders.get(o.id) ?? 0).toBe(0);
  expect(ticks.reduce((n, k) => n + k.commits, 0)).toBe(0);
});

test("an animated text renders on every tick inside its In and Out windows and on none outside; the still ones never", async () => {
  const ticks = await playThrough([...STILL, ANIM]);
  for (const o of STILL) expect(renders.get(o.id) ?? 0).toBe(0);
  const inWindow = (t: number) => (t > 2 && t <= 2.5) || (t > 5.5 && t < 6);
  for (const k of ticks) {
    // t = 2: it appears (mounted, its first render); t = 6: it goes (unmounted, no render).
    const expected = k.t === 2 ? 1 : inWindow(k.t) ? 1 : 0;
    expect({ t: k.t, anim: k.anim }).toEqual({ t: k.t, anim: expected });
    // A tick that changes nothing drawn commits nothing: neither the layer nor any overlay rendered.
    if (!inWindow(k.t) && k.t !== 2 && k.t !== 6) expect({ t: k.t, commits: k.commits }).toEqual({ t: k.t, commits: 0 });
  }
});

test("a double tap on the frame opens the panel through the LATEST onOpenPanel, though the layer was not drawn again", async () => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })], overlays: STILL }));
  useEditorStore.getState().selectOverlay("still0");
  const first = jest.fn(), second = jest.fn();
  const view = await render(<OverlayLayer frameW={300} frameH={533} onOpenPanel={first} />);
  await view.rerender(<OverlayLayer frameW={300} frameH={533} onOpenPanel={second} />);
  type Mock = { handlers: Record<string, () => void>; gestures?: Mock[] };
  const composed = view.getByTestId("selection-frame-still0").props.gesture as Mock;
  await act(async () => { composed.gestures![0].handlers.onEnd(); });
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledWith("still0");
});

test("an edit, a selection and a move of a still text draw it at once, while paused or playing", async () => {
  await playThrough(STILL);
  renders.clear();
  await act(() => { useEditorStore.getState().selectOverlay("still2"); });
  expect(renders.get("still2")).toBe(1);
  expect(renders.get("still1") ?? 0).toBe(0);
  await act(() => { useEditorStore.getState().apply((p) => ({ ...p, overlays: p.overlays.map((o) => (o.id === "still2" ? { ...o, x: 0.25 } : o)) })); });
  expect(renders.get("still2")).toBe(2);
  expect(screen.getByTestId("overlay-still2")).toHaveStyle({ left: 75 });
});
