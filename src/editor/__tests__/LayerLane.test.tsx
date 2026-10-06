import { StyleSheet } from "react-native";
import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import * as Haptics from "expo-haptics";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { layerEnd } from "@/src/editor/model/timeline";
import { makeAudioTrack, makeClip, makeEffect, makeLayer, makeOverlay, makePhotoClip, makeProject, makeSticker, type LayerClip } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { useToast } from "@/src/ui/Toast";
import { layerTrimFromDrag } from "../components/LayerBar";
import { LayerLane } from "../components/LayerLane";
import { useSnapGuide } from "../snapping";
import { LANE_GAP, LANE_HEIGHT, laneModel } from "../timelineLayout";

const TOAST = "Only two video layers can play at the same time.";
const photoLayer = (id: string, start: number, seconds = 3): LayerClip => ({ ...makePhotoClip({ id, seconds }), start });
const main = makeClip({ id: "a", sourceDuration: 20 });
const p = makeProject({ clips: [main], overlays: [makeOverlay({ id: "o1" })], audioTracks: [makeAudioTrack({ id: "m1", sourceDuration: 5 })],
  layers: [
    makeLayer({ id: "v1", sourceDuration: 10, trimStart: 2, trimEnd: 6, start: 1 }),   // 1 – 5
    photoLayer("ph", 2),                                                                // 2 – 5
    makeLayer({ id: "v2", sourceDuration: 5, start: 8 }),                               // 8 – 13
  ] });
const show = jest.fn();
beforeEach(() => {
  show.mockClear();
  useToast.setState({ show });
  useEditorStore.getState().reset(); useEditorStore.getState().setProject(p); useEditorStore.getState().setZoom(50);
});

const st = () => useEditorStore.getState();
const layer = (id: string) => st().project!.layers.find((l) => l.id === id)!;
type G = { handlers: { onStart: () => void; onUpdate: (e: { translationX: number }) => void; onEnd: () => void } };
const gestureOf = (node: { props: { gesture?: unknown } }) => node.props.gesture as G;
const drag = (g: G, ...xs: number[]) => act(() => { g.handlers.onStart(); for (const x of xs) g.handlers.onUpdate({ translationX: x }); g.handlers.onEnd(); });
/** A handle of layer `id`, selecting it first: handles exist only on the selected bar. */
const handleOf = async (id: string, which: "start" | "end") => { await act(() => { st().select(id); }); return gestureOf(screen.getByLabelText(`Layer ${which} handle`)); };
const setLayers = (layers: LayerClip[]) => { st().setProject(makeProject({ clips: [main], layers })); st().setZoom(50); };

test("every layer has its own row, in the order of project.layers: a lane high, in the flow, holding that layer's bar and no other", async () => {
  await render(<LayerLane />);
  const rows = within(screen.getByTestId("layer-lane")).getAllByTestId(/^layer-row-/);
  expect(rows.map((r) => r.props.testID)).toEqual(["layer-row-v1", "layer-row-ph", "layer-row-v2"]);
  for (const id of ["v1", "ph", "v2"]) {
    const row = screen.getByTestId(`layer-row-${id}`);
    expect(StyleSheet.flatten(row.props.style)).toEqual({ position: "relative", height: LANE_HEIGHT, marginTop: LANE_GAP });
    expect(within(row).getAllByTestId(/^layer-bar-[a-z0-9]+$/).map((b) => b.props.testID)).toEqual([`layer-bar-${id}`]);
  }
  // The group itself has no size of its own: its height is its rows', which is what laneModel counts.
  expect(screen.getByTestId("layer-lane").props.style).toBeUndefined();
  expect(laneModel(st().project).lanes.find((l) => l.id === "layers")!.rows).toBe(rows.length);
});

test("rows keep the order of the array: a new layer is the bottom row, and a removed one leaves the other rows mounted", async () => {
  await render(<LayerLane />);
  const v2 = screen.getByTestId("layer-bar-v2");
  await act(() => { st().setProject({ ...st().project!, layers: [...st().project!.layers, photoLayer("new", 0)] }); });
  expect(screen.getAllByTestId(/^layer-row-/).map((r) => r.props.testID)).toEqual(["layer-row-v1", "layer-row-ph", "layer-row-v2", "layer-row-new"]);
  await act(() => { st().setProject({ ...st().project!, layers: st().project!.layers.filter((l) => l.id !== "ph") }); });
  expect(screen.getAllByTestId(/^layer-row-/).map((r) => r.props.testID)).toEqual(["layer-row-v1", "layer-row-v2", "layer-row-new"]);
  expect(screen.getByTestId("layer-bar-v2")).toBe(v2);
});

