import { act, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { StyleSheet } from "react-native";
import { moveRect, resizeRectCorner, scaleRect } from "@/src/editor/model/regionRect";
import { makeClip, makeEffect, makeProject, REGION_LIMITS, type EffectRect } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { createRegionGestureSession, RegionBoxes } from "../components/RegionBox";

const W = 270, H = 480;
const BLUR: EffectRect = { x: 0.1, y: 0.2, w: 0.4, h: 0.25 };
const MOSAIC: EffectRect = { x: 0.5, y: 0.6, w: 0.4, h: 0.2 };
const project = () => makeProject({
  clips: [makeClip({ id: "a", sourceDuration: 8 })],
  effects: [
    makeEffect({ id: "blur", type: "blurBox", start: 1, end: 3, rect: BLUR }),
    makeEffect({ id: "shake", type: "shake", start: 0, end: 8 }),
    makeEffect({ id: "mosaic", type: "mosaicBox", start: 2, end: 5, rect: MOSAIC }),
  ],
});
const store = () => useEditorStore.getState();
const rect = (id = "blur") => store().project!.effects.find((e) => e.id === id)!.rect!;
const close = (a: EffectRect, b: EffectRect) => { for (const k of ["x", "y", "w", "h"] as const) expect(a[k]).toBeCloseTo(b[k], 9); };
const px = (r: EffectRect) => ({ left: r.x * W, top: r.y * H, width: r.w * W, height: r.h * H });
const style = (testID: string) => StyleSheet.flatten(screen.getByTestId(testID).props.style);

type Mock = { handlers: Record<string, (...a: unknown[]) => void>; gestures?: Mock[] };
const gestureOf = (testID: string) => screen.getByTestId(testID).props.gesture as Mock;

beforeEach(() => {
  jest.clearAllMocks();
  store().reset();
  store().setProject(project());
});

describe("drawing", () => {
  test("a project without region effects renders nothing", async () => {
    store().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 8 })], effects: [makeEffect({ id: "shake", type: "shake", start: 0, end: 8 })] }));
    store().seek(1);
    await render(<RegionBoxes frameW={W} frameH={H} />);
    expect(screen.toJSON()).toBeNull();
  });

  test("nothing while no region effect covers the playhead", async () => {
    store().seek(0.5);
    await render(<RegionBoxes frameW={W} frameH={H} />);
    expect(screen.toJSON()).toBeNull();
    await act(() => { store().seek(6); });
    expect(screen.toJSON()).toBeNull();
  });

  test("each region effect covering the playhead is a frosted rectangle at its pixels; others are not drawn", async () => {
    store().seek(1.5);
    await render(<RegionBoxes frameW={W} frameH={H} />);
    expect(screen.getByTestId("region-box-blur")).toHaveStyle({ position: "absolute", ...px(BLUR), backgroundColor: theme.colors.scrim, borderColor: theme.colors.hairline, borderWidth: StyleSheet.hairlineWidth });
    expect(screen.queryByTestId("region-box-mosaic")).toBeNull();
    expect(screen.queryByTestId("region-box-shake")).toBeNull();
    await act(() => { store().seek(2.5); });
    expect(screen.getByTestId("region-box-blur")).toHaveStyle(px(BLUR));
    expect(screen.getByTestId("region-box-mosaic")).toHaveStyle(px(MOSAIC));
    await act(() => { store().seek(3); });   // the blur box's end is exclusive
    expect(screen.queryByTestId("region-box-blur")).toBeNull();
    expect(screen.getByTestId("region-box-mosaic")).toBeTruthy();
  });

  test("unselected boxes take no touches and have no handles; the container lets touches through", async () => {
    store().seek(2.5);
    await render(<RegionBoxes frameW={W} frameH={H} />);
    expect(screen.getByTestId("region-boxes").props.pointerEvents).toBe("box-none");
    for (const id of ["blur", "mosaic"]) {
      const box = screen.getByTestId(`region-box-${id}`);
      expect(box.props.pointerEvents).toBe("none");
      expect(box.props.gesture).toBeUndefined();
    }
    expect(screen.queryByTestId("region-handle-tl")).toBeNull();
    expect(screen.queryByTestId("region-handle-br")).toBeNull();
  });

  test("a mosaic box draws a 4-column checker of translucent squares; a blur box does not", async () => {
    store().seek(2.5);
    await render(<RegionBoxes frameW={W} frameH={H} />);
    expect(screen.queryByTestId("region-checker-blur")).toBeNull();
    const checker = screen.getByTestId("region-checker-mosaic");
    expect(checker.props.pointerEvents).toBe("none");
    // 108 × 96 pt box → 27 pt columns → 4 rows of 24 pt; every other square is drawn: 2 per row.
    const cells = checker.children as unknown as { props: { style: object } }[];
    expect(cells).toHaveLength(8);
    const first = StyleSheet.flatten(cells[0].props.style) as Record<string, unknown>;
    expect(first).toMatchObject({ position: "absolute", left: 0, top: 0, width: 27, height: 24, backgroundColor: theme.colors.scrim });
    const lefts = cells.map((c) => (StyleSheet.flatten(c.props.style) as { left: number; top: number }));
    expect(lefts.slice(0, 4)).toEqual([expect.objectContaining({ left: 0, top: 0 }), expect.objectContaining({ left: 54, top: 0 }), expect.objectContaining({ left: 27, top: 24 }), expect.objectContaining({ left: 81, top: 24 })]);
  });

  test("the checker's rows are capped for a tall thin box", async () => {
    store().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 8 })], effects: [makeEffect({ id: "m", type: "mosaicBox", start: 0, end: 4, rect: { x: 0, y: 0, w: REGION_LIMITS.min, h: 1 } })] }));
    await render(<RegionBoxes frameW={W} frameH={H} />);
    expect((screen.getByTestId("region-checker-m").children as unknown[]).length).toBeLessThanOrEqual(24);
  });

  test("nothing before the frame is measured", async () => {
    store().seek(2.5);
    await render(<RegionBoxes frameW={0} frameH={0} />);
    expect(screen.toJSON()).toBeNull();
  });
});

