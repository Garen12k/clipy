import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { makeClip, makeProject, TRANSITION_TYPES, type TransitionType } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { TransitionLayer } from "../components/TransitionLayer";

const W = 300, H = 400;                       // diagonal 500, half-diagonal 250
/** Two 4-s clips with a 1-s transition of `type`: the window is 3.5 … 4.5, the cut at 4. */
const load = (type: TransitionType, playhead: number) => {
  useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4, transitionOut: { type, duration: 1 } }), makeClip({ id: "b", sourceDuration: 4 })] }));
  useEditorStore.getState().seek(playhead);
};
const layout = async () => { await fireEvent(screen.getByTestId("transition-layer"), "layout", { nativeEvent: { layout: { x: 0, y: 0, width: W, height: H } } }); };
const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style);

beforeEach(() => { useEditorStore.getState().reset(); });

test("the ten old types are drawn as before: one black view over the frame whose opacity peaks at the cut", async () => {
  for (const type of TRANSITION_TYPES.slice(1, 11)) {
    load(type, 3.75);                                               // progress 0.25
    const view = await render(<TransitionLayer />);
    const layer = screen.getByTestId("transition-layer");
    expect(layer.props.style).toEqual({ position: "absolute", inset: 0, backgroundColor: "#000000", opacity: 0.5 });
    expect(layer.props.pointerEvents).toBe("none");
    expect(layer.children).toHaveLength(0);
    await view.unmount();
  }
});

test("outside a window, and without a project, nothing is drawn", async () => {
  await render(<TransitionLayer />);
  expect(screen.toJSON()).toBeNull();
  await act(() => { load("cover", 2); });
  expect(screen.toJSON()).toBeNull();
});

test("white flash: the same single view, white", async () => {
  load("flashWhite", 4);
  await render(<TransitionLayer />);
  expect(screen.getByTestId("transition-layer").props.style).toEqual({ position: "absolute", inset: 0, backgroundColor: "#FFFFFF", opacity: 1 });
});

test("clock wipe and pixelate are tag only: the black dip", async () => {
  for (const type of ["wipeClock", "pixelate"] as const) {
    load(type, 4.25);
    const view = await render(<TransitionLayer />);
    expect(screen.getByTestId("transition-layer").props.style).toEqual({ position: "absolute", inset: 0, backgroundColor: "#000000", opacity: 0.5 });
    await view.unmount();
  }
});

test("a shaped curtain draws nothing until the frame is measured, then one view; only its transform follows the playhead", async () => {
  load("cover", 3.75);
  await render(<TransitionLayer />);
  expect(screen.getByTestId("transition-layer").props.pointerEvents).toBe("none");
  expect(screen.queryByTestId("transition-shape")).toBeNull();
  await layout();
  // progress 0.25, before the cut: the panel starts at 0.75 of the width → 225
  expect(flat("transition-shape")).toMatchObject({ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, backgroundColor: "#000000", transform: [{ translateX: 225 }, { translateY: 0 }] });
  await act(() => { useEditorStore.getState().seek(4.25); });       // progress 0.75, after the cut: the panel ends at 0.25 → −225
  expect(flat("transition-shape")).toMatchObject({ left: 0, top: 0, right: 0, bottom: 0, transform: [{ translateX: -225 }, { translateY: 0 }] });
});

test("cover up and reveal down move the panel along y", async () => {
  load("coverUp", 3.75);
  await render(<TransitionLayer />);
  await layout();
  expect(flat("transition-shape").transform).toEqual([{ translateX: 0 }, { translateY: 300 }]);          // 0.75 · 400
  await act(() => { load("revealDown", 3.75); });
  expect(flat("transition-shape").transform).toEqual([{ translateX: 0 }, { translateY: -300 }]);
});

test("circle open: a black disc before the cut, a black ring after it — one fixed-size view each, scaled", async () => {
  load("circleOpen", 3.75);
  await render(<TransitionLayer />);
  await layout();
  // The disc: radius 250 about the centre (150, 200) → left −100, top −50, side 500.
  expect(flat("transition-shape")).toMatchObject({ left: -100, top: -50, width: 500, height: 500, borderRadius: 250, backgroundColor: "#000000", transform: [{ scale: 0.25 }] });
  await act(() => { useEditorStore.getState().seek(4.25); });
  // The ring: a clear circle of radius 250 inside a 250-thick black border → side 1000, left −350, top −300.
  const ring = flat("transition-shape");
  expect(ring).toMatchObject({ left: -350, top: -300, width: 1000, height: 1000, borderRadius: 500, borderWidth: 250, borderColor: "#000000", transform: [{ scale: 0.75 }] });
  expect(ring.backgroundColor).toBeUndefined();
});

