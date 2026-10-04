import { act, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import * as Haptics from "expo-haptics";
import { StyleSheet } from "react-native";
import { fitScale, placeClip } from "@/src/editor/model/clipLayout";
import { setClipTransform } from "@/src/editor/model/ops";
import { DEFAULT_TRANSFORM, makeClip, makeLayer, makeOverlay, makeProject, type LayerClip } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { ClipGestures, createClipGestureSession } from "../components/ClipGestures";

const W = 270, H = 480;
const project = () => makeProject({
  clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 4, width: 1920, height: 1080 })],
  overlays: [makeOverlay({ id: "o1", text: "Hi", start: 0, end: 8 })],
});
const store = () => useEditorStore.getState();
const tf = (id = "a") => store().project!.clips.find((c) => c.id === id)!.transform;

beforeEach(() => {
  jest.clearAllMocks();
  store().reset();
  store().setProject(project());
});

describe("ClipGestures frame", () => {
  test("selecting the clip under the playhead shows a gold frame placed like the picture", async () => {
    store().apply((p) => setClipTransform(p, "a", { scale: 0.5, x: 0.1, rotation: 30 }));
    store().select("a");
    await render(<ClipGestures frameW={W} frameH={H} />);
    const frame = screen.getByTestId("clip-selection-frame");
    const c = store().project!.clips[0];
    const placed = placeClip({ width: c.width, height: c.height }, c.crop, c.transform, W, H);
    expect(frame).toHaveStyle({
      left: placed.centerX - placed.width / 2, top: placed.centerY - placed.height / 2, width: placed.width, height: placed.height,
      borderColor: theme.colors.accent, transform: [{ rotate: "30deg" }],
    });
    expect(frame.props.pointerEvents).toBe("none");
    expect(screen.getByTestId("clip-gesture-area")).toBeTruthy();
  });

  test("a pan driven through the rendered gesture moves the clip by the dragged fraction, as one undo step", async () => {
    store().select("a");
    await render(<ClipGestures frameW={W} frameH={H} />);
    type Mock = { handlers: Record<string, (...a: unknown[]) => void>; gestures?: Mock[] };
    const composed = screen.getByTestId("clip-gesture-area").props.gesture as Mock;
    const [pan, pinch, rotate] = composed.gestures!;
    expect(pinch.handlers.onUpdate).toBeDefined();
    expect(rotate.handlers.onUpdate).toBeDefined();
    await act(() => {
      pan.handlers.onBegin({});
      pan.handlers.onStart({ translationX: 0, translationY: 0 });
      pan.handlers.onUpdate({ translationX: 54, translationY: -48 });
      pan.handlers.onFinalize({}, true);
    });
    expect(tf().x).toBeCloseTo(54 / W, 10);
    expect(tf().y).toBeCloseTo(-48 / H, 10);
    expect(store().past).toHaveLength(1);
    // The gold frame follows the moved picture.
    expect(screen.getByTestId("clip-selection-frame")).toHaveStyle({ left: 54 });
  });

  test("nothing when no clip is selected", async () => {
    await render(<ClipGestures frameW={W} frameH={H} />);
    expect(screen.queryByTestId("clip-selection-frame")).toBeNull();
    expect(screen.queryByTestId("clip-gesture-area")).toBeNull();
  });

  test("nothing when an overlay is selected", async () => {
    useEditorStore.setState({ selectedClipId: "a", selectedOverlayId: "o1" });
    await render(<ClipGestures frameW={W} frameH={H} />);
    expect(screen.queryByTestId("clip-selection-frame")).toBeNull();
    expect(screen.queryByTestId("clip-gesture-area")).toBeNull();
  });

  test("nothing when the selected clip is not under the playhead", async () => {
    store().select("b");
    store().seek(1); // on clip a
    await render(<ClipGestures frameW={W} frameH={H} />);
    expect(screen.queryByTestId("clip-selection-frame")).toBeNull();
    expect(screen.queryByTestId("clip-gesture-area")).toBeNull();
  });
});

