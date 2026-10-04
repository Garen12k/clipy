import { act, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import * as Haptics from "expo-haptics";
import { StyleSheet } from "react-native";
import { placeClip } from "@/src/editor/model/clipLayout";
import { setClipTransform } from "@/src/editor/model/ops";
import { DEFAULT_TRANSFORM, makeClip, makeOverlay, makeProject } from "@/src/editor/model/types";
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
