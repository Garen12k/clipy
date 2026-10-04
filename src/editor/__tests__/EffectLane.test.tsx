import { act, fireEvent, render, screen } from "@testing-library/react-native";
import * as Haptics from "expo-haptics";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { makeAudioTrack, makeClip, makeEffect, makeLayer, makeOverlay, makeProject, makeSticker } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { EffectLane } from "../components/EffectLane";
import { useSnapGuide } from "../snapping";

const p = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })],
  effects: [makeEffect({ id: "e1", type: "glitch", start: 2, end: 5 }), makeEffect({ id: "e2", type: "oldFilm", start: 6, end: 7 })] });
beforeEach(() => { useEditorStore.getState().reset(); useEditorStore.getState().setProject(p); useEditorStore.getState().setZoom(50); });

const effect = (id: string) => useEditorStore.getState().project!.effects.find((e) => e.id === id)!;
type G = { handlers: { onStart: () => void; onUpdate: (e: { translationX: number }) => void } };
const gestureOf = (node: { props: { gesture?: unknown } }) => node.props.gesture as G;

test("one pill per effect, placed by time, labelled and coloured from the theme", async () => {
  await render(<EffectLane />);
  expect(screen.getByTestId("effect-lane")).toBeTruthy();
  expect(screen.getByTestId("effect-pill-e1")).toHaveStyle({ left: 100, width: 150, backgroundColor: theme.colors.laneEffect });
  expect(screen.getByTestId("effect-pill-e2")).toHaveStyle({ left: 300, width: 50 });
  expect(screen.getByText("Glitch")).toBeTruthy();
  expect(screen.getByText("Old film")).toBeTruthy();
});

test("tapping a pill selects the effect and clears the clip selection", async () => {
  useEditorStore.getState().select("a");
  await render(<EffectLane />);
  await fireEvent.press(screen.getByTestId("effect-pill-e1"));
  expect(useEditorStore.getState().selectedEffectId).toBe("e1");
  expect(useEditorStore.getState().selectedClipId).toBeNull();
  expect(screen.getByTestId("effect-pill-e1")).toHaveStyle({ borderColor: theme.colors.text });
  expect(screen.getByTestId("effect-pill-e2")).toHaveStyle({ borderColor: "transparent" });
});

test("a long-press drag moves the effect, keeping its length, as one undo step", async () => {
  await render(<EffectLane />);
  const g = gestureOf(screen.getByTestId("effect-pill-e1"));
  await act(() => { g.handlers.onStart(); g.handlers.onUpdate({ translationX: 25 }); g.handlers.onUpdate({ translationX: 50 }); });
  expect(effect("e1")).toMatchObject({ start: 3, end: 6 });
  expect(useEditorStore.getState().past).toHaveLength(1);
  // A second drag starts from where the first one ended (the drag start lives in a ref, re-read on start).
  await act(() => { g.handlers.onStart(); g.handlers.onUpdate({ translationX: -100 }); });
  expect(effect("e1")).toMatchObject({ start: 1, end: 4 });
  expect(useEditorStore.getState().past).toHaveLength(2);
  await act(() => { useEditorStore.getState().undo(); });
  expect(effect("e1")).toMatchObject({ start: 3, end: 6 });
});

test("handles show only on the selected pill and trim one edge each, one undo step per drag", async () => {
  await render(<EffectLane />);
  expect(screen.queryByLabelText("Effect start handle")).toBeNull();
  await act(() => { useEditorStore.getState().selectEffect("e1"); });
  const left = gestureOf(screen.getByLabelText("Effect start handle"));
  await act(() => { left.handlers.onStart(); left.handlers.onUpdate({ translationX: 50 }); });
  expect(effect("e1")).toMatchObject({ start: 3, end: 5 });
  const right = gestureOf(screen.getByLabelText("Effect end handle"));
  await act(() => { right.handlers.onStart(); right.handlers.onUpdate({ translationX: 100 }); right.handlers.onUpdate({ translationX: 150 }); });
  expect(effect("e1")).toMatchObject({ start: 3, end: 8 });
  expect(useEditorStore.getState().past).toHaveLength(2);
  expect(effect("e2")).toMatchObject({ start: 6, end: 7 });
});

test("tapping the already-selected pill deselects it", async () => {
  await render(<EffectLane />);
  await fireEvent.press(screen.getByTestId("effect-pill-e1"));
  expect(useEditorStore.getState().selectedEffectId).toBe("e1");
  await fireEvent.press(screen.getByTestId("effect-pill-e1"));
  expect(useEditorStore.getState().selectedEffectId).toBeNull();
  await fireEvent.press(screen.getByTestId("effect-pill-e2"));
  await fireEvent.press(screen.getByTestId("effect-pill-e1"));
  expect(useEditorStore.getState().selectedEffectId).toBe("e1");
});

