import { fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@react-native-community/slider", () => { const { View } = require("react-native"); return ({ testID, value, disabled }: { testID?: string; value?: number; disabled?: boolean }) => <View testID={testID} accessibilityValue={{ now: value }} accessibilityState={{ disabled: !!disabled }} />; });
import * as Haptics from "expo-haptics";
import { makeClip, makeLayer, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { BlendSheet } from "../components/BlendSheet";
import { ChromaSheet } from "../components/ChromaSheet";

const state = () => useEditorStore.getState();
const layer = () => state().project!.layers[0];
beforeEach(() => {
  state().reset(); (Haptics.impactAsync as jest.Mock).mockClear();
  state().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 })], layers: [makeLayer({ id: "L", sourceDuration: 2, start: 1 })] }));
});

describe("BlendSheet", () => {
  test("six tiles, Normal selected, the note shown", async () => {
    await render(<BlendSheet clipId="L" visible onClose={() => {}} />);
    expect(screen.getByRole("header", { name: "Blend" })).toBeTruthy();
    for (const l of ["Normal", "Screen", "Multiply", "Overlay", "Lighten", "Darken"]) expect(screen.getByRole("button", { name: l })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Normal" })).toBeSelected();
    expect(screen.getByText("Shows in the exported video")).toBeTruthy();
  });

  test("a pick sets the blend as one undo step with a light haptic and moves the ring; a re-pick does nothing", async () => {
    await render(<BlendSheet clipId="L" visible onClose={() => {}} />);
    await fireEvent.press(screen.getByRole("button", { name: "Screen" }));
    expect(layer().blend).toBe("screen");
    expect(state().past).toHaveLength(1);
    expect(Haptics.impactAsync).toHaveBeenCalledWith("light");
    expect(screen.getByRole("button", { name: "Screen" })).toBeSelected();
    expect(screen.getByRole("button", { name: "Normal" })).not.toBeSelected();
    await fireEvent.press(screen.getByRole("button", { name: "Screen" }));
    expect(state().past).toHaveLength(1);
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
  });

  test("a main clip refuses the blend", async () => {
    await render(<BlendSheet clipId="a" visible onClose={() => {}} />);
    await fireEvent.press(screen.getByRole("button", { name: "Multiply" }));
    expect(state().project!.clips[0].blend).toBe("normal");
    expect(state().past).toHaveLength(0);
    expect(Haptics.impactAsync).not.toHaveBeenCalled();   // a refused pick does not buzz
  });

  test("renders nothing without an item", async () => {
    await render(<BlendSheet clipId="gone" visible onClose={() => {}} />);
    expect(screen.queryByRole("button", { name: "Normal" })).toBeNull();
  });
});

describe("ChromaSheet", () => {
  const sw = () => screen.getByLabelText("Green screen");

  test("off by default: switch off, slider disabled, note shown", async () => {
    await render(<ChromaSheet clipId="L" visible onClose={() => {}} />);
    expect(screen.getByRole("header", { name: "Green screen" })).toBeTruthy();
    expect(sw().props.value).toBe(false);
    expect(screen.getByTestId("chroma-strength").props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText("Shows in the exported video")).toBeTruthy();
  });

  test("the switch turns the key on with the first preset at the default strength, and off again, one undo step each", async () => {
    await render(<ChromaSheet clipId="L" visible onClose={() => {}} />);
    await fireEvent(sw(), "valueChange", true);
    expect(layer().chroma).toEqual({ color: "#00FF00", strength: 0.5 });
    expect(state().past).toHaveLength(1);
    expect(screen.getByText("Strength 50 %")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Green" })).toBeSelected();
    expect(screen.getByTestId("chroma-strength").props.accessibilityState.disabled).toBe(false);
    await fireEvent(sw(), "valueChange", false);
    expect(layer().chroma).toBeNull();
    expect(state().past).toHaveLength(2);
  });

  test("colours while off do nothing; chips and palette keep the strength when on", async () => {
    await render(<ChromaSheet clipId="L" visible onClose={() => {}} />);
    await fireEvent.press(screen.getByRole("button", { name: "Blue" }));
    expect(layer().chroma).toBeNull();
    expect(state().past).toHaveLength(0);
    await fireEvent(sw(), "valueChange", true);
    await fireEvent(screen.getByTestId("chroma-strength"), "slidingStart");
    await fireEvent(screen.getByTestId("chroma-strength"), "valueChange", 0.8);
    await fireEvent.press(screen.getByRole("button", { name: "Blue" }));
    expect(layer().chroma).toEqual({ color: "#0000FF", strength: 0.8 });
    expect(screen.getByRole("button", { name: "Blue" })).toBeSelected();
    expect(screen.getByRole("button", { name: "Green" })).not.toBeSelected();
    await fireEvent.press(screen.getByLabelText("Color #C8102E"));
    expect(layer().chroma).toEqual({ color: "#C8102E", strength: 0.8 });
    expect(screen.getByRole("button", { name: "Blue" })).not.toBeSelected();
  });

  test("a stored lower-case colour still shows its chip selected", async () => {
    state().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 })], layers: [makeLayer({ id: "L", sourceDuration: 2, start: 1, chroma: { color: "#00ff00", strength: 0.5 } })] }));
    await render(<ChromaSheet clipId="L" visible onClose={() => {}} />);
    expect(screen.getByRole("button", { name: "Green" })).toBeSelected();
    expect(screen.getByRole("button", { name: "Blue" })).not.toBeSelected();
  });

  test("off then on returns to the first preset at the default strength, even after a custom colour and strength", async () => {
    await render(<ChromaSheet clipId="L" visible onClose={() => {}} />);
    await fireEvent(sw(), "valueChange", true);
    await fireEvent.press(screen.getByRole("button", { name: "Blue" }));
    await fireEvent(screen.getByTestId("chroma-strength"), "slidingStart");
    await fireEvent(screen.getByTestId("chroma-strength"), "valueChange", 0.9);
    expect(layer().chroma).toEqual({ color: "#0000FF", strength: 0.9 });
    await fireEvent(sw(), "valueChange", false);
    expect(layer().chroma).toBeNull();
    await fireEvent(sw(), "valueChange", true);
    expect(layer().chroma).toEqual({ color: "#00FF00", strength: 0.5 });
    expect(screen.getByText("Strength 50 %")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Green" })).toBeSelected();
  });

  test("a slider drag is one undo step", async () => {
    await render(<ChromaSheet clipId="L" visible onClose={() => {}} />);
    await fireEvent(sw(), "valueChange", true);
    const slider = screen.getByTestId("chroma-strength");
    await fireEvent(slider, "slidingStart");
    await fireEvent(slider, "valueChange", 0.3);
    await fireEvent(slider, "valueChange", 0.2);
    expect(layer().chroma).toEqual({ color: "#00FF00", strength: 0.2 });
    expect(state().past).toHaveLength(2);   // the switch, then the drag
    expect(screen.getByText("Strength 20 %")).toBeTruthy();
  });

  test("works on a main clip; renders nothing without an item", async () => {
    const view = await render(<ChromaSheet clipId="a" visible onClose={() => {}} />);
    await fireEvent(sw(), "valueChange", true);
    expect(state().project!.clips[0].chroma).toEqual({ color: "#00FF00", strength: 0.5 });
    await view.rerender(<ChromaSheet clipId="gone" visible onClose={() => {}} />);
    expect(screen.queryByLabelText("Green screen")).toBeNull();
  });

  test("a colour too grey to remove shows a hint; a keyable colour does not", async () => {
    state().apply((p) => ({ ...p, layers: [{ ...p.layers[0], chroma: { color: "#FFFFFF", strength: 0.5 } }] }));
    const view = await render(<ChromaSheet clipId="L" visible onClose={() => {}} />);
    expect(screen.getByText("This colour is too grey to remove. Pick a stronger colour.")).toBeTruthy();
    state().apply((p) => ({ ...p, layers: [{ ...p.layers[0], chroma: { color: "#00FF00", strength: 0.5 } }] }));
    await view.rerender(<ChromaSheet clipId="L" visible onClose={() => {}} />);
    expect(screen.queryByText("This colour is too grey to remove. Pick a stronger colour.")).toBeNull();
  });
});