test("the lane holds one bar per layer, placed by start and output length, titled Layer, in the layer colour", async () => {
  await render(<LayerLane />);
  expect(screen.getByTestId("layer-bar-v1")).toHaveStyle({ position: "absolute", left: 50, width: 200, height: 28, backgroundColor: theme.colors.laneLayer });
  expect(screen.getByTestId("layer-bar-ph")).toHaveStyle({ position: "absolute", left: 100, width: 150, backgroundColor: theme.colors.laneLayer });
  expect(screen.getByTestId("layer-bar-v2")).toHaveStyle({ position: "absolute", left: 400, width: 250 });
  expect(screen.getAllByText("Layer")).toHaveLength(3);
  expect(screen.getAllByLabelText("Video layer")).toHaveLength(2);
  expect(screen.getAllByLabelText("Photo layer")).toHaveLength(1);
});

test("the bar's width is the output length: speed counts", async () => {
  setLayers([makeLayer({ id: "f", sourceDuration: 8, speed: 2, start: 1 })]);
  await render(<LayerLane />);
  expect(screen.getByTestId("layer-bar-f")).toHaveStyle({ left: 50, width: 200 });
});

test("tapping a bar selects the layer like a clip (exclusively); tapping the selected bar deselects", async () => {
  st().selectOverlay("o1");
  await render(<LayerLane />);
  await fireEvent.press(screen.getByTestId("layer-bar-v1"));
  expect(st()).toMatchObject({ selectedClipId: "v1", selectedOverlayId: null, selectedEffectId: null, selectedAudioId: null });
  expect(screen.getByTestId("layer-bar-v1")).toHaveStyle({ borderColor: theme.colors.text });
  expect(screen.getByTestId("layer-bar-v2")).toHaveStyle({ borderColor: theme.colors.laneLayer });
  await fireEvent.press(screen.getByTestId("layer-bar-ph"));
  expect(st().selectedClipId).toBe("ph");
  await fireEvent.press(screen.getByTestId("layer-bar-ph"));
  expect(st().selectedClipId).toBeNull();
  // A selected main clip is not a selected bar.
  await act(() => { st().select("a"); });
  for (const id of ["v1", "ph", "v2"]) expect(screen.getByTestId(`layer-bar-${id}`)).toHaveStyle({ borderColor: theme.colors.laneLayer, zIndex: 0 });
});

test("no bar is drawn see-through, not even one that shares its time with an earlier layer; the selected bar keeps its zIndex", async () => {
  await render(<LayerLane />);
  // ph (2 – 5) plays over v1 (1 – 5): each has its own row, so nothing covers anything.
  for (const id of ["v1", "ph", "v2"]) {
    expect(screen.getByTestId(`layer-bar-${id}`)).toHaveStyle({ zIndex: 0 });
    expect(StyleSheet.flatten(screen.getByTestId(`layer-bar-${id}`).props.style).opacity ?? 1).toBe(1);
  }
  await act(() => { st().select("v1"); });
  for (const id of ["v1", "ph", "v2"]) expect(StyleSheet.flatten(screen.getByTestId(`layer-bar-${id}`).props.style).opacity ?? 1).toBe(1);
  expect(screen.getByTestId("layer-bar-v1")).toHaveStyle({ zIndex: 1 });
  expect(screen.getByTestId("layer-bar-ph")).toHaveStyle({ zIndex: 0 });
});

test("a long-press drag moves that layer only, as one undo step; a second drag starts from the new position", async () => {
  await render(<LayerLane />);
  const g = gestureOf(screen.getByTestId("layer-bar-v2"));
  await drag(g, 25, 50);
  expect(layer("v2")).toMatchObject({ start: 9, trimStart: 0, trimEnd: 5 });
  expect(layer("v1")).toMatchObject({ start: 1, trimStart: 2, trimEnd: 6 });
  expect(st().project!.clips).toBe(p.clips);
  expect(st().past).toHaveLength(1);
  await drag(g, -100);
  expect(layer("v2").start).toBe(7);
  expect(st().past).toHaveLength(2);
  await act(() => { st().undo(); });
  expect(layer("v2").start).toBe(9);
  // Never before the start of the video — and stopping there is not a refusal.
  await drag(g, -5000);
  expect(layer("v2").start).toBe(0);
  await drag(g, -5000);
  expect(show).not.toHaveBeenCalled();
});