describe("createClipGestureSession", () => {
  test("pan + pinch + twist in one touch sequence make one undo step", () => {
    const s = createClipGestureSession("a", W, H);
    s.start("pan"); s.update("pan", { dx: 54, dy: 0 });
    s.start("pinch"); s.update("pinch", { scale: 1.5 });
    s.start("rotate"); s.update("rotate", { rotation: 0.5 });
    s.finish("rotate"); s.finish("pinch"); s.finish("pan");
    expect(tf()).toMatchObject({ scale: 1.5 });
    expect(tf().x).toBeCloseTo(0.2, 10);
    expect(tf().rotation).toBeCloseTo((0.5 * 180) / Math.PI, 10);
    expect(store().past).toHaveLength(1);
    store().undo();
    expect(tf()).toEqual(DEFAULT_TRANSFORM);
  });

  test("the result does not depend on which gesture updates first", () => {
    const run = (order: Array<"pan" | "pinch">) => {
      store().setProject(project());
      const s = createClipGestureSession("a", W, H);
      for (const k of order) s.start(k);
      for (const k of order) s.update(k, k === "pan" ? { dx: 81, dy: -48 } : { scale: 1.8 });
      return tf();
    };
    expect(run(["pinch", "pan"])).toEqual(run(["pan", "pinch"]));
  });

  test("each update recomposes from the snapshot: no drift across many updates", () => {
    const s = createClipGestureSession("a", W, H);
    s.start("pan");
    for (const dx of [10, 20, 30, 40, 54]) s.update("pan", { dx, dy: 0 });
    expect(tf().x).toBeCloseTo(0.2, 10);
  });

  test("a gesture that changes nothing leaves no undo step", () => {
    const s = createClipGestureSession("a", W, H);
    s.start("pan"); s.update("pan", { dx: 1, dy: 0 }); // inside the centre magnet: snaps back to 0
    s.start("pinch"); s.update("pinch", { scale: 1.01 }); // inside the Fill magnet
    s.finish("pan"); s.finish("pinch");
    expect(tf()).toEqual(DEFAULT_TRANSFORM);
    expect(store().past).toHaveLength(0);
  });

  test("snapping does not stick: moving past the magnet releases it", () => {
    store().apply((p) => setClipTransform(p, "a", { x: 0.2 }));
    const s = createClipGestureSession("a", W, H);
    s.start("pan");
    s.update("pan", { dx: -52, dy: 0 }); // raw x ≈ 0.007 → snaps to 0
    expect(tf().x).toBe(0);
    s.update("pan", { dx: -70, dy: 0 }); // raw x ≈ −0.059 → free
    expect(tf().x).toBeCloseTo(0.2 - 70 / W, 10);
  });

  test("a light haptic fires once each time a magnet newly engages, not for one already resting", () => {
    const impact = Haptics.impactAsync as jest.Mock;
    const s = createClipGestureSession("a", W, H);
    s.start("pan");
    s.update("pan", { dx: 2, dy: 0 }); // the centred clip already sits on the x and y magnets
    expect(impact).not.toHaveBeenCalled();
    s.update("pan", { dx: 40, dy: 0 }); // leaves the x magnet
    s.update("pan", { dx: 3, dy: 0 }); // x engages
    s.update("pan", { dx: 1, dy: 0 }); // still engaged
    expect(impact).toHaveBeenCalledTimes(1);
    s.start("rotate");
    s.update("rotate", { rotation: 0.2 }); // leaves the rotation magnet
    s.update("rotate", { rotation: 0.02 }); // ≈1.1° → rotation engages
    expect(impact).toHaveBeenCalledTimes(2);
  });

  test("no haptic for a magnet the picture never left (centred clip dragged straight down, then nudged sideways)", () => {
    const impact = Haptics.impactAsync as jest.Mock;
    const s = createClipGestureSession("a", W, H);
    s.start("pan");
    s.update("pan", { dx: 0, dy: 100 });
    s.update("pan", { dx: 2, dy: 100 });
    expect(impact).not.toHaveBeenCalled();
  });

  test("a gesture that ends mid-sequence keeps its contribution when another starts", () => {
    const s = createClipGestureSession("a", W, H);
    s.start("pinch"); s.update("pinch", { scale: 2 });
    s.start("pan"); s.update("pan", { dx: 54, dy: 0 });
    s.finish("pan"); // one finger lifts: pan ends while the pinch goes on
    s.update("pinch", { scale: 2 });
    expect(tf().x).toBeCloseTo(0.2, 10);
    s.start("pan"); s.update("pan", { dx: 27, dy: 0 }); // a fresh pan starts from zero translation
    expect(tf().x).toBeCloseTo(0.3, 10);
    expect(tf().scale).toBe(2);
    s.finish("pan"); s.finish("pinch");
    expect(store().past).toHaveLength(1);
  });

  test("a new touch sequence snapshots afresh and opens a new undo step", () => {
    const s = createClipGestureSession("a", W, H);
    s.start("pan"); s.update("pan", { dx: 54, dy: 0 }); s.finish("pan");
    s.start("pan"); s.update("pan", { dx: 54, dy: 0 }); s.finish("pan");
    expect(tf().x).toBeCloseTo(0.4, 10);
    expect(store().past).toHaveLength(2);
  });

  test("a begin for a kind still marked active drops the stale sequence: the next touch snapshots afresh", () => {
    const s = createClipGestureSession("a", W, H);
    s.start("pan"); s.update("pan", { dx: 54, dy: 0 }); // its finalize never arrives
    s.begin("pan");
    s.start("pan"); s.update("pan", { dx: 27, dy: 0 });
    expect(tf().x).toBeCloseTo(0.3, 10); // the 0.2 already applied, plus 27 px from the new snapshot
    expect(store().past).toHaveLength(2); // the new sequence is its own undo step
  });

  test("a start for a kind already active resets the session the same way", () => {
    const s = createClipGestureSession("a", W, H);
    s.start("pinch"); s.update("pinch", { scale: 2 });
    s.start("pan"); s.update("pan", { dx: 54, dy: 0 });
    s.start("pan"); // stale: pan never finalized
    s.update("pan", { dx: 27, dy: 0 });
    expect(tf().x).toBeCloseTo(0.3, 10);
    expect(tf().scale).toBe(2);
    s.update("pinch", { scale: 3 }); // the old pinch no longer belongs to the session
    expect(tf().scale).toBe(2);
    expect(store().past).toHaveLength(2);
  });

  test("a begin for a kind that is not active does not disturb a sequence in progress", () => {
    const s = createClipGestureSession("a", W, H);
    s.start("pan"); s.update("pan", { dx: 54, dy: 0 });
    s.begin("pinch"); s.start("pinch"); s.update("pinch", { scale: 2 });
    expect(tf().x).toBeCloseTo(0.2, 10);
    expect(tf().scale).toBe(2);
    expect(store().past).toHaveLength(1);
  });

  test("updates and finishes from a gesture that never started are ignored", () => {
    const s = createClipGestureSession("a", W, H);
    s.update("pan", { dx: 54, dy: 0 });
    s.finish("pinch");
    expect(tf()).toEqual(DEFAULT_TRANSFORM);
    expect(store().past).toHaveLength(0);
  });
});

