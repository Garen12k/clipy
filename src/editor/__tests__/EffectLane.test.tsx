import { act, fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { makeClip, makeEffect, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { EffectLane } from "../components/EffectLane";

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