test("handles show only on the selected bar; each trims its own end, one undo step per drag", async () => {
  await render(<LayerLane />);
  expect(screen.queryByLabelText("Layer start handle")).toBeNull();
  expect(screen.queryByLabelText("Layer end handle")).toBeNull();
  await act(() => { st().select("v1"); });
  expect(screen.getAllByLabelText("Layer start handle")).toHaveLength(1);
  // Left handle: the head is cut and the END keeps its project time.
  await drag(await handleOf("v1", "start"), 25, 50);
  expect(layer("v1")).toMatchObject({ trimStart: 3, trimEnd: 6, start: 2 });
  expect(layerEnd(layer("v1"))).toBe(5);
  expect(st().past).toHaveLength(1);
  // Right handle: the start stays.
  await drag(await handleOf("v1", "end"), 100);
  expect(layer("v1")).toMatchObject({ trimStart: 3, trimEnd: 8, start: 2 });
  expect(st().past).toHaveLength(2);
  // A second trim starts from the new edge.
  await drag(await handleOf("v1", "end"), -50);
  expect(layer("v1").trimEnd).toBe(7);
  expect(layer("v2")).toMatchObject({ start: 8, trimStart: 0, trimEnd: 5 });
  await act(() => { st().undo(); });
  expect(layer("v1").trimEnd).toBe(8);
});

test("a trim handle survives its own drag: the layer stays selected and the handle is still there, without selecting again", async () => {
  await render(<LayerLane />);
  await act(() => { st().select("v1"); });
  await drag(gestureOf(screen.getByLabelText("Layer start handle")), 25, 50);
  expect(layer("v1")).toMatchObject({ trimStart: 3, start: 2 });
  expect(st().selectedClipId).toBe("v1");
  expect(screen.getAllByLabelText("Layer start handle")).toHaveLength(1);
  // The handle now on screen carries on from the new edge.
  await drag(gestureOf(screen.getByLabelText("Layer start handle")), 50);
  expect(layer("v1")).toMatchObject({ trimStart: 4, start: 3 });
  await drag(gestureOf(screen.getByLabelText("Layer end handle")), -50);
  expect(layer("v1").trimEnd).toBe(5);
  expect(st().selectedClipId).toBe("v1");
  expect(screen.getAllByLabelText("Layer end handle")).toHaveLength(1);
  expect(st().past).toHaveLength(3);
});

test("a layer whose file is missing shows the warning badge the audio bar shows", async () => {
  await render(<LayerLane />);
  expect(screen.queryByTestId("layer-bar-v1-missing")).toBeNull();
  await act(() => { useEditorStore.setState({ missingSourceUris: [layer("v1").sourceUri] }); });
  expect(screen.getByTestId("layer-bar-v1-missing")).toHaveStyle({ position: "absolute", backgroundColor: theme.colors.danger });
  expect(screen.queryByTestId("layer-bar-v2-missing")).toBeNull();
  expect(screen.queryByTestId("layer-bar-ph-missing")).toBeNull();
});

test("trims stop at the source, at project time 0 and at the minimum length — none of them is a refusal", async () => {
  st().select("v1");
  await render(<LayerLane />);
  const left = () => handleOf("v1", "start");
  const right = () => handleOf("v1", "end");
  await drag(await left(), -5000);            // 1 s of room before project time 0
  expect(layer("v1")).toMatchObject({ trimStart: 1, trimEnd: 6, start: 0 });
  await drag(await left(), -5000);            // already there
  expect(layer("v1")).toMatchObject({ trimStart: 1, start: 0 });
  await drag(await right(), 5000);
  expect(layer("v1")).toMatchObject({ trimStart: 1, trimEnd: 10, start: 0 });
  await drag(await right(), 5000);
  await drag(await right(), -5000);
  expect(layer("v1").trimEnd).toBeCloseTo(1.3, 9);
  expect(layer("v1").start).toBe(0);
  await drag(await right(), -5000);
  await drag(await right(), 5000);
  await drag(await left(), 5000);
  expect(layer("v1").trimStart).toBeCloseTo(9.7, 9);
  expect(layerEnd(layer("v1"))).toBeCloseTo(9, 9);
  await drag(await left(), 5000);
  expect(show).not.toHaveBeenCalled();
});