describe("the selected box", () => {
  test("has a gold outline, takes touches and has two 44 pt corner handles", async () => {
    store().seek(2.5);
    store().selectEffect("blur");
    await render(<RegionBoxes frameW={W} frameH={H} />);
    const box = screen.getByTestId("region-box-blur");
    expect(box).toHaveStyle({ ...px(BLUR), borderColor: theme.colors.accent, borderWidth: 2 });
    expect(box.props.pointerEvents).not.toBe("none");
    expect(box.props.gesture).toBeDefined();
    expect(box.props.accessibilityLabel).toBe("Blur box");
    const b = px(BLUR);
    expect(style("region-handle-tl")).toMatchObject({ position: "absolute", width: 44, height: 44, left: b.left - 22, top: b.top - 22 });
    expect(style("region-handle-br")).toMatchObject({ position: "absolute", width: 44, height: 44, left: b.left + b.width - 22, top: b.top + b.height - 22 });
    expect(screen.getByLabelText("Top-left corner")).toBeTruthy();
    expect(screen.getByLabelText("Bottom-right corner")).toBeTruthy();
    // The other box stays a plain picture.
    expect(screen.getByTestId("region-box-mosaic")).toHaveStyle({ borderColor: theme.colors.hairline });
    expect(screen.getByTestId("region-box-mosaic").props.pointerEvents).toBe("none");
  });

  test("the selected box is drawn last (on top), its handles above it", async () => {
    store().seek(2.5);
    store().selectEffect("blur");
    await render(<RegionBoxes frameW={W} frameH={H} />);
    const ids = (screen.getByTestId("region-boxes").children as unknown as { props: { testID?: string } }[]).map((c) => c.props.testID);
    expect(ids).toEqual(["region-box-mosaic", "region-box-blur", "region-handle-tl", "region-handle-br"]);
  });

  test("the box and its handles claim the touch, so a touch on them never becomes a tap on the preview", async () => {
    store().seek(2.5);
    store().selectEffect("blur");
    await render(<RegionBoxes frameW={W} frameH={H} />);
    for (const id of ["region-box-blur", "region-handle-tl", "region-handle-br"]) {
      expect((screen.getByTestId(id).props.onStartShouldSetResponder as () => boolean)()).toBe(true);
    }
    expect(screen.getByTestId("region-box-mosaic").props.onStartShouldSetResponder).toBeUndefined();
  });

  test("outside its time the selected effect has no box and no handles", async () => {
    store().seek(4);   // the blur box ended at 3; the mosaic box is on
    store().selectEffect("blur");
    await render(<RegionBoxes frameW={W} frameH={H} />);
    expect(screen.queryByTestId("region-box-blur")).toBeNull();
    expect(screen.queryByTestId("region-handle-tl")).toBeNull();
    expect(screen.queryByTestId("region-handle-br")).toBeNull();
    expect(screen.getByTestId("region-box-mosaic").props.pointerEvents).toBe("none");
  });

  test("a selected effect that is not a box gives no handles", async () => {
    store().seek(2.5);
    store().selectEffect("shake");
    await render(<RegionBoxes frameW={W} frameH={H} />);
    expect(screen.queryByTestId("region-handle-tl")).toBeNull();
    expect(screen.getByTestId("region-box-blur").props.pointerEvents).toBe("none");
  });

  test("a drag on the box moves it by the dragged fraction, as one undo step", async () => {
    store().seek(2.5);
    store().selectEffect("blur");
    await render(<RegionBoxes frameW={W} frameH={H} />);
    const [pan, pinch] = gestureOf("region-box-blur").gestures!;
    expect(pinch.handlers.onUpdate).toBeDefined();
    await act(() => {
      pan.handlers.onBegin({});
      pan.handlers.onStart({ translationX: 0, translationY: 0 });
      pan.handlers.onUpdate({ translationX: 27, translationY: 48 });
      pan.handlers.onUpdate({ translationX: 54, translationY: -48 });
      pan.handlers.onFinalize({}, true);
    });
    close(rect(), { x: 0.3, y: 0.1, w: 0.4, h: 0.25 });   // from the start, not stacked
    expect(store().past).toHaveLength(1);
    expect(screen.getByTestId("region-box-blur")).toHaveStyle({ left: rect().x * W, top: rect().y * H });
    expect(style("region-handle-tl")).toMatchObject({ left: rect().x * W - 22 });
    await act(() => { store().undo(); });
    expect(rect()).toEqual(BLUR);
    expect(store().selectedEffectId).toBe("blur");
  });

  test("a second drag starts from where the box now is and is its own undo step", async () => {
    store().seek(2.5);
    store().selectEffect("blur");
    await render(<RegionBoxes frameW={W} frameH={H} />);
    const drag = async () => {
      const [pan] = gestureOf("region-box-blur").gestures!;
      await act(() => { pan.handlers.onBegin({}); pan.handlers.onStart({}); pan.handlers.onUpdate({ translationX: 27, translationY: 0 }); pan.handlers.onFinalize({}, true); });
    };
    await drag(); await drag();
    close(rect(), { ...BLUR, x: 0.3 });
    expect(store().past).toHaveLength(2);
  });

  test("a pinch on the box scales both sides about its centre, as one undo step", async () => {
    store().seek(2.5);
    store().selectEffect("blur");
    await render(<RegionBoxes frameW={W} frameH={H} />);
    const [, pinch] = gestureOf("region-box-blur").gestures!;
    await act(() => {
      pinch.handlers.onBegin({});
      pinch.handlers.onStart({ scale: 1 });
      pinch.handlers.onUpdate({ scale: 1.2 });
      pinch.handlers.onUpdate({ scale: 1.5 });
      pinch.handlers.onFinalize({}, true);
    });
    close(rect(), scaleRect(BLUR, 1.5));
    expect(rect().w / rect().h).toBeCloseTo(BLUR.w / BLUR.h, 9);
    expect(store().past).toHaveLength(1);
  });

  test("the corner handles resize freely with the opposite corner fixed, one undo step each", async () => {
    store().seek(2.5);
    store().selectEffect("blur");
    await render(<RegionBoxes frameW={W} frameH={H} />);
    const br = gestureOf("region-handle-br");
    await act(() => { br.handlers.onBegin({}); br.handlers.onStart({}); br.handlers.onUpdate({ translationX: 0.1 * W, translationY: -0.05 * H }); br.handlers.onFinalize({}, true); });
    const afterBr = resizeRectCorner(BLUR, "br", 0.1, -0.05);
    close(rect(), afterBr);
    close(rect(), { x: 0.1, y: 0.2, w: 0.5, h: 0.2 });
    expect(store().past).toHaveLength(1);
    const tl = gestureOf("region-handle-tl");
    await act(() => { tl.handlers.onBegin({}); tl.handlers.onStart({}); tl.handlers.onUpdate({ translationX: 0.1 * W, translationY: 0.05 * H }); tl.handlers.onFinalize({}, true); });
    close(rect(), { x: 0.2, y: 0.25, w: 0.4, h: 0.15 });
    expect(store().past).toHaveLength(2);
  });

  test("a gesture that changes nothing leaves no undo step and the same project", async () => {
    store().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 8 })], effects: [makeEffect({ id: "full", type: "blurBox", start: 0, end: 4, rect: { x: 0, y: 0, w: 1, h: 1 } })] }));
    store().selectEffect("full");
    await render(<RegionBoxes frameW={W} frameH={H} />);
    const before = store().project;
    const [pan, pinch] = gestureOf("region-box-full").gestures!;
    await act(() => {
      pan.handlers.onBegin({}); pan.handlers.onStart({}); pan.handlers.onUpdate({ translationX: 40, translationY: 40 }); pan.handlers.onFinalize({}, true);   // a full-frame box cannot move
      pinch.handlers.onBegin({}); pinch.handlers.onStart({}); pinch.handlers.onUpdate({ scale: 2 }); pinch.handlers.onFinalize({}, true);                    // nor grow
      pan.handlers.onBegin({}); pan.handlers.onStart({}); pan.handlers.onFinalize({}, true);                                                                      // a touch with no update
    });
    expect(store().project).toBe(before);
    expect(store().past).toHaveLength(0);
  });

  test("only the selected box is written", async () => {
    store().seek(2.5);
    store().selectEffect("mosaic");
    await render(<RegionBoxes frameW={W} frameH={H} />);
    expect(screen.getByTestId("region-box-mosaic").props.accessibilityLabel).toBe("Mosaic box");
    const [pan] = gestureOf("region-box-mosaic").gestures!;
    await act(() => { pan.handlers.onBegin({}); pan.handlers.onStart({}); pan.handlers.onUpdate({ translationX: -27, translationY: 0 }); pan.handlers.onFinalize({}, true); });
    close(rect("mosaic"), moveRect(MOSAIC, -0.1, 0));
    expect(rect("blur")).toEqual(BLUR);
  });
});

