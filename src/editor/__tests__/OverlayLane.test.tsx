import { StyleSheet } from "react-native";
import { act, render, screen, within } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { makeClip, makeEffect, makeOverlay, makeProject, makeSticker, type Overlay } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { OverlayLane } from "../components/OverlayLane";
import { Timeline } from "../components/Timeline";
import { useSnapGuide } from "../snapping";
import { LANE_GAP, LANE_HEIGHT, laneModel, overlayRows, ROW_SLOP } from "../timelineLayout";

const ROW = LANE_HEIGHT + LANE_GAP;
type G = { handlers: { onStart: () => void; onUpdate: (e: { translationX: number }) => void; onEnd?: () => void; onFinalize: () => void } };
const st = () => useEditorStore.getState();
const clips = [makeClip({ id: "a", sourceDuration: 20 })];
/** The owner's report: a text "Hi" and an emoji that share two seconds. */
const hi = makeOverlay({ id: "hi", text: "Hi", start: 0, end: 3 });
const emoji = makeSticker({ id: "emoji", start: 2, end: 5 });
const setOverlays = (overlays: Overlay[]) => { st().setProject(makeProject({ clips, overlays })); st().setZoom(50); };
const pill = (id: string) => screen.getByTestId(`overlay-pill-${id}`);
const flat = (id: string) => StyleSheet.flatten(pill(id).props.style);
const lane = () => StyleSheet.flatten(screen.getByTestId("overlay-lane").props.style);
const pillIds = () => within(screen.getByTestId("overlay-lane")).getAllByTestId(/^overlay-pill-/).map((b) => b.props.testID);

beforeEach(() => { st().reset(); useSnapGuide.setState({ time: null }); });

test("the owner's case: the text and the emoji that share time sit in two rows, the text on top — neither covers the other", async () => {
  setOverlays([hi, emoji]);
  await render(<OverlayLane />);
  expect(pill("hi")).toHaveStyle({ position: "absolute", top: 0, left: 0, width: 150, height: LANE_HEIGHT });
  expect(pill("emoji")).toHaveStyle({ position: "absolute", top: ROW, left: 100, width: 150, height: LANE_HEIGHT });
  // The lane is its rows high: two bars and the gap between them, after the gap every lane starts with.
  expect(lane()).toEqual({ position: "relative", height: 2 * LANE_HEIGHT + LANE_GAP, marginTop: LANE_GAP });
  expect(lane().height + lane().marginTop).toBe(laneModel(st().project).lanes.find((l) => l.id === "overlays")!.rows * ROW);
});

test("bars that share no time share the one row: the lane is as high as it always was", async () => {
  setOverlays([hi, { ...emoji, start: 3, end: 5 }, makeOverlay({ id: "late", text: "Later", start: 8, end: 9 })]);
  await render(<OverlayLane />);
  for (const id of ["hi", "emoji", "late"]) expect(pill(id)).toHaveStyle({ top: 0 });
  expect(lane()).toEqual({ position: "relative", height: LANE_HEIGHT, marginTop: LANE_GAP });
});

test("forty captions and a sticker over one of them are two rows, not forty-one", async () => {
  const captions = Array.from({ length: 40 }, (_, i) => makeOverlay({ id: `c${i}`, text: `c${i}`, start: i * 0.5, end: (i + 1) * 0.5 }));
  setOverlays([...captions, makeSticker({ id: "s", start: 2.1, end: 2.4 })]);
  await render(<OverlayLane />);
  for (const c of captions) expect(pill(c.id)).toHaveStyle({ top: 0 });
  expect(pill("s")).toHaveStyle({ top: ROW });
  expect(lane().height).toBe(2 * LANE_HEIGHT + LANE_GAP);
});

test("every bar's row is the one overlayRows gives it — the chain A / B / C is two rows with A and C sharing", async () => {
  const list = [makeOverlay({ id: "A", text: "A", start: 0, end: 3 }), makeSticker({ id: "B", start: 2, end: 6 }), makeOverlay({ id: "C", text: "C", start: 5, end: 8 })];
  setOverlays(list);
  await render(<OverlayLane />);
  const { rows, rowOf } = overlayRows(list);
  expect(rows).toBe(2);
  for (const o of list) expect(flat(o.id).top).toBe(rowOf[o.id] * ROW);
  expect([flat("A").top, flat("B").top, flat("C").top]).toEqual([0, ROW, 0]);
});

test("the bars are siblings in the one lane, in the order of the array, whatever their rows: there is no row container to move between", async () => {
  setOverlays([emoji, hi]);
  await render(<OverlayLane />);
  expect(pillIds()).toEqual(["overlay-pill-emoji", "overlay-pill-hi"]);
  expect(flat("hi").top).toBe(0);
  expect(flat("emoji").top).toBe(ROW);
  expect(screen.queryAllByTestId(/row/)).toEqual([]);
});

test("times that change so that a bar moves to another row do not remount it: the same bar, at a new offset", async () => {
  setOverlays([hi, emoji]);
  await render(<OverlayLane />);
  const before = { hi: pill("hi"), emoji: pill("emoji"), gesture: pill("emoji").props.gesture };
  expect(flat("emoji").top).toBe(ROW);
  // (The project is replaced the way a transient edit replaces it: the zoom, and so each bar's gestures, are left alone.)
  // The emoji now starts first: it takes the top row and the text moves down.
  await act(() => { useEditorStore.setState({ project: { ...st().project!, overlays: [{ ...hi, start: 1, end: 3 }, { ...emoji, start: 0, end: 2.5 }] } }); });
  expect([flat("emoji").top, flat("hi").top]).toEqual([0, ROW]);
  expect(pill("emoji")).toBe(before.emoji);
  expect(pill("hi")).toBe(before.hi);
  expect(pill("emoji").props.gesture).toBe(before.gesture);
  expect(pillIds()).toEqual(["overlay-pill-hi", "overlay-pill-emoji"]);
  // Clear of each other: one row again, still the same bars.
  await act(() => { useEditorStore.setState({ project: { ...st().project!, overlays: st().project!.overlays.map((o) => (o.id === "hi" ? { ...o, start: 6, end: 8 } : o)) } }); });
  expect([flat("emoji").top, flat("hi").top]).toEqual([0, 0]);
  expect(lane().height).toBe(LANE_HEIGHT);
  expect(pill("emoji")).toBe(before.emoji);
  expect(pill("hi")).toBe(before.hi);
});