test("circle close is the other way round", async () => {
  load("circleClose", 3.75);
  await render(<TransitionLayer />);
  await layout();
  expect(flat("transition-shape")).toMatchObject({ borderWidth: 250, transform: [{ scale: 0.75 }] });
  await act(() => { useEditorStore.getState().seek(4.25); });
  expect(flat("transition-shape")).toMatchObject({ borderRadius: 250, backgroundColor: "#000000", transform: [{ scale: 0.25 }] });
});

test("diagonal wipe: a black square of twice the diagonal, turned to the edge and moved along its normal", async () => {
  load("wipeDiagonal", 4);                                           // progress 0.5: the edge runs corner to corner; the cut → the 'after' side
  await render(<TransitionLayer />);
  await layout();
  const s = flat("transition-shape");
  // size 1000 about the centre → left −350, top −300; offset 0 + 500 along (0.8, 0.6) → (400, 300); turn atan2(0.6, 0.8)
  expect(s).toMatchObject({ left: -350, top: -300, width: 1000, height: 1000, backgroundColor: "#000000" });
  expect(s.transform[0].translateX).toBeCloseTo(400, 6);
  expect(s.transform[1].translateY).toBeCloseTo(300, 6);
  expect(s.transform[2]).toEqual({ rotate: `${Math.atan2(0.6, 0.8)}rad` });
});

test("the dip and the shaped container carry different keys: going from one to the other mounts a fresh view, so its layout is reported", async () => {
  // The element TransitionLayer returns, read through a component that calls it (its hooks become this component's).
  let drawn: ReturnType<typeof TransitionLayer> = null;
  const Probe = () => { drawn = TransitionLayer(); return drawn; };
  load("fade", 3.75);
  await render(<Probe />);
  expect(drawn!.key).toBe("dip");
  await act(() => { load("flashWhite", 4); });
  expect(drawn!.key).toBe("dip");
  await act(() => { load("cover", 3.75); });
  expect(drawn!.key).toBe("shape");
  // The fresh container starts unmeasured only until its own layout arrives.
  await layout();
  expect(flat("transition-shape")).toMatchObject({ transform: [{ translateX: 225 }, { translateY: 0 }] });
  await act(() => { load("wipeClock", 4.25); });
  expect(drawn!.key).toBe("dip");
});

test("the same size reported again sets no state (no re-render loop)", async () => {
  load("cover", 3.75);
  await render(<TransitionLayer />);
  await layout();
  const before = flat("transition-shape");
  await layout();
  expect(flat("transition-shape")).toEqual(before);
});

