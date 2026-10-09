import { fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@react-native-community/slider", () => { const { View } = require("react-native"); return ({ testID, onSlidingStart, onValueChange }: { testID?: string; onSlidingStart?: () => void; onValueChange?: (v: number) => void }) => <View testID={testID} onTouchStart={() => onSlidingStart?.()} onTouchMove={() => onValueChange?.(0.8)} />; });
import { Dimensions } from "react-native";
import { TRANSITIONS } from "@/src/editor/effects";
import { TRANSITION_TYPES, makeClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { toolWidth } from "@/src/ui/ToolStrip";
import { TransitionSheet } from "../components/TransitionSheet";

beforeEach(() => { useEditorStore.getState().reset(); useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 4 })] })); });

test("chips set the type with a default duration; the slider adjusts within the cap", async () => {
  await render(<TransitionSheet clipIndex={0} visible onClose={() => {}} />);
  await fireEvent.press(screen.getByRole("button", { name: "Dissolve" }));
  expect(useEditorStore.getState().project!.clips[0].transitionOut).toEqual({ type: "dissolve", duration: 0.5 });
  const slider = screen.getByTestId("transition-slider");
  await fireEvent(slider, "touchStart"); await fireEvent(slider, "touchMove");
  expect(useEditorStore.getState().project!.clips[0].transitionOut.duration).toBe(0.8);
  await fireEvent.press(screen.getByRole("button", { name: "None" }));
  expect(useEditorStore.getState().project!.clips[0].transitionOut).toEqual({ type: "none", duration: 0 });
});

test("last clip shows the no-next-clip message", async () => {
  await render(<TransitionSheet clipIndex={1} visible onClose={() => {}} />);
  expect(screen.getByText("No clip after this one")).toBeTruthy();
});

test("shows twenty-one chips: the eleven old ones first, in their order, then the ten new ones", async () => {
  await render(<TransitionSheet clipIndex={0} visible onClose={() => {}} />);
  const labels = screen.getAllByRole("button").map((b) => b.props.accessibilityLabel).filter((l) => l !== "Done");
  expect(labels).toEqual(["None", "Fade", "Dissolve", "Slide left", "Zoom", "Slide right", "Slide up", "Slide down", "Wipe", "Spin", "Blur",
    "Cover left", "Reveal left", "Cover up", "Reveal down", "Circle open", "Circle close", "Diagonal wipe", "Clock wipe", "Pixelate", "White flash"]);
  expect(labels).toEqual(TRANSITION_TYPES.map((t) => TRANSITIONS[t].label));
});

test("a new transition is set with the default duration and the slider keeps working", async () => {
  await render(<TransitionSheet clipIndex={0} visible onClose={() => {}} />);
  await fireEvent.press(screen.getByRole("button", { name: "Clock wipe" }));
  expect(useEditorStore.getState().project!.clips[0].transitionOut).toEqual({ type: "wipeClock", duration: 0.5 });
  const slider = screen.getByTestId("transition-slider");
  await fireEvent(slider, "touchStart"); await fireEvent(slider, "touchMove");
  expect(useEditorStore.getState().project!.clips[0].transitionOut).toEqual({ type: "wipeClock", duration: 0.8 });
  expect(useEditorStore.getState().past).toHaveLength(2);
});

describe("the row opens with the selected chip in view (chips have different widths, so their places are measured)", () => {
  type Inst = ReturnType<typeof screen.getByTestId>;
  const findScroll = (n: Inst): Inst | null => { if (n.props.contentOffset !== undefined) return n; for (const c of n.children) { if (typeof c === "string") continue; const f = findScroll(c as Inst); if (f) return f; } return null; };
  const startX = () => findScroll(screen.getByTestId("strip-tiles"))!.props.contentOffset.x as number;
  /** Every chip reports a place: chip i at 16 + 100·i, 92 wide → the row ends at 16 + 100·20 + 92 + 16 = 2124. */
  const measure = async () => { for (const [i, type] of TRANSITION_TYPES.entries()) await fireEvent(screen.getByTestId(`transition-chip-${type}`), "layout", { nativeEvent: { layout: { x: 16 + 100 * i, y: 0, width: 92, height: 72 } } }); };
  const set = (type: (typeof TRANSITION_TYPES)[number]) => useEditorStore.getState().apply((p) => ({ ...p, clips: p.clips.map((c, i) => (i === 0 ? { ...c, transitionOut: { type, duration: 0.5 } } : c)) }));
  const rowEnd = () => 2124 - toolWidth(Dimensions.get("window").width);     // the row is as wide as the strip's card

  test("it starts at 0 and moves once, when the chips have been measured: the selected chip, one tile from the left", async () => {
    set("cover");                                                       // chip 11 → x = 1116
    await render(<TransitionSheet clipIndex={0} visible onClose={() => {}} />);
    expect(startX()).toBe(0);
    await measure();
    expect(startX()).toBe(Math.min(1116 - theme.size.toolColumn, rowEnd()));
    // A pick afterwards, and a chip reporting again, do not move the row.
    await fireEvent.press(screen.getByRole("button", { name: "Fade" }));
    await measure();
    expect(startX()).toBe(Math.min(1116 - theme.size.toolColumn, rowEnd()));
  });

  test("the last chips are clamped to the row's end; None and the first chips stay at the start", async () => {
    set("flashWhite");                                                  // chip 20 → 2016 − 72 = 1944, past the end
    const view = await render(<TransitionSheet clipIndex={0} visible onClose={() => {}} />);
    await measure();
    expect(startX()).toBe(Math.max(0, rowEnd()));
    await view.unmount();
    useEditorStore.getState().undo();                                   // back to None
    await render(<TransitionSheet clipIndex={0} visible onClose={() => {}} />);
    await measure();
    expect(startX()).toBe(0);
  });

  test("every opening measures afresh", async () => {
    set("cover");
    const view = await render(<TransitionSheet clipIndex={0} visible onClose={() => {}} />);
    await measure();
    await fireEvent.press(screen.getByRole("button", { name: "Zoom" }));   // chip 4 → 416 − 72 = 344
    await view.rerender(<TransitionSheet clipIndex={0} visible={false} onClose={() => {}} />);
    await view.rerender(<TransitionSheet clipIndex={0} visible onClose={() => {}} />);
    expect(startX()).toBe(0);
    await measure();
    expect(startX()).toBe(Math.min(344, rowEnd()));
  });

  test("a chip keeps its full-height touch area: its wrapper is as high as the row", async () => {
    await render(<TransitionSheet clipIndex={0} visible onClose={() => {}} />);
    expect(screen.getByTestId("transition-chip-fade")).toHaveStyle({ height: 72, justifyContent: "center" });
  });
});