test("a bar dragged over another, frame by frame, changes rows under the finger without being remounted: the gesture goes on and ends as one undo step", async () => {
  // Text 4 – 6; the sticker 8 – 10 is dragged left over it and on past its start.
  setOverlays([makeOverlay({ id: "t", text: "T", start: 4, end: 6 }), makeSticker({ id: "s", start: 8, end: 10 })]);
  await render(<OverlayLane />);
  const bar = pill("s"), other = pill("t");
  const g = bar.props.gesture as G;
  const tops: number[] = [];
  await act(() => { g.handlers.onStart(); });
  for (let seconds = 0.25; seconds <= 7; seconds += 0.25) {
    await act(() => { g.handlers.onUpdate({ translationX: -seconds * 50 }); });
    expect(pill("s")).toBe(bar);
    expect(pill("t")).toBe(other);
    expect(pill("s").props.gesture).toBe(g);
    expect(flat("s").top).toBe(overlayRows(st().project!.overlays).rowOf.s * ROW);
    tops.push(flat("s").top);
  }
  // Clear (top row) → over the text, starting later (second row) → starting first (top row; the text moves down) → clear again.
  expect(tops.filter((t, i) => i > 0 && t !== tops[i - 1])).toEqual([ROW, 0]);
  expect(st().project!.overlays.find((o) => o.id === "s")).toMatchObject({ start: 1, end: 3 });
  await act(() => { g.handlers.onEnd?.(); g.handlers.onFinalize(); });
  expect(st().past).toHaveLength(1);
  expect(pill("s")).toBe(bar);
});

test("a caption bar has its own colour, a text bar and a sticker bar theirs; every label is black", async () => {
  setOverlays([makeOverlay({ id: "t1", text: "Hi", start: 0, end: 3 }), makeOverlay({ id: "c1", kind: "caption", text: "Cap", start: 4, end: 6 }), makeSticker({ id: "s1", start: 7, end: 9 })]);
  await render(<OverlayLane />);
  expect(pill("t1")).toHaveStyle({ backgroundColor: theme.colors.kindText });
  expect(pill("c1")).toHaveStyle({ backgroundColor: theme.colors.kindCaption });
  expect(pill("s1")).toHaveStyle({ backgroundColor: theme.colors.kindSticker });
  expect(theme.colors.kindCaption).not.toBe(theme.colors.kindText);
  for (const id of ["t1", "c1", "s1"]) expect(within(pill(id)).getAllByText(/./)[0]).toHaveStyle({ color: theme.colors.onKind });
});

test("the selected bar keeps its emphasis in any row; no bar is see-through or lifted above the others", async () => {
  setOverlays([hi, emoji]);
  await render(<OverlayLane />);
  await act(() => { st().selectOverlay("emoji"); });
  expect(pill("emoji")).toHaveStyle({ top: ROW, borderWidth: 2, borderColor: theme.colors.text });
  expect(pill("hi")).toHaveStyle({ top: 0, borderColor: "transparent" });
  for (const id of ["hi", "emoji"]) { expect(flat(id).opacity ?? 1).toBe(1); expect(flat(id).zIndex ?? 0).toBe(0); }
  expect(screen.getByLabelText("Text start handle")).toBeTruthy();
});

test("a bar's touch area stays in its own row: it reaches no further up or down than half the gap between two rows", async () => {
  setOverlays([hi, emoji]);
  await render(<OverlayLane />);
  for (const id of ["hi", "emoji"]) {
    const slop = pill(id).props.hitSlop as undefined | number | { top?: number; bottom?: number };
    const vertical = slop === undefined ? [0, 0] : typeof slop === "number" ? [slop, slop] : [slop.top ?? 0, slop.bottom ?? 0];
    for (const v of vertical) expect(v).toBeLessThanOrEqual(ROW_SLOP);
  }
  expect(ROW_SLOP).toBe(LANE_GAP / 2);
});

test("in the timeline the effects lane starts right under the last text / sticker row, and the timeline is the model's height", async () => {
  const project = makeProject({ clips, overlays: [hi, emoji], effects: [makeEffect({ id: "e", start: 0, end: 1 })] });
  st().setProject(project);
  await render(<Timeline />);
  const model = laneModel(project);
  expect(model.lanes).toEqual([{ id: "overlays", index: 0, top: 120, rows: 2 }, { id: "effects", index: 2, top: 184, rows: 1 }]);
  expect(screen.queryAllByTestId(/-lane$/).map((l) => l.props.testID)).toEqual(["overlay-lane", "effect-lane"]);
  // In the flow: the clip area, then each lane's gap and height — what the lanes add up to is exactly the model's.
  const heights = ["overlay-lane", "effect-lane"].map((id) => { const s = StyleSheet.flatten(screen.getByTestId(id).props.style); return s.marginTop + s.height; });
  expect(heights).toEqual([2 * ROW, ROW]);
  expect(heights.reduce((a, b) => a + b, 0)).toBe(model.lanesHeight);
  expect(screen.getByTestId("timeline-root")).toHaveStyle({ height: model.height });
  expect(model.height).toBe(216);
});