describe("createRegionGestureSession", () => {
  test("a drag and a pinch in one touch sequence compose from the starting rect and make one undo step", () => {
    const s = createRegionGestureSession("blur", W, H);
    s.start("pan"); s.update("pan", { dx: 27, dy: 0 });
    s.start("pinch"); s.update("pinch", { scale: 1.5 });
    s.update("pan", { dx: 54, dy: 0 });
    s.finish("pinch"); s.finish("pan");
    close(rect(), scaleRect(moveRect(BLUR, 0.2, 0), 1.5));
    expect(store().past).toHaveLength(1);
    store().undo();
    expect(rect()).toEqual(BLUR);
  });

  test("the result does not depend on which gesture updates first", () => {
    const run = (order: Array<"pan" | "pinch">) => {
      store().setProject(project());
      const s = createRegionGestureSession("blur", W, H);
      for (const k of order) s.start(k);
      for (const k of order) s.update(k, k === "pan" ? { dx: 40, dy: -30 } : { scale: 0.7 });
      return rect();
    };
    expect(run(["pinch", "pan"])).toEqual(run(["pan", "pinch"]));
  });

  test("dragging past the edge and back is not sticky: every update recomputes from the start", () => {
    const s = createRegionGestureSession("blur", W, H);
    s.start("pan");
    s.update("pan", { dx: -1000, dy: 0 });
    expect(rect().x).toBe(0);
    s.update("pan", { dx: 27, dy: 0 });
    close(rect(), { ...BLUR, x: 0.2 });
    s.finish("pan");
    expect(store().past).toHaveLength(1);
  });

  test("coming back to the starting rect within a gesture restores it", () => {
    const s = createRegionGestureSession("blur", W, H);
    s.start("pan");
    s.update("pan", { dx: 27, dy: 0 });
    s.update("pan", { dx: 0, dy: 0 });
    s.finish("pan");
    close(rect(), BLUR);
  });

  test("a gesture that ends while another goes on keeps its part", () => {
    const s = createRegionGestureSession("blur", W, H);
    s.start("pan"); s.start("pinch");
    s.update("pinch", { scale: 0.5 });
    s.finish("pinch");
    s.update("pan", { dx: 27, dy: 0 });
    s.finish("pan");
    close(rect(), scaleRect(moveRect(BLUR, 0.1, 0), 0.5));
    expect(store().past).toHaveLength(1);
  });

  test("updates without a start, non-finite values, an unknown effect or a zero frame write nothing", () => {
    const before = store().project;
    const s = createRegionGestureSession("blur", W, H);
    s.update("pan", { dx: 50, dy: 50 });
    s.start("pan"); s.update("pan", { dx: NaN, dy: 10 }); s.finish("pan");
    s.start("pinch"); s.update("pinch", { scale: NaN }); s.finish("pinch");
    const gone = createRegionGestureSession("nope", W, H);
    gone.start("pan"); gone.update("pan", { dx: 50, dy: 0 }); gone.finish("pan");
    const other = createRegionGestureSession("shake", W, H);
    other.start("pan"); other.update("pan", { dx: 50, dy: 0 }); other.finish("pan");
    const flat = createRegionGestureSession("blur", 0, 0);
    flat.start("pan"); flat.update("pan", { dx: 50, dy: 0 }); flat.finish("pan");
    expect(store().project).toBe(before);
    expect(store().past).toHaveLength(0);
  });

  test("a start whose finish never arrived is dropped: the next start snapshots afresh", () => {
    const s = createRegionGestureSession("blur", W, H);
    s.start("pan"); s.update("pan", { dx: 27, dy: 0 });   // no finish
    s.begin("pan"); s.start("pan"); s.update("pan", { dx: 27, dy: 0 }); s.finish("pan");
    close(rect(), { ...BLUR, x: 0.3 });
  });
});
