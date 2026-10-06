import { act, fireEvent, render, renderHook, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { burnOpacity, EFFECT, EFFECT_COLORS, flareOpacity, flareX, flashOpacity, heartbeatScale, shakeOffset } from "@/src/editor/model/effectMath";
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

describe("the eight effects of 2026-10-06 in the preview", () => {
  const layout = async (width: number) => { await fireEvent(screen.getByTestId("effect-overlays"), "layout", { nativeEvent: { layout: { x: 0, y: 0, width, height: H } } }); };
  const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style);

  test("heartbeat scales the picture by the export's number; strobe is a black layer that switches on and off", async () => {
    load([makeEffect({ id: "h", type: "heartbeat", start: 0, end: 4, intensity: 1 })], 0.88);
    const { result } = await renderHook(() => useEffectTransform(W, H));
    expect(result.current).toEqual({ transform: [{ translateX: 0 }, { translateY: 0 }, { scale: heartbeatScale(0.88, 4, 1) }] });
    expect(heartbeatScale(0.88, 4, 1)).toBeCloseTo(1.1, 9);
    await render(<EffectOverlays />);
    await act(() => { load([makeEffect({ id: "s", type: "strobe", start: 0, end: 4, intensity: 0.8 })], 0.1); });
    expect(screen.getByTestId("effect-layer-0")).toHaveStyle({ backgroundColor: EFFECT_COLORS.strobe, opacity: 0.8 });
    await act(() => { useEditorStore.getState().seek(0.25); });      // the clear part of the period
    expect(screen.toJSON()).toBeNull();
  });

  test("film burn: a gradient from the left edge over 70 % of the width, in the burn colour, at the computed opacity", async () => {
    load([makeEffect({ id: "b", type: "filmBurn", start: 0, end: 4, intensity: 1 })], 0.625);
    await render(<EffectOverlays />);
    const burn = screen.getByTestId("effect-shape-0");
    expect(flat("effect-shape-0")).toMatchObject({ position: "absolute", left: 0, top: 0, bottom: 0, width: "70%", opacity: burnOpacity(0.625, 4, 1) });
    expect(burn.props.colors).toEqual([EFFECT_COLORS.filmBurn, `${EFFECT_COLORS.filmBurn}00`]);
    expect(screen.getByTestId("effect-overlays").props.pointerEvents).toBe("none");
  });

  test("lens flare: nothing until the frame is measured, then a band 40 % wide whose centre is at flareX, moved by transform only", async () => {
    load([makeEffect({ id: "f", type: "lensFlare", start: 0, end: 4, intensity: 1 })], 1);
    await render(<EffectOverlays />);
    expect(screen.queryByTestId("effect-shape-0")).toBeNull();
    await layout(W);
    const band = 0.4 * W;
    expect(band).toBeCloseTo(108, 9);
    expect(flat("effect-shape-0")).toMatchObject({ left: 0, width: band, opacity: flareOpacity(1, 4, 1), transform: [{ translateX: flareX(1) * W - band / 2 }] });
    expect(flareX(1) * W - band / 2).toBeCloseTo(81, 9);
    expect(screen.getByTestId("effect-shape-0").props.colors).toEqual([`${EFFECT_COLORS.lensFlare}00`, EFFECT_COLORS.lensFlare, `${EFFECT_COLORS.lensFlare}00`]);
    await act(() => { useEditorStore.getState().seek(1.5); });
    expect(flat("effect-shape-0")).toMatchObject({ left: 0, width: band, transform: [{ translateX: flareX(1.5) * W - band / 2 }] });
  });

  test("soft edges: four pale strips, one per edge, under one opacity", async () => {
    load([makeEffect({ id: "e", type: "softEdges", start: 0, end: 4, intensity: 0.7 })], 1);
    await render(<EffectOverlays />);
    expect(flat("effect-shape-0").opacity).toBeCloseTo(EFFECT.edgeVeil * 0.7, 9);
    for (const edge of ["top", "bottom", "left", "right"]) expect(screen.getByTestId(`effect-shape-0-${edge}`).props.colors).toEqual([EFFECT_COLORS.softEdges, `${EFFECT_COLORS.softEdges}00`]);
  });

  test("dust: thin lines at the export's places, once the frame is measured", async () => {
    load([makeEffect({ id: "d", type: "dust", start: 0, end: 4, intensity: 1 })], 1);
    await render(<EffectOverlays />);
    await layout(W);
    expect(flat("effect-shape-0")).toMatchObject({ left: 0, top: 0, bottom: 0, width: 2, backgroundColor: EFFECT_COLORS.dust, opacity: 0.5 });
    expect(flat("effect-shape-0").transform[0].translateX).toBeCloseTo(0.4702766282589437 * W, 6);
    expect(flat("effect-shape-1").transform[0].translateX).toBeCloseTo(0.8728999602171825 * W, 6);
    expect(screen.queryByTestId("effect-shape-2")).toBeNull();
  });

  test("hue shift and mirror draw nothing (tag only)", async () => {
    load([makeEffect({ id: "m", type: "mirror", start: 0, end: 4 }), makeEffect({ id: "u", type: "hueShift", start: 0, end: 4 })], 1);
    await render(<EffectOverlays />);
    expect(screen.toJSON()).toBeNull();
  });

  test("layers come first, shapes after them, in list order", async () => {
    load([makeEffect({ id: "b", type: "filmBurn", start: 0, end: 4, intensity: 1 }), makeEffect({ id: "g", type: "glow", start: 0, end: 4, intensity: 1 })], 0.625);
    await render(<EffectOverlays />);
    const ids = screen.getByTestId("effect-overlays").children.map((c) => (typeof c === "string" ? c : c.props.testID));
    expect(ids).toEqual(["effect-layer-0", "effect-shape-0"]);
  });

  test("a shape is keyed by its kind and its place among that kind: a scratch coming or going leaves the burn's view mounted", async () => {
    // The element EffectOverlays returns, read through a component that calls it (its hooks become this component's).
    let drawn: ReturnType<typeof EffectOverlays> = null;
    const Probe = () => { drawn = EffectOverlays(); return drawn; };
    const keys = () => (drawn!.props.children as { key: string }[][]).map((list) => list.map((e) => e.key));
    load([
      makeEffect({ id: "v", type: "vhs", start: 0, end: 4, intensity: 1 }),
      makeEffect({ id: "d", type: "dust", start: 0, end: 4, intensity: 1 }),
      makeEffect({ id: "b", type: "filmBurn", start: 0, end: 4, intensity: 1 }),
    ], 1.04);                                                        // film frame 12: both scratches
    await render(<Probe />);
    expect(keys()).toEqual([["l0"], ["scratch0", "scratch1", "burn0"]]);
    await act(() => { useEditorStore.getState().seek(1.12); });      // frame 13: one scratch
    expect(keys()).toEqual([["l0"], ["scratch0", "burn0"]]);
    await act(() => { useEditorStore.getState().seek(2.04); });      // frame 24: none
    expect(keys()).toEqual([["l0"], ["burn0"]]);
    // The test ids are the running index they always were.
    expect(screen.getByTestId("effect-overlays").children.map((c) => (typeof c === "string" ? c : c.props.testID))).toEqual(["effect-layer-0", "effect-shape-0"]);
  });
});