describe("clips with motion", () => {
  const pin = (t: number, over: Partial<{ x: number; y: number; scale: number; rotation: number; opacity: number }> = {}) =>
    ({ t, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, ...over });
  const keyed = (keyframes = [pin(0), pin(2, { x: 0.4 })]) =>
    store().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4, keyframes }), makeClip({ id: "b", sourceDuration: 4 })] }));
  const pins = () => store().project!.clips[0].keyframes;

  test("a drag on a keyframed clip upserts one pin at the playhead, as one undo step, and leaves the static transform alone", () => {
    keyed();
    store().seek(1); // base x = 0.2
    const s = createClipGestureSession("a", W, H);
    s.start("pan");
    for (const dx of [9, 18, 27]) s.update("pan", { dx, dy: 0 });
    s.finish("pan");
    expect(pins()).toHaveLength(3);
    expect(pins()[1].t).toBe(1);
    expect(pins()[1].x).toBeCloseTo(0.3, 10);
    expect(pins()[1]).toMatchObject({ y: 0, scale: 1, rotation: 0, opacity: 1 });
    expect(pins()[0]).toEqual(pin(0));
    expect(pins()[2]).toEqual(pin(2, { x: 0.4 }));
    expect(tf()).toEqual(DEFAULT_TRANSFORM);
    expect(store().past).toHaveLength(1);
    store().undo();
    expect(pins()).toHaveLength(2);
  });

  test("the pin stays at the moment the gesture started even if the playhead moves meanwhile", () => {
    keyed();
    store().seek(1);
    const s = createClipGestureSession("a", W, H);
    s.start("pan"); s.update("pan", { dx: 27, dy: 0 });
    store().seek(1.5);
    s.update("pan", { dx: 54, dy: 0 });
    expect(pins().map((k) => k.t)).toEqual([0, 1, 2]);
    expect(pins()[1].x).toBeCloseTo(0.4, 10);
  });

  test("a drag on an existing pin updates it", () => {
    keyed();
    store().seek(2);
    const s = createClipGestureSession("a", W, H);
    s.start("pan"); s.update("pan", { dx: 0, dy: 48 }); s.finish("pan");
    expect(pins()).toHaveLength(2);
    expect(pins()[1].x).toBeCloseTo(0.4, 10);
    expect(pins()[1].y).toBeCloseTo(0.1, 10);
  });

  test("a touch that changes nothing adds no pin and no undo step", () => {
    keyed([pin(0), pin(2)]);
    store().seek(1);
    const s = createClipGestureSession("a", W, H);
    s.start("pan"); s.update("pan", { dx: 1, dy: 0 }); s.finish("pan"); // snaps back to the centre
    expect(pins()).toHaveLength(2);
    expect(store().past).toHaveLength(0);
  });

  test("a drag keeps a pin's un-normalised rotation (a keyframed full turn)", () => {
    keyed([pin(0), pin(2, { rotation: 720 })]);
    store().seek(2);
    const s = createClipGestureSession("a", W, H);
    s.start("pan"); s.update("pan", { dx: 54, dy: 0 }); s.finish("pan");
    expect(pins()[1].rotation).toBe(720);
    expect(pins()[1].x).toBeCloseTo(0.2, 10);
    s.start("rotate"); s.update("rotate", { rotation: Math.PI / 6 }); s.finish("rotate");
    expect(pins()[1].rotation).toBeCloseTo(750, 8);
  });

  test("a pure vertical drag keeps the interpolated x and rotation, even inside their magnet zones", () => {
    keyed([pin(0, { x: 0.01, rotation: 2 }), pin(2, { x: 0.01, rotation: 2 })]);
    store().seek(1);
    const impact = Haptics.impactAsync as jest.Mock;
    const s = createClipGestureSession("a", W, H);
    s.start("pan"); s.update("pan", { dx: 0, dy: 48 }); s.finish("pan");
    expect(pins()).toHaveLength(3);
    expect(pins()[1]).toMatchObject({ t: 1, x: 0.01, rotation: 2, scale: 1 });
    expect(pins()[1].y).toBeCloseTo(0.1, 10);
    expect(impact).not.toHaveBeenCalled(); // no magnet engaged: x and rotation were not snapped
  });

  test("a pinch alone keeps an interpolated scale's neighbours: x, y and rotation are untouched", () => {
    keyed([pin(0, { x: 0.01, y: -0.015, rotation: 88 }), pin(2, { x: 0.01, y: -0.015, rotation: 88 })]);
    store().seek(1);
    const s = createClipGestureSession("a", W, H);
    s.start("pinch"); s.update("pinch", { scale: 2 }); s.finish("pinch");
    expect(pins()[1]).toMatchObject({ t: 1, x: 0.01, y: -0.015, rotation: 88, scale: 2 });
  });

  test("a twist of more than half a turn accumulates: the pin does not flip to the short way round", () => {
    keyed([pin(0, { rotation: 10 }), pin(2, { rotation: 10 })]);
    store().seek(1);
    const s = createClipGestureSession("a", W, H);
    s.start("rotate"); s.update("rotate", { rotation: (200 * Math.PI) / 180 }); s.finish("rotate");
    expect(pins()[1].rotation).toBeCloseTo(210, 8);
    expect(pins()[1].x).toBe(0);
  });

  test("a twist on a keyframed clip still snaps to the nearest right angle, without wrapping", () => {
    keyed([pin(0), pin(2)]);
    store().seek(1);
    const s = createClipGestureSession("a", W, H);
    s.start("rotate"); s.update("rotate", { rotation: (268.5 * Math.PI) / 180 }); s.finish("rotate");
    expect(pins()[1].rotation).toBe(270);
  });

  test("without keyframes a pure vertical drag still snaps x and rotation, and a 200° twist is normalised (as before)", () => {
    store().apply((p) => setClipTransform(p, "a", { x: 0.01, rotation: 2 }));
    const s = createClipGestureSession("a", W, H);
    s.start("pan"); s.update("pan", { dx: 0, dy: 48 }); s.finish("pan");
    expect(tf()).toMatchObject({ x: 0, rotation: 0 });
    s.start("rotate"); s.update("rotate", { rotation: (200 * Math.PI) / 180 }); s.finish("rotate");
    expect(tf().rotation).toBeCloseTo(-160, 8);
  });

  test("the gold frame follows the base (keyframed) placement as the playhead moves", async () => {
    keyed();
    store().select("a");
    store().seek(1);
    await render(<ClipGestures frameW={W} frameH={H} />);
    expect(StyleSheet.flatten(screen.getByTestId("clip-selection-frame").props.style).left).toBeCloseTo(54, 8);
    await act(() => { store().seek(2); });
    expect(StyleSheet.flatten(screen.getByTestId("clip-selection-frame").props.style).left).toBeCloseTo(108, 8);
  });

  test("an animation without keyframes: gestures edit the static transform and the frame shows the static placement", async () => {
    store().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4, animation: { in: { id: "slideLeft", duration: 1 }, out: null, combo: null } })] }));
    store().select("a"); // playhead 0: the animated picture is a whole frame to the right
    await render(<ClipGestures frameW={W} frameH={H} />);
    expect(screen.getByTestId("clip-selection-frame")).toHaveStyle({ left: 0, top: 0, width: W, height: H });
    const s = createClipGestureSession("a", W, H);
    await act(() => { s.start("pan"); s.update("pan", { dx: 54, dy: 0 }); s.finish("pan"); });
    expect(tf().x).toBeCloseTo(0.2, 10);
    expect(pins()).toEqual([]);
    expect(store().past).toHaveLength(1);
  });
});