test("the drag distance is output seconds: speed is applied through timeline.ts", async () => {
  setLayers([makeLayer({ id: "f", sourceDuration: 20, trimStart: 4, trimEnd: 12, speed: 2, start: 3 })]);   // 3 – 7
  st().select("f");
  await render(<LayerLane />);
  await drag(await handleOf("f", "start"), 50);   // 1 s of output = 2 s of source
  expect(layer("f")).toMatchObject({ trimStart: 6, trimEnd: 12, start: 4 });
  await drag(await handleOf("f", "end"), 50);
  expect(layer("f")).toMatchObject({ trimStart: 6, trimEnd: 14, start: 4 });
});

test("a reversed layer: the left handle cuts what plays first (the source END), the right handle the source start", async () => {
  setLayers([makeLayer({ id: "r", sourceDuration: 10, trimStart: 2, trimEnd: 6, reversed: true, start: 1 })]);   // 1 – 5
  st().select("r");
  await render(<LayerLane />);
  await drag(await handleOf("r", "start"), 50);
  expect(layer("r")).toMatchObject({ trimStart: 2, trimEnd: 5, start: 2 });
  expect(layerEnd(layer("r"))).toBe(5);
  await drag(await handleOf("r", "end"), 100);
  expect(layer("r")).toMatchObject({ trimStart: 0, trimEnd: 5, start: 2 });
  expect(layerEnd(layer("r"))).toBe(7);
  // Bounds, mirrored: the head grows to project time 0, the tail shrinks to the minimum.
  await drag(await handleOf("r", "start"), -5000);
  expect(layer("r")).toMatchObject({ trimStart: 0, trimEnd: 7, start: 0 });
  await drag(await handleOf("r", "end"), -5000);
  expect(layer("r").trimStart).toBeCloseTo(6.7, 9);
  expect(layer("r").start).toBe(0);
  expect(show).not.toHaveBeenCalled();
});

test("layerTrimFromDrag: which source end each handle moves, and the anchor", () => {
  const from = { start: 1, trimStart: 2, trimEnd: 6 };
  const v = makeLayer({ id: "v", sourceDuration: 10, ...from });
  expect(layerTrimFromDrag(v, "left", from, 50, 50)).toEqual({ trimStart: 3, trimEnd: 6, anchor: "start" });
  expect(layerTrimFromDrag(v, "right", from, 50, 50)).toEqual({ trimStart: 2, trimEnd: 7, anchor: "end" });
  const r = { ...v, reversed: true };
  expect(layerTrimFromDrag(r, "left", from, 50, 50)).toEqual({ trimStart: 2, trimEnd: 5, anchor: "start" });
  expect(layerTrimFromDrag(r, "right", from, 50, 50)).toEqual({ trimStart: 1, trimEnd: 6, anchor: "end" });
  expect(layerTrimFromDrag(photoLayer("ph", 2), "right", { start: 2, trimStart: 0, trimEnd: 3 }, -5000, 50)).toEqual({ trimStart: 0, trimEnd: 0.5, anchor: "end" });
});

test("a photo layer has only the end handle, which sets its length", async () => {
  st().select("ph");
  await render(<LayerLane />);
  expect(screen.queryByLabelText("Layer start handle")).toBeNull();
  await drag(await handleOf("ph", "end"), 50);
  expect(layer("ph")).toMatchObject({ trimStart: 0, trimEnd: 4, start: 2 });
  expect(st().past).toHaveLength(1);
  await drag(await handleOf("ph", "end"), -5000);
  expect(layer("ph").trimEnd).toBe(0.5);
  expect(show).not.toHaveBeenCalled();
});

