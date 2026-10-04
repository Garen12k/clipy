import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { MOTION } from "@/src/editor/model/motion";
import { makeClip, makeOverlay, makeProject, makeSticker, type Keyframe, type Overlay } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { OverlayLayer } from "../components/OverlayLayer";

const W = 200, H = 400;
const store = () => useEditorStore.getState();
const ov = (id: string) => store().project!.overlays.find((o) => o.id === id)!;
const styleOf = (testID: string) => StyleSheet.flatten(screen.getByTestId(testID).props.style) as Record<string, unknown>;
const pin = (t: number, v: Partial<Keyframe> = {}): Keyframe => ({ t, x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1, ...v });

async function show(overlays: Overlay[], playhead: number, selected?: string) {
  store().reset();
  store().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })], overlays }));
  store().seek(playhead);
  if (selected) store().selectOverlay(selected);
  await render(<OverlayLayer frameW={W} frameH={H} onOpenPanel={() => {}} />);
}

type Mock = { handlers: Record<string, (...a: unknown[]) => void>; gestures?: Mock[] };
/** Race(doubleTap, Simultaneous(pan, pinch, rotate)) as recorded by the gesture-handler mock. */
function gestures(id: string) {
  const composed = screen.getByTestId(`selection-frame-${id}`).props.gesture as Mock;
  const [dbl, together] = composed.gestures!;
  const [pan, pinch, rotate] = together.gestures!;
  return { dbl, pan, pinch, rotate };
}

const slideText = () => makeOverlay({ id: "t", text: "Slide", start: 1, end: 5, x: 0.5, y: 0.5, fontScale: 0.1,
  animation: { in: { id: "slideUp", duration: 0.5 }, out: null, loop: null } });
const keyedSticker = () => makeSticker({ id: "k", emoji: "🔥", start: 0, end: 4, x: 0.9, y: 0.9,
  keyframes: [pin(0, { x: 0.2 }), pin(2, { x: 0.6, scale: 2, rotation: 90, opacity: 0.5 })] });

describe("overlay motion in the preview", () => {
  test("a slide-up In starts offset by slideOverlay of the frame height and reaches its place after the In", async () => {
    await show([slideText()], 1);
    expect(screen.getByTestId("overlay-t")).toHaveStyle({ left: 100, top: (0.5 + MOTION.slideOverlay) * H });
    await act(() => { store().seek(1.5); });
    expect(screen.getByTestId("overlay-t")).toHaveStyle({ left: 100, top: 200 });
  });

  test("a Loop pulse changes the size over time", async () => {
    await show([makeOverlay({ id: "t", text: "Pulse", start: 0, end: 5, fontScale: 0.1, animation: { in: null, out: null, loop: "pulse" } })], 0);
    expect(screen.getByText("Pulse")).toHaveStyle({ fontSize: 40 });
    await act(() => { store().seek(1 / (4 * MOTION.loopPulseHz)); });   // a quarter cycle: the peak
    const size = (StyleSheet.flatten(screen.getByText("Pulse").props.style) as { fontSize: number }).fontSize;
    expect(size).toBeCloseTo(40 * (1 + MOTION.loopPulseAmp), 3);
  });

  test("a keyframed sticker interpolates place, size, rotation and opacity", async () => {
    await show([keyedSticker()], 1);                                       // halfway: smooth(0.5) = 0.5
    const s = styleOf("sticker-k");
    expect(s.left).toBeCloseTo(0.4 * W, 6);
    expect(s.top).toBeCloseTo(0.5 * H, 6);
    expect(s.transform).toEqual([{ rotate: "45deg" }]);
    expect(s.opacity).toBeCloseTo(0.75, 9);
    expect(screen.getByText("🔥")).toHaveStyle({ fontSize: 0.12 * H * 1.5 });
  });

  test("a fade In at its start is drawn at the 0.02 floor (iOS does not hit-test views below 0.01) and keeps its tap target", async () => {
    await show([makeOverlay({ id: "t", text: "Fade", start: 1, end: 5, animation: { in: { id: "fade", duration: 0.5 }, out: null, loop: null } })], 1);
    expect(styleOf("overlay-t").opacity).toBe(0.02);
    await fireEvent.press(screen.getByLabelText("Overlay Fade"));
    expect(store().selectedOverlayId).toBe("t");
  });

  test("overlays without motion get no opacity style and no base copy", async () => {
    await show([makeOverlay({ id: "t", text: "Still", start: 0, end: 5 }), makeSticker({ id: "s", start: 0, end: 5 })], 1, "t");
    expect("opacity" in styleOf("overlay-t")).toBe(false);
    expect("opacity" in styleOf("sticker-s")).toBe(false);
    expect(screen.queryByTestId("overlay-base-t")).toBeNull();
    expect(within(screen.getByTestId("overlay-t")).getByTestId("selection-frame-t")).toBeTruthy();
  });
});