describe("a selected layer", () => {
  const pin = (t: number, over: Partial<{ x: number; y: number; scale: number; rotation: number; opacity: number }> = {}) =>
    ({ t, x: 0, y: 0, scale: 0.4, rotation: 0, opacity: 1, ...over });
  const small = { scale: 0.4, x: 0, y: 0, rotation: 0, flipH: false, flipV: false };
  /** Main clips a (0–4) and b (4–8); layer "l" (landscape 1920×1080) on screen 2–5. */
  const withLayer = (over: Partial<LayerClip> = {}) =>
    store().setProject(makeProject({
      clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 4 })],
      overlays: [makeOverlay({ id: "o1", text: "Hi", start: 0, end: 8 })],
      layers: [makeLayer({ id: "l", sourceDuration: 3, start: 2, width: 1920, height: 1080, transform: small, ...over })],
    }));
  const layer = () => store().project!.layers[0];
  /** Left edge of the layer's picture box when its centre sits `x` frames right of the middle (scale 0.4, upright). */
  const leftAt = (x: number) => {
    const placed = placeClip({ width: 1920, height: 1080 }, layer().crop, { ...small, x }, W, H);
    return placed.centerX - placed.width / 2;
  };
  const frameLeft = () => StyleSheet.flatten(screen.getByTestId("clip-selection-frame").props.style).left;

  test("on screen at the playhead: the gesture area and a gold frame placed like the layer's picture (its own size)", async () => {
    withLayer({ transform: { ...small, x: 0.1, rotation: 30 } });
    store().seek(3);
    store().select("l");
    await render(<ClipGestures frameW={W} frameH={H} />);
    const l = layer();
    const placed = placeClip({ width: 1920, height: 1080 }, l.crop, l.transform, W, H);
    expect(placed.width).toBeGreaterThan(placed.height); // the layer's own (landscape) size, not the main clip's
    expect(screen.getByTestId("clip-selection-frame")).toHaveStyle({
      left: placed.centerX - placed.width / 2, top: placed.centerY - placed.height / 2, width: placed.width, height: placed.height,
      borderColor: theme.colors.accent, transform: [{ rotate: "30deg" }],
    });
    expect(screen.getByTestId("clip-selection-frame").props.pointerEvents).toBe("none");
    expect(screen.getByTestId("clip-gesture-area")).toBeTruthy();
  });

  test("not on screen at the playhead: no gesture area and no frame; they come and go with the playhead", async () => {
    withLayer();
    store().seek(1); // before the layer
    store().select("l");
    await render(<ClipGestures frameW={W} frameH={H} />);
    expect(screen.queryByTestId("clip-selection-frame")).toBeNull();
    expect(screen.queryByTestId("clip-gesture-area")).toBeNull();
    await act(() => { store().seek(2); });
    expect(screen.getByTestId("clip-gesture-area")).toBeTruthy();
    expect(screen.getByTestId("clip-selection-frame")).toBeTruthy();
    await act(() => { store().seek(5); }); // its end is exclusive
    expect(screen.queryByTestId("clip-selection-frame")).toBeNull();
    expect(screen.queryByTestId("clip-gesture-area")).toBeNull();
  });

  test("nothing when an overlay is selected", async () => {
    withLayer();
    store().seek(3);
    useEditorStore.setState({ selectedClipId: "l", selectedOverlayId: "o1" });
    await render(<ClipGestures frameW={W} frameH={H} />);
    expect(screen.queryByTestId("clip-selection-frame")).toBeNull();
    expect(screen.queryByTestId("clip-gesture-area")).toBeNull();
  });

  test("a layer still running at the project's end keeps its frame on the last frame", async () => {
    withLayer({ start: 6 }); // 6–9, the project ends at 8
    store().seek(8);
    store().select("l");
    await render(<ClipGestures frameW={W} frameH={H} />);
    expect(screen.getByTestId("clip-selection-frame")).toBeTruthy();
    expect(screen.getByTestId("clip-gesture-area")).toBeTruthy();
  });

  test("a pan driven through the rendered gesture moves the layer — not the main clip under it — as one undo step", async () => {
    withLayer();
    store().seek(3);
    store().select("l");
    await render(<ClipGestures frameW={W} frameH={H} />);
    type Mock = { handlers: Record<string, (...a: unknown[]) => void>; gestures?: Mock[] };
    const [pan] = (screen.getByTestId("clip-gesture-area").props.gesture as Mock).gestures!;
    const clipsBefore = store().project!.clips;
    await act(() => {
      pan.handlers.onBegin({});
      pan.handlers.onStart({ translationX: 0, translationY: 0 });
      for (const dx of [20, 40, 54]) pan.handlers.onUpdate({ translationX: dx, translationY: -48 });
      pan.handlers.onFinalize({}, true);
    });
    expect(layer().transform.x).toBeCloseTo(0.2, 10);
    expect(layer().transform.y).toBeCloseTo(-0.1, 10);
    expect(layer().transform.scale).toBe(0.4);
    expect(layer().keyframes).toEqual([]);
    expect(store().project!.clips).toBe(clipsBefore);
    expect(store().past).toHaveLength(1);
    expect(frameLeft()).toBeCloseTo(leftAt(0.2), 8); // the gold frame follows the moved layer
    await act(() => { store().undo(); });
    expect(layer().transform).toEqual(small);
  });

  test("pan + pinch + twist on a layer: one undo step; the centre and right-angle magnets apply", () => {
    withLayer({ transform: { ...small, x: 0.2 } });
    store().seek(3);
    const s = createClipGestureSession("l", W, H);
    s.start("pinch"); s.update("pinch", { scale: 1.5 });
    s.start("rotate"); s.update("rotate", { rotation: 0.5 });
    s.start("pan"); s.update("pan", { dx: -52, dy: 0 }); // raw x ≈ 0.007 → the centre magnet
    s.finish("pan"); s.finish("rotate"); s.finish("pinch");
    expect(layer().transform.scale).toBeCloseTo(0.6, 10);
    expect(layer().transform.rotation).toBeCloseTo((0.5 * 180) / Math.PI, 10);
    expect(layer().transform.x).toBe(0);
    expect(store().past).toHaveLength(1);
    s.start("rotate"); s.update("rotate", { rotation: ((90 - (0.5 * 180) / Math.PI + 1.5) * Math.PI) / 180 }); s.finish("rotate");
    expect(layer().transform.rotation).toBe(90); // 91.5° → the right angle
    expect(store().past).toHaveLength(2);
  });

  test("the scale magnets for a layer are Fill (1) and Fit (the whole picture visible)", () => {
    withLayer();
    store().seek(3);
    const fit = fitScale({ width: 1920, height: 1080 }, layer().crop, 0, W, H);
    expect(fit).toBeLessThan(0.4);
    const s = createClipGestureSession("l", W, H);
    s.start("pinch");
    s.update("pinch", { scale: (fit * 1.02) / 0.4 }); // inside the Fit magnet
    expect(layer().transform.scale).toBeCloseTo(fit, 10);
    s.update("pinch", { scale: 0.99 / 0.4 }); // inside the Fill magnet
    expect(layer().transform.scale).toBe(1);
    s.update("pinch", { scale: 0.7 / 0.4 }); // free
    expect(layer().transform.scale).toBeCloseTo(0.7, 10);
    s.finish("pinch");
    expect(store().past).toHaveLength(1);
  });

  test("a touch that changes nothing leaves no undo step", () => {
    withLayer();
    store().seek(3);
    const s = createClipGestureSession("l", W, H);
    s.start("pan"); s.update("pan", { dx: 1, dy: 0 }); s.finish("pan");
    expect(layer().transform).toEqual(small);
    expect(store().past).toHaveLength(0);
  });

  test("a keyframed layer: the drag writes one pin at the playhead's offset in the layer, as one undo step", () => {
    withLayer({ keyframes: [pin(0), pin(2, { x: 0.4 })] });
    store().seek(3); // one second into the layer: base x = 0.2
    const s = createClipGestureSession("l", W, H);
    s.start("pan");
    for (const dx of [9, 18]) s.update("pan", { dx, dy: 0 });
    store().seek(3.5); // the pin stays at the moment the gesture started
    s.update("pan", { dx: 27, dy: 0 });
    s.finish("pan");
    const pins = layer().keyframes;
    expect(pins.map((k) => k.t)).toEqual([0, 1, 2]);
    expect(pins[1].x).toBeCloseTo(0.3, 10);
    expect(pins[1]).toMatchObject({ y: 0, scale: 0.4, rotation: 0, opacity: 1 });
    expect(layer().transform).toEqual(small);
    expect(store().project!.clips.every((c) => c.keyframes.length === 0)).toBe(true);
    expect(store().past).toHaveLength(1);
    store().undo();
    expect(layer().keyframes).toHaveLength(2);
  });

  test("a keyframed layer that is not on screen takes no gesture (there is no moment to pin)", () => {
    withLayer({ keyframes: [pin(0), pin(2, { x: 0.4 })] });
    store().seek(1);
    const s = createClipGestureSession("l", W, H);
    s.start("pan"); s.update("pan", { dx: 54, dy: 0 }); s.finish("pan");
    expect(layer().keyframes).toHaveLength(2);
    expect(store().past).toHaveLength(0);
  });

  test("the gold frame follows the layer's keyframed base as the playhead moves", async () => {
    withLayer({ keyframes: [pin(0), pin(2, { x: 0.4 })] });
    store().select("l");
    store().seek(3);
    await render(<ClipGestures frameW={W} frameH={H} />);
    expect(frameLeft()).toBeCloseTo(leftAt(0.2), 8);
    await act(() => { store().seek(4); });
    expect(frameLeft()).toBeCloseTo(leftAt(0.4), 8);
  });
});