test("a very short effect still gets a 28 pt pill, so both handles fit", async () => {
  useEditorStore.getState().setProject({ ...p, effects: [makeEffect({ id: "s", start: 2, end: 2.2 })] });
  useEditorStore.getState().setZoom(50);   // 0.2 s = 10 px
  await render(<EffectLane />);
  expect(screen.getByTestId("effect-pill-s")).toHaveStyle({ left: 100, width: 28, borderRadius: theme.radius.chip });
});

test("a pill running past the project's end is drawn only up to the end", async () => {
  useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 3 })],
    effects: [makeEffect({ id: "long", start: 1, end: 50 }), makeEffect({ id: "gone", start: 2.9, end: 6 })] }));
  useEditorStore.getState().setZoom(50);
  await render(<EffectLane />);
  expect(screen.getByTestId("effect-pill-long")).toHaveStyle({ left: 50, width: 100 });   // 1–3 s, not 1–50 s
  expect(screen.getByTestId("effect-pill-gone")).toHaveStyle({ width: 28 });   // the minimum width stays
});

describe("snapping", () => {
  // The project of model/__tests__/snap.test.ts. Main track a 0–4, b 4–7. Text o 1–2.5. Sticker s 6–6.5. Music m 0.5–9.5. Layer l 3–5.
  // Effect e 5.5–6.5. Beats 2 and 6. Playhead 3.3. Zoom 80 → an edge within 0.1 s of a target snaps.
  const snapProject = makeProject({
    clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 6, speed: 2 })],
    overlays: [makeOverlay({ id: "o", start: 1, end: 2.5 }), makeSticker({ id: "s", start: 6, end: 6.5 })],
    audioTracks: [makeAudioTrack({ id: "m", sourceDuration: 9, start: 0.5 })],
    layers: [makeLayer({ id: "l", sourceDuration: 2, start: 3 })],
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
  const e = () => useEditorStore.getState().project!.effects.find((v) => v.id === "e")!;
  const handle = async (label: string) => { await act(() => { useEditorStore.getState().selectEffect("e"); }); return screen.getByLabelText(label).props.gesture as SnapG; };

  test("a move snaps the start onto the playhead", async () => {
    await render(<EffectLane />);
    // start 3.34 → 0.04 from the playhead at 3.3; the end 4.34 is near nothing
    const held = await snapDrag(screen.getByTestId("effect-pill-e").props.gesture as SnapG, -2.16);
    expect(e().start).toBeCloseTo(3.3, 9);
    expect(e().end).toBeCloseTo(4.3, 9);
    expect(held).toEqual({ guide: 3.3, buzzes: 1 });
  });

  test("the start handle snaps to the beat at 6 (the sticker starts there too)", async () => {
    await render(<EffectLane />);
    const held = await snapDrag(await handle("Effect start handle"), 0.46);   // start 5.96
    expect(e()).toMatchObject({ start: 6, end: 6.5 });
    expect(held).toEqual({ guide: 6, buzzes: 1 });
  });

  test("the end handle snaps to the project's end", async () => {
    await render(<EffectLane />);
    const held = await snapDrag(await handle("Effect end handle"), 0.47);   // end 6.97
    expect(e()).toMatchObject({ start: 5.5, end: 7 });
    expect(held).toEqual({ guide: 7, buzzes: 1 });
  });

  test("an edge that is on a target when the gesture starts is held without a haptic", async () => {
    await render(<EffectLane />);
    // The effect ends at 6.5, exactly where the sticker ends.
    const held = await snapDrag(await handle("Effect end handle"), 0.02, 0.04);
    expect(e()).toMatchObject({ start: 5.5, end: 6.5 });
    expect(held).toEqual({ guide: 6.5, buzzes: 0 });
  });

  test("touching a handle also begins the body's pan, which fails: its finalize does not stop the handle snapping", async () => {
    await render(<EffectLane />);
    const g = await handle("Effect end handle");
    await act(() => { g.handlers.onStart(); (screen.getByTestId("effect-pill-e").props.gesture as SnapG).handlers.onFinalize(); g.handlers.onUpdate({ translationX: 0.47 * 80 }); });   // end 6.97 → 7
    expect(e()).toMatchObject({ start: 5.5, end: 7 });
    expect(guide()).toBe(7);
    expect(buzz).toHaveBeenCalledTimes(1);
    await act(() => { g.handlers.onFinalize(); });
    expect(guide()).toBeNull();
  });

  test("a pill removed in the middle of a drag takes its guide with it", async () => {
    const view = await render(<EffectLane />);
    const g = await handle("Effect end handle");
    await act(() => { g.handlers.onStart(); g.handlers.onUpdate({ translationX: 0.47 * 80 }); });
    expect(guide()).toBe(7);
    await view.unmount();
    expect(guide()).toBeNull();
  });
});
