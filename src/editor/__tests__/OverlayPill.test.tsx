import { act, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { sampleKeyframes } from "@/src/editor/model/motion";
import { updateOverlayShared } from "@/src/editor/model/ops";
import { makeClip, makeKeyframe, makeOverlay, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { OverlayPill } from "../components/OverlayPill";

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