describe("the two-video-layers rule", () => {
  const three = () => setLayers([
    makeLayer({ id: "x", sourceDuration: 4, start: 0 }),                                // 0 – 4
    makeLayer({ id: "y", sourceDuration: 4, start: 0 }),                                // 0 – 4
    makeLayer({ id: "z", sourceDuration: 10, trimStart: 4, trimEnd: 8, start: 6 }),     // 6 – 10
  ]);

  test("a refused move leaves the bar at its last valid place and shows one toast when the drag ends", async () => {
    three();
    await render(<LayerLane />);
    const g = gestureOf(screen.getByTestId("layer-bar-z"));
    await act(() => { g.handlers.onStart(); g.handlers.onUpdate({ translationX: -50 }); g.handlers.onUpdate({ translationX: -150 }); g.handlers.onUpdate({ translationX: -200 }); });
    expect(layer("z").start).toBe(5);
    expect(show).not.toHaveBeenCalled();   // nothing while the finger is down
    await act(() => { g.handlers.onEnd(); });
    expect(show).toHaveBeenCalledTimes(1);
    expect(show).toHaveBeenCalledWith(TOAST);
    expect(st().past).toHaveLength(1);
    // The next drag starts clean.
    await drag(g, 50);
    expect(layer("z").start).toBe(6);
    expect(show).toHaveBeenCalledTimes(1);
  });

  test("a refused trim shows the toast once too", async () => {
    three();
    st().select("z");
    await render(<LayerLane />);
    await drag(gestureOf(screen.getByLabelText("Layer start handle")), -50, -150, -160);
    expect(layer("z")).toMatchObject({ trimStart: 3, start: 5 });
    expect(show).toHaveBeenCalledTimes(1);
    expect(show).toHaveBeenCalledWith(TOAST);
  });

  test("a refusal within 2 px of where the finger went down is not announced", async () => {
    setLayers([makeLayer({ id: "x", sourceDuration: 4, start: 0 }), makeLayer({ id: "y", sourceDuration: 4, start: 0 }), makeLayer({ id: "z", sourceDuration: 4, start: 4 })]);
    await render(<LayerLane />);
    await drag(gestureOf(screen.getByTestId("layer-bar-z")), -1, -2);
    expect(layer("z").start).toBe(4);
    expect(show).not.toHaveBeenCalled();
  });
});

test("a very short layer is drawn 12 pt wide without a label and stays tappable; both handles fit", async () => {
  setLayers([{ ...makeLayer({ id: "t", sourceDuration: 20, speed: 4, trimEnd: 0.4, start: 2 }) }]);   // 0.1 s on screen
  await render(<LayerLane />);
  expect(screen.getByTestId("layer-bar-t")).toHaveStyle({ left: 100, width: 12 });
  expect(screen.getByTestId("layer-bar-t").props.hitSlop).toBe(8);
  expect(screen.queryByText("Layer")).toBeNull();
  await fireEvent.press(screen.getByTestId("layer-bar-t"));
  expect(st().selectedClipId).toBe("t");
  expect(screen.getByLabelText("Layer start handle")).toHaveStyle({ left: 0, width: 6 });
  expect(screen.getByLabelText("Layer end handle")).toHaveStyle({ right: 0, width: 6 });
});