type ScrollInst = ReturnType<typeof screen.getByTestId>;
const findRowScroll = (n: ScrollInst): ScrollInst | null => { if (n.props.contentOffset !== undefined) return n; for (const c of n.children) { if (typeof c === "string") continue; const f = findRowScroll(c as ScrollInst); if (f) return f; } return null; };
/** Where the tile row starts (the kit hands it to its ScrollView as contentOffset). */
const rowStartX = () => findRowScroll(screen.getByTestId("strip-tiles"))!.props.contentOffset.x as number;

test("Blend: the tile row keeps its offset across picks; it is worked out again at the next opening", async () => {
  state().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 })], layers: [{ ...makeLayer({ id: "L", sourceDuration: 2, start: 1 }), blend: "darken" }] }));
  const view = await render(<BlendSheet clipId="L" visible onClose={() => {}} />);
  expect(rowStartX()).toBe(5 * 80 - 72);                      // Darken is tile 5: five pitches (72 + 8) minus one tile
  await fireEvent.press(screen.getByRole("button", { name: "Screen" }));
  expect(layer().blend).toBe("screen");
  expect(rowStartX()).toBe(5 * 80 - 72);                      // the row did not move under the finger
  await view.rerender(<BlendSheet clipId="L" visible={false} onClose={() => {}} />);
  await view.rerender(<BlendSheet clipId="L" visible onClose={() => {}} />);
  expect(rowStartX()).toBe(8);                                // opened again: Screen is tile 1
});
