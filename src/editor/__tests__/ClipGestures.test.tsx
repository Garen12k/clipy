import { render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import * as Haptics from "expo-haptics";
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

  test("updates and finishes from a gesture that never started are ignored", () => {
    const s = createClipGestureSession("a", W, H);
    s.update("pan", { dx: 54, dy: 0 });
    s.finish("pinch");
    expect(tf()).toEqual(DEFAULT_TRANSFORM);
    expect(store().past).toHaveLength(0);
  });
});