describe("selection frame with motion", () => {
  test("the frame sits at the base placement, not the animated one", async () => {
    await show([slideText()], 1, "t");
    expect(screen.getByTestId("overlay-t")).toHaveStyle({ top: (0.5 + MOTION.slideOverlay) * H });
    const base = screen.getByTestId("overlay-base-t");
    expect(base).toHaveStyle({ left: 100, top: 200 });
    expect(within(base).getByTestId("selection-frame-t")).toBeTruthy();
    expect(within(screen.getByTestId("overlay-t")).queryByTestId("selection-frame-t")).toBeNull();
    expect(screen.getAllByTestId("selection-frame-t")).toHaveLength(1);
  });

  test("a keyframed sticker's frame follows the keyframes without the animation on top", async () => {
    await show([{ ...keyedSticker(), animation: { in: null, out: null, loop: "float" } }], 1, "k");
    const base = styleOf("sticker-base-k");
    expect(base.left).toBeCloseTo(0.4 * W, 6);
    expect(base.top).toBeCloseTo(0.5 * H, 6);
    expect(base.transform).toEqual([{ rotate: "45deg" }]);
    expect("opacity" in base).toBe(false);
    expect(styleOf("sticker-k").top).not.toBeCloseTo(0.5 * H, 6);
  });

  test("double tap on the base frame opens the panel", async () => {
    const onOpenPanel = jest.fn();
    store().reset();
    store().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })], overlays: [slideText()] }));
    store().seek(1);
    store().selectOverlay("t");
    await render(<OverlayLayer frameW={W} frameH={H} onOpenPanel={onOpenPanel} />);
    await act(() => { gestures("t").dbl.handlers.onEnd({}); });
    expect(onOpenPanel).toHaveBeenCalledWith("t");
  });

  test("a drag with keyframes writes the pin at the playhead, as one undo step", async () => {
    await show([keyedSticker()], 1, "k");
    const { pan } = gestures("k");
    await act(() => {
      pan.handlers.onStart({ translationX: 0, translationY: 0 });
      pan.handlers.onUpdate({ translationX: 10, translationY: 10 });
      pan.handlers.onUpdate({ translationX: 20, translationY: 40 });
      pan.handlers.onFinalize({}, true);
    });
    const k = ov("k");
    expect(k.keyframes.map((f) => f.t)).toEqual([0, 1, 2]);
    expect(k.keyframes[1].x).toBeCloseTo(0.4 + 20 / W, 9);
    expect(k.keyframes[1].y).toBeCloseTo(0.5 + 40 / H, 9);
    expect(k.keyframes[1].scale).toBeCloseTo(1.5, 9);
    expect(k.x).toBe(0.9);
    expect(k.y).toBe(0.9);
    expect(store().past).toHaveLength(1);
  });

  test("the gesture keeps the playhead it started at", async () => {
    await show([keyedSticker()], 1, "k");
    const { pinch } = gestures("k");
    await act(() => {
      pinch.handlers.onStart({ scale: 1 });
      pinch.handlers.onUpdate({ scale: 1.1 });
      store().seek(1.5);
      pinch.handlers.onUpdate({ scale: 1.2 });
      pinch.handlers.onFinalize({}, true);
    });
    const k = ov("k");
    expect(k.keyframes.map((f) => f.t)).toEqual([0, 1, 2]);
    expect(k.keyframes[1].scale).toBeCloseTo(1.5 * 1.2, 9);
    expect(store().past).toHaveLength(1);
  });

  test("a twist with keyframes starts from the pinned rotation", async () => {
    await show([keyedSticker()], 1, "k");
    const { rotate } = gestures("k");
    await act(() => {
      rotate.handlers.onStart({ rotation: 0 });
      rotate.handlers.onUpdate({ rotation: (20 * Math.PI) / 180 });
      rotate.handlers.onFinalize({}, true);
    });
    expect(ov("k").keyframes[1].rotation).toBeCloseTo(65, 6);
    expect(ov("k").rotation).toBe(0);
  });

  test("a quarter twist the other way snaps to −90, not 270", async () => {
    await show([keyedSticker()], 0, "k");                                  // on the first pin: rotation 0
    const { rotate } = gestures("k");
    await act(() => {
      rotate.handlers.onStart({ rotation: 0 });
      rotate.handlers.onUpdate({ rotation: -Math.PI / 2 + 0.01 });         // within 3° of the quarter turn
      rotate.handlers.onFinalize({}, true);
    });
    expect(ov("k").keyframes[0].rotation).toBe(-90);
  });

  test("a pure drag keeps a pin's full turns", async () => {
    await show([makeSticker({ id: "k", start: 0, end: 4, keyframes: [pin(0, { rotation: 720 })] })], 1, "k");
    const { pan } = gestures("k");
    await act(() => {
      pan.handlers.onStart({ translationX: 0, translationY: 0 });
      pan.handlers.onUpdate({ translationX: 20, translationY: 0 });
      pan.handlers.onFinalize({}, true);
    });
    expect(ov("k").keyframes.map((f) => f.rotation)).toEqual([720, 720]);
    expect(ov("k").keyframes[1].x).toBeCloseTo(0.6, 9);
  });

  test("a gesture that changes nothing writes no pin and opens no undo step", async () => {
    await show([keyedSticker()], 1, "k");
    const { pan, pinch, rotate } = gestures("k");
    await act(() => {
      pan.handlers.onStart({ translationX: 0, translationY: 0 });
      pinch.handlers.onStart({ scale: 1 });
      rotate.handlers.onStart({ rotation: 0 });
      pan.handlers.onUpdate({ translationX: 0, translationY: 0 });
      pinch.handlers.onUpdate({ scale: 1 });
      rotate.handlers.onUpdate({ rotation: 0 });
      pan.handlers.onFinalize({}, true);
      pinch.handlers.onFinalize({}, true);
      rotate.handlers.onFinalize({}, true);
    });
    expect(ov("k").keyframes.map((f) => f.t)).toEqual([0, 2]);
    expect(store().past).toHaveLength(0);
  });

  test("a gesture that began but never started does not split the undo step or move the pin time", async () => {
    await show([keyedSticker()], 1, "k");
    const { pan, pinch, rotate } = gestures("k");
    await act(() => {
      pan.handlers.onStart({ translationX: 0, translationY: 0 });
      pan.handlers.onUpdate({ translationX: 20, translationY: 0 });
      pinch.handlers.onFinalize({}, false);                                // the pinch never activated
      store().seek(1.5);
      rotate.handlers.onStart({ rotation: 0 });
      rotate.handlers.onUpdate({ rotation: 0.5 });
      rotate.handlers.onFinalize({}, true);
      pan.handlers.onFinalize({}, true);
    });
    expect(ov("k").keyframes.map((f) => f.t)).toEqual([0, 1, 2]);
    expect(store().past).toHaveLength(1);
  });

  test("a gesture whose finalize never arrived does not leak into the next touch: a begin for a kind still active starts a new sequence", async () => {
    await show([keyedSticker()], 1, "k");
    const { pan, pinch } = gestures("k");
    await act(() => {
      pan.handlers.onStart({ translationX: 0, translationY: 0 });
      pan.handlers.onUpdate({ translationX: 20, translationY: 0 });        // its finalize never arrives
      store().seek(1.5);
      pan.handlers.onBegin({});
      pan.handlers.onStart({ translationX: 0, translationY: 0 });
      pan.handlers.onUpdate({ translationX: 20, translationY: 0 });
      pan.handlers.onFinalize({}, true);
    });
    expect(ov("k").keyframes.map((f) => f.t)).toEqual([0, 1, 1.5, 2]);     // the new touch pins the playhead it started at
    expect(ov("k").keyframes[1].x).toBeCloseTo(0.4 + 20 / W, 9);           // the stale drag is not written again
    expect(store().past).toHaveLength(2);                                  // and it is its own undo step
    // A begin for a kind that is not active leaves a sequence in progress alone.
    await act(() => {
      pan.handlers.onBegin({});
      pan.handlers.onStart({ translationX: 0, translationY: 0 });
      pan.handlers.onUpdate({ translationX: 10, translationY: 0 });
      pinch.handlers.onBegin({});
      pinch.handlers.onStart({ scale: 1 });
      pinch.handlers.onUpdate({ scale: 1.2 });
      pinch.handlers.onFinalize({}, true);
      pan.handlers.onFinalize({}, true);
    });
    expect(store().past).toHaveLength(3);
  });

  test("a start for a kind already active resets the sequence the same way", async () => {
    await show([keyedSticker()], 1, "k");
    const { pan } = gestures("k");
    await act(() => {
      pan.handlers.onStart({ translationX: 0, translationY: 0 });
      pan.handlers.onUpdate({ translationX: 20, translationY: 0 });
      store().seek(1.5);
      pan.handlers.onStart({ translationX: 0, translationY: 0 });          // no begin either
      pan.handlers.onUpdate({ translationX: 20, translationY: 0 });
      pan.handlers.onFinalize({}, true);
    });
    expect(ov("k").keyframes.map((f) => f.t)).toEqual([0, 1, 1.5, 2]);
    expect(store().past).toHaveLength(2);
  });

  test("the unseen base copy takes no touches itself", async () => {
    await show([slideText(), { ...keyedSticker(), id: "h", emoji: null, shape: "heart" }], 1, "t");
    const hidden = within(screen.getByTestId("overlay-base-t")).getByText("Slide", { includeHiddenElements: true });
    expect(hidden.props.pointerEvents).toBe("none");
  });

  test("another overlay appearing, or the frame appearing, never remounts a moving overlay", async () => {
    await show([makeOverlay({ id: "e", text: "Early", start: 2, end: 5 }), keyedSticker(), slideText()], 1);
    const sticker = screen.getByTestId("sticker-k");
    const text = screen.getByTestId("overlay-t");
    await act(() => { store().seek(2.5); });
    expect(screen.getByText("Early")).toBeTruthy();
    await act(() => { store().selectOverlay("k"); });
    expect(screen.getByTestId("sticker-base-k")).toBeTruthy();
    expect(screen.getByTestId("sticker-k")).toBe(sticker);
    expect(screen.getByTestId("overlay-t")).toBe(text);
  });

  test("a drag without keyframes moves x / y as before", async () => {
    await show([{ ...slideText(), start: 0 }], 2, "t");
    const { pan } = gestures("t");
    await act(() => {
      pan.handlers.onStart({ translationX: 0, translationY: 0 });
      pan.handlers.onUpdate({ translationX: 20, translationY: -40 });
      pan.handlers.onFinalize({}, true);
    });
    expect(ov("t").x).toBeCloseTo(0.6, 9);
    expect(ov("t").y).toBeCloseTo(0.4, 9);
    expect(ov("t").keyframes).toEqual([]);
    expect(store().past).toHaveLength(1);
  });

  test("a caption still drags", async () => {
    await show([makeOverlay({ id: "c", kind: "caption", text: "Cap", start: 0, end: 5, x: 0.5, y: 0.8 })], 1, "c");
    const { pan } = gestures("c");
    await act(() => {
      pan.handlers.onStart({ translationX: 0, translationY: 0 });
      pan.handlers.onUpdate({ translationX: 0, translationY: -40 });
      pan.handlers.onFinalize({}, true);
    });
    expect(ov("c").y).toBeCloseTo(0.7, 9);
    expect(store().past).toHaveLength(1);
  });
});
