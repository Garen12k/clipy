import { act, render, renderHook, screen } from "@testing-library/react-native";
import { EFFECT_COLORS, flashOpacity, shakeOffset } from "@/src/editor/model/effectMath";
import { makeClip, makeEffect, makeProject, type EffectItem } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { EffectOverlays, useEffectTransform } from "../components/EffectLayer";

const W = 270, H = 480;
const load = (effects: EffectItem[], playhead: number) => {
  useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })], effects }));
  useEditorStore.getState().seek(playhead);
};

beforeEach(() => { useEditorStore.getState().reset(); });

describe("useEffectTransform", () => {
  test("shake at a known time gives the expected pixel translation and zoom", async () => {
    load([makeEffect({ id: "s", type: "shake", start: 1, end: 3, intensity: 1 })], 1.52);
    const { result } = await renderHook(() => useEffectTransform(W, H));
    const o = shakeOffset(0.52, 2, 1);
    expect(o.x).not.toBe(0);
    expect(result.current).toEqual({ transform: [{ translateX: o.x * W }, { translateY: o.y * H }, { scale: 1.06 }] });
  });

  test("zoom pulse scales without moving", async () => {
    load([makeEffect({ id: "z", type: "zoomPulse", start: 0, end: 2, intensity: 1 })], 0.25);
    const { result } = await renderHook(() => useEffectTransform(W, H));
    expect(result.current?.transform).toEqual([{ translateX: 0 }, { translateY: 0 }, { scale: 1.12 }]);
  });

  test("no effect, an effect elsewhere on the timeline, or a colour-only effect → undefined", async () => {
    load([], 1);
    const { result } = await renderHook(() => useEffectTransform(W, H));
    expect(result.current).toBeUndefined();
    await act(() => { load([makeEffect({ id: "s", type: "shake", start: 4, end: 6 })], 1); });
    expect(result.current).toBeUndefined();
    await act(() => { load([makeEffect({ id: "f", type: "flash", start: 0, end: 2 })], 1); });
    expect(result.current).toBeUndefined();
  });

  test("follows the playhead into and out of the effect", async () => {
    load([makeEffect({ id: "s", type: "shake", start: 4, end: 6, intensity: 1 })], 1);
    const { result } = await renderHook(() => useEffectTransform(W, H));
    expect(result.current).toBeUndefined();
    await act(() => { useEditorStore.getState().seek(5); });
    expect(result.current).toBeDefined();
    await act(() => { useEditorStore.getState().seek(6); }); // end is exclusive
    expect(result.current).toBeUndefined();
  });

  test("no project → undefined", async () => {
    const { result } = await renderHook(() => useEffectTransform(W, H));
    expect(result.current).toBeUndefined();
  });
});

describe("EffectOverlays", () => {
  test("flash renders a white full-frame layer with the expected opacity, without touches", async () => {
    load([makeEffect({ id: "f", type: "flash", start: 1, end: 3, intensity: 0.8 })], 1.05);
    await render(<EffectOverlays />);
    const layer = screen.getByTestId("effect-layer-0");
    expect(layer).toHaveStyle({ position: "absolute", backgroundColor: EFFECT_COLORS.flash, opacity: flashOpacity(1.05 - 1, 0.8) });
    expect(flashOpacity(1.05 - 1, 0.8)).toBeGreaterThan(0);
    expect(screen.getByTestId("effect-overlays").props.pointerEvents).toBe("none");
  });

  test("layers of overlapping effects stack in list order", async () => {
    load([
      makeEffect({ id: "v", type: "vhs", start: 0, end: 4, intensity: 1 }),
      makeEffect({ id: "g", type: "glow", start: 0, end: 4, intensity: 1 }),
    ], 2);
    await render(<EffectOverlays />);
    expect(screen.getByTestId("effect-layer-0")).toHaveStyle({ backgroundColor: EFFECT_COLORS.vhs, opacity: 0.12 });
    expect(screen.getByTestId("effect-layer-1")).toHaveStyle({ backgroundColor: EFFECT_COLORS.glow, opacity: 0.12 });
  });

  test("no effect, an effect elsewhere, or a transform-only effect renders nothing", async () => {
    load([], 1);
    await render(<EffectOverlays />);
    expect(screen.toJSON()).toBeNull();
    await act(() => { load([makeEffect({ id: "f", type: "flash", start: 4, end: 6 })], 1); });
    expect(screen.toJSON()).toBeNull();
    await act(() => { load([makeEffect({ id: "s", type: "shake", start: 0, end: 2 })], 1); });
    expect(screen.toJSON()).toBeNull();
  });
});