describe("snapping", () => {
  // The project of model/__tests__/snap.test.ts. Main track a 0–4, b 4–7. Text o 1–2.5. Sticker s 6–6.5. Music m 0.5–9.5. Layer l 3–5.
  // Effect e 5.5–6.5. Beats 2 and 6. Playhead 3.3. Zoom 80 → an edge within 0.1 s of a target snaps.
  const snapProject = makeProject({
    clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 6, speed: 2 })],
    overlays: [makeOverlay({ id: "o", start: 1, end: 2.5 }), makeSticker({ id: "s", start: 6, end: 6.5 })],
    audioTracks: [makeAudioTrack({ id: "m", sourceDuration: 9, start: 0.5 })],
    layers: [makeLayer({ id: "l", sourceDuration: 4, trimEnd: 2, start: 3 })],
    effects: [makeEffect({ id: "e", start: 5.5, end: 6.5 })],
    beatMarkers: [2, 6],
  });
  const buzz = Haptics.impactAsync as jest.Mock;
  const guide = () => useSnapGuide.getState().time;
  type SnapG = { handlers: { onStart: () => void; onUpdate: (e: { translationX: number }) => void; onEnd?: () => void; onFinalize: () => void } };
  /** One whole gesture at zoom 80, `seconds` of drag per frame; returns what was showing just before the finger lifted. */
  const snapDrag = async (g: SnapG, ...seconds: number[]) => {
    await act(() => { g.handlers.onStart(); for (const s of seconds) g.handlers.onUpdate({ translationX: s * 80 }); });
    const held = { guide: guide(), buzzes: buzz.mock.calls.length };
    await act(() => { g.handlers.onEnd?.(); g.handlers.onFinalize(); });
    expect(guide()).toBeNull();
    expect(useEditorStore.getState().past).toHaveLength(1);
    return held;
  };
  beforeEach(() => {
    useEditorStore.getState().reset(); useEditorStore.getState().setProject(snapProject); useEditorStore.getState().seek(3.3); useEditorStore.getState().setZoom(80);
    useSnapGuide.setState({ time: null }); buzz.mockClear();
  });
  const l = () => layer("l");
  const snapHandle = async (id: string, which: "start" | "end") => (await handleOf(id, which)) as unknown as SnapG;
  const bar = (id: string) => gestureOf(screen.getByTestId(`layer-bar-${id}`)) as unknown as SnapG;

  test("a move snaps the start onto the playhead", async () => {
    await render(<LayerLane />);
    // start 3.27 → 0.03 from the playhead at 3.3; the end 5.27 is near nothing
    const held = await snapDrag(bar("l"), 0.27);
    expect(l()).toMatchObject({ start: 3.3, trimStart: 0, trimEnd: 2 });
    expect(held).toEqual({ guide: 3.3, buzzes: 1 });
    expect(show).not.toHaveBeenCalled();
  });

  test("a move onto the beat: the bar starts at 2", async () => {
    await render(<LayerLane />);
    const held = await snapDrag(bar("l"), -0.96);   // start 2.04 → 2 (and the end 4.04 → the cut at 4: the same place)
    expect(l().start).toBe(2);
    expect(held.buzzes).toBe(1);
    expect([2, 4]).toContain(held.guide);
  });

  test("the end handle snaps the end to the effect's start", async () => {
    await render(<LayerLane />);
    const held = await snapDrag(await snapHandle("l", "end"), 0.46);   // end 5.46 → 5.5
    expect(l().start).toBe(3);
    expect(l().trimEnd).toBeCloseTo(2.5, 9);
    expect(held).toEqual({ guide: 5.5, buzzes: 1 });
  });

  test("the start handle snaps the start to the playhead; the end stays", async () => {
    await render(<LayerLane />);
    const held = await snapDrag(await snapHandle("l", "start"), 0.27);   // start 3.27 → 3.3
    expect(l().trimStart).toBeCloseTo(0.3, 9);
    expect(l().start).toBeCloseTo(3.3, 9);
    expect(layerEnd(l())).toBeCloseTo(5, 9);
    expect(held).toEqual({ guide: 3.3, buzzes: 1 });
    expect(show).not.toHaveBeenCalled();
  });

  test("a snap the two-layers rule refuses is not taken, and the refusal is announced as before", async () => {
    // x and y fill 0–4, so z (6–10) may not start before 4. A beat at 3.95 lies inside the refused stretch.
    useEditorStore.getState().setProject(makeProject({ clips: [main], beatMarkers: [3.95], layers: [
      makeLayer({ id: "x", sourceDuration: 4, start: 0 }), makeLayer({ id: "y", sourceDuration: 4, start: 0 }),
      makeLayer({ id: "z", sourceDuration: 10, trimStart: 4, trimEnd: 8, start: 6 }) ] }));
    useEditorStore.getState().setZoom(80);
    await render(<LayerLane />);
    // 4.02 → snaps onto the others' end at 4 (allowed: touching). Then 3.96 → the beat at 3.95: refused, as is 3.96 itself.
    const held = await snapDrag(bar("z"), -1.98, -2.04);
    expect(layer("z").start).toBe(4);
    expect(held).toEqual({ guide: null, buzzes: 1 });
    expect(show).toHaveBeenCalledTimes(1);
    expect(show).toHaveBeenCalledWith(TOAST);
  });


  test("touching a handle also begins the body's pan, which fails: its finalize does not stop the handle snapping", async () => {
    await render(<LayerLane />);
    const g = await snapHandle("l", "end");
    await act(() => { g.handlers.onStart(); bar("l").handlers.onFinalize(); g.handlers.onUpdate({ translationX: 0.46 * 80 }); });   // end 5.46 → 5.5
    expect(l().trimEnd).toBeCloseTo(2.5, 9);
    expect(guide()).toBe(5.5);
    expect(buzz).toHaveBeenCalledTimes(1);
    await act(() => { g.handlers.onEnd?.(); g.handlers.onFinalize(); });
    expect(guide()).toBeNull();
  });

  test("a bar removed in the middle of a drag takes its guide with it", async () => {
    const view = await render(<LayerLane />);
    const g = await snapHandle("l", "end");
    await act(() => { g.handlers.onStart(); g.handlers.onUpdate({ translationX: 0.46 * 80 }); });
    expect(guide()).toBe(5.5);
    await view.unmount();
    expect(guide()).toBeNull();
  });
});