// Both ends of the window for every new type: nothing may be left over the outgoing clip at progress 0 or over the incoming one at 1.
describe("both ends of the window leave the picture clear", () => {
  const NEW = TRANSITION_TYPES.slice(11);
  const DIPS = ["flashWhite", "wipeClock", "pixelate"];
  /** The points of the frame that must be clear: the corners, the edge middles, the centre. */
  const POINTS = [[0, 0], [W, 0], [0, H], [W, H], [W / 2, 0], [W / 2, H], [0, H / 2], [W, H / 2], [W / 2, H / 2]];
  /** Whether the shape's paint covers a point STRICTLY inside it (a shape that only touches the frame's border covers nothing). */
  const covers = (s: Record<string, any>, x: number, y: number): boolean => {
    const eps = 1e-6;
    const t = Object.assign({}, ...(s.transform as object[])) as { translateX?: number; translateY?: number; scale?: number; rotate?: string };
    if (s.width === undefined) {                                    // the panel: the frame's own rectangle, moved
      const px = x - (t.translateX ?? 0), py = y - (t.translateY ?? 0);
      return px > eps && px < W - eps && py > eps && py < H - eps;
    }
    const cx = s.left + s.width / 2 + (t.translateX ?? 0), cy = s.top + s.height / 2 + (t.translateY ?? 0);
    if (s.borderWidth !== undefined) {                              // the ring: paint between the hole and the outer circle
      const d = Math.hypot(x - cx, y - cy), k = t.scale ?? 1;
      return d > (s.width / 2 - s.borderWidth) * k + eps && d < (s.width / 2) * k - eps;
    }
    if (s.borderRadius !== undefined) return Math.hypot(x - cx, y - cy) < (s.width / 2) * (t.scale ?? 1) - eps;   // the disc
    const a = parseFloat(t.rotate ?? "0");                          // the turned square: the point in the square's own axes
    const lx = (x - cx) * Math.cos(a) + (y - cy) * Math.sin(a), ly = -(x - cx) * Math.sin(a) + (y - cy) * Math.cos(a);
    return Math.abs(lx) < s.width / 2 - eps && Math.abs(ly) < s.height / 2 - eps;
  };

  test("the ten new types are the ones after the old eleven", () => {
    expect(NEW).toEqual(["cover", "reveal", "coverUp", "revealDown", "circleOpen", "circleClose", "wipeDiagonal", "wipeClock", "pixelate", "flashWhite"]);
  });

  test.each(NEW.flatMap((type) => [[type, 3.5, 0], [type, 4.5, 1]] as const))("%s at playhead %s (progress %s)", async (type, playhead, _progress) => {
    load(type, playhead);
    await render(<TransitionLayer />);
    if (DIPS.includes(type)) {
      expect(screen.getByTestId("transition-layer").props.style.opacity).toBe(0);
      return;
    }
    await layout();
    const layer = StyleSheet.flatten(screen.getByTestId("transition-layer").props.style);
    expect(layer.backgroundColor).toBeUndefined();                   // the measuring view itself paints nothing
    expect(layer.opacity).toBeUndefined();
    const s = flat("transition-shape");
    for (const [x, y] of POINTS) expect([type, x, y, covers(s, x, y)]).toEqual([type, x, y, false]);
  });

  test("the checker does see a curtain in the middle: each shape covers the side of its edge it should, and only that side", async () => {
    // progress 0.25: the incoming clip's place is black. [type, a point that is covered, a point that is clear]
    const rows: [TransitionType, number[], number[]][] = [
      ["cover", [W * 0.9, H / 2], [W * 0.5, H / 2]],                 // the edge at x = 0.75 W
      ["reveal", [W * 0.9, H / 2], [W * 0.5, H / 2]],
      ["coverUp", [W / 2, H * 0.9], [W / 2, H * 0.5]],               // the edge at y = 0.75 H
      ["revealDown", [W / 2, H * 0.1], [W / 2, H * 0.5]],            // the edge at y = 0.25 H
      ["circleOpen", [W / 2, H / 2 + 50], [W / 2, H / 2 + 70]],      // radius 0.25 · 250 = 62.5
      ["circleClose", [W / 2, H / 2 + 195], [W / 2, H / 2 + 180]],   // radius 0.75 · 250 = 187.5
      ["wipeDiagonal", [W * 0.2, H * 0.2], [W * 0.3, H * 0.3]],      // the edge at u + v = 0.5
    ];
    for (const [type, inside, outside] of rows) {
      load(type, 3.75);
      const view = await render(<TransitionLayer />);
      await layout();
      const s = flat("transition-shape");
      expect([type, covers(s, inside[0], inside[1]), covers(s, outside[0], outside[1])]).toEqual([type, true, false]);
      await view.unmount();
    }
  });

  test("after the cut the outgoing clip's place is black instead", async () => {
    const rows: [TransitionType, number[], number[]][] = [
      ["cover", [W * 0.1, H / 2], [W * 0.5, H / 2]],                 // progress 0.75: the edge at x = 0.25 W
      ["coverUp", [W / 2, H * 0.1], [W / 2, H * 0.5]],
      ["revealDown", [W / 2, H * 0.9], [W / 2, H * 0.5]],            // the edge at y = 0.75 H
      ["circleOpen", [W / 2, H / 2 + 195], [W / 2, H / 2 + 180]],
      ["circleClose", [W / 2, H / 2 + 50], [W / 2, H / 2 + 70]],
      ["wipeDiagonal", [W * 0.8, H * 0.8], [W * 0.7, H * 0.7]],      // the edge at u + v = 1.5
    ];
    for (const [type, inside, outside] of rows) {
      load(type, 4.25);
      const view = await render(<TransitionLayer />);
      await layout();
      const s = flat("transition-shape");
      expect([type, covers(s, inside[0], inside[1]), covers(s, outside[0], outside[1])]).toEqual([type, true, false]);
      await view.unmount();
    }
  });
});
