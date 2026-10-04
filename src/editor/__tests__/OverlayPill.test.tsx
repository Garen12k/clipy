import { act, render, screen } from "@testing-library/react-native";
import * as Haptics from "expo-haptics";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { sampleKeyframes } from "@/src/editor/model/motion";
import { updateOverlayShared } from "@/src/editor/model/ops";
import { makeAudioTrack, makeClip, makeEffect, makeKeyframe, makeLayer, makeOverlay, makeProject, makeSticker } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { OverlayPill } from "../components/OverlayPill";
import { useSnapGuide } from "../snapping";

type Mock = { handlers: Record<string, (...a: unknown[]) => void> };
const store = () => useEditorStore.getState();
const ov = () => store().project!.overlays[0];
const pins = [makeKeyframe({ t: 0, x: 0.1 }), makeKeyframe({ t: 1, x: 0.9 }), makeKeyframe({ t: 4, x: 0.5 })];
const overlay = makeOverlay({ id: "o1", text: "Hi", start: 0, end: 6, keyframes: pins });
const project = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })], overlays: [overlay] });

beforeEach(() => { store().reset(); store().setProject(project); });

test("dragging the start handle past a pin, frame by frame, keeps the value that was showing at the new start", async () => {
  await render(<OverlayPill overlay={overlay} selected onPress={() => {}} />);
  const left = screen.getByLabelText("Text start handle").props.gesture as Mock;
  const pps = store().pixelsPerSecond;
  await act(() => {
    left.handlers.onStart({ translationX: 0 });
    for (let s = 0.017; s < 1.5; s += 0.017) left.handlers.onUpdate({ translationX: s * pps });
    left.handlers.onUpdate({ translationX: 1.5 * pps });
  });
  expect(ov().start).toBe(1.5);
  expect(ov().keyframes).toEqual(updateOverlayShared(project, "o1", { start: 1.5 }).overlays[0].keyframes);
  expect(ov().keyframes[0]).toEqual({ t: 0, ...sampleKeyframes(pins, 1.5)! });
  expect(ov().keyframes[1]).toEqual(makeKeyframe({ t: 2.5, x: 0.5 }));
  expect(store().past).toHaveLength(1);
  // Back to where the drag began, still in the same gesture: the pins are as they were.
  await act(() => { left.handlers.onUpdate({ translationX: 0 }); });
  expect(ov().keyframes).toEqual(pins);
});

test("the end handle and a move leave the pins alone", async () => {
  await render(<OverlayPill overlay={overlay} selected onPress={() => {}} />);
  const right = screen.getByLabelText("Text end handle").props.gesture as Mock;
  await act(() => { right.handlers.onStart({ translationX: 0 }); right.handlers.onUpdate({ translationX: -store().pixelsPerSecond }); });
  expect(ov().end).toBe(5);
  expect(ov().keyframes).toBe(pins);
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
  const o = () => useEditorStore.getState().project!.overlays.find((v) => v.id === "o")!;
  const pill = async () => { await render(<OverlayPill overlay={snapProject.overlays[0]} selected onPress={() => {}} />); };
  const body = () => screen.getByTestId("overlay-pill-o").props.gesture as SnapG;
  const handle = (label: string) => screen.getByLabelText(label).props.gesture as SnapG;

  test("a move snaps the nearer edge: the end clicks onto the cut, with one light haptic and the guide there", async () => {
    await pill();
    // start 2.46 (nothing near), end 3.96 → 0.04 from the cut at 4
    const held = await snapDrag(body(), 1.46);
    expect(o()).toMatchObject({ start: 2.5, end: 4 });
    expect(held).toEqual({ guide: 4, buzzes: 1 });
    expect(buzz).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
  });

  test("holding a snap over many frames buzzes once; leaving it is silent", async () => {
    await pill();
    const held = await snapDrag(body(), 1.44, 1.46, 1.47, 1.5, 1.53, 1.8);
    expect(o().start).toBeCloseTo(2.8, 9);
    expect(held).toEqual({ guide: null, buzzes: 1 });
  });

  test("the start handle snaps the start to the beat", async () => {
    await pill();
    const held = await snapDrag(handle("Text start handle"), 0.95);   // start 1.95 → 2
    expect(o()).toMatchObject({ start: 2, end: 2.5 });
    expect(held).toEqual({ guide: 2, buzzes: 1 });
  });

  test("the end handle snaps the end to the playhead", async () => {
    await pill();
    const held = await snapDrag(handle("Text end handle"), 0.76);   // end 3.26 → 3.3
    expect(o()).toMatchObject({ start: 1, end: 3.3 });
    expect(held).toEqual({ guide: 3.3, buzzes: 1 });
  });

  test("the pill's own edges are not targets", async () => {
    await pill();
    // start 1.03, end 2.53: without its own 1 and 2.5 the nearest targets are 0.5, 2 and 3
    const held = await snapDrag(body(), 0.03);
    expect(o()).toMatchObject({ start: 1.03, end: 2.53 });
    expect(held).toEqual({ guide: null, buzzes: 0 });
  });

  test("a snap the op would clamp away is not taken: no haptic, no guide, the bar where the op puts it", async () => {
    await pill();
    // start 7.95, end 9.45 → 0.05 from the music's end at 9.5, but an overlay cannot pass the project's end (7)
    const held = await snapDrag(body(), 6.95);
    expect(o()).toMatchObject({ start: 5.5, end: 7 });
    expect(held).toEqual({ guide: null, buzzes: 0 });
  });

  test("an interrupted gesture (finalize without an end) clears the guide", async () => {
    await pill();
    const g = handle("Text end handle");
    await act(() => { g.handlers.onStart(); g.handlers.onUpdate({ translationX: 0.76 * 80 }); });
    expect(guide()).toBe(3.3);
    await act(() => { g.handlers.onFinalize(); });
    expect(guide()).toBeNull();
  });
});
