import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@react-native-community/slider", () => { const { View } = require("react-native"); return ({ testID, onSlidingStart, onValueChange, onSlidingComplete }: { testID?: string; onSlidingStart?: () => void; onValueChange?: (v: number) => void; onSlidingComplete?: (v: number) => void }) => <View testID={testID} onTouchStart={() => onSlidingStart?.()} onTouchMove={(v: number) => onValueChange?.(v)} onTouchEnd={(v: number) => onSlidingComplete?.(v)} />; });
import { DEFAULT_SHADOW, DEFAULT_TEXT_STYLE, isTextOverlay, makeClip, makeOverlay, makeProject, type TextOverlay } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { TextPanel } from "../components/TextPanel";

// A text as schema v14 left it after the migration: outline on (the default), a black box, the default style.
const p = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })], overlays: [makeOverlay({ id: "o1", text: "Hi", start: 1, end: 4, background: { color: "#000000", opacity: 0.6 } })] });
beforeEach(() => { useEditorStore.getState().reset(); useEditorStore.getState().setProject(p); });
const ov = (): TextOverlay => { const o = useEditorStore.getState().project!.overlays[0]; if (!isTextOverlay(o)) throw new Error("expected a text"); return o; };
const past = () => useEditorStore.getState().past.length;
const show = () => render(<TextPanel overlayId="o1" visible onClose={() => {}} />);
const tap = (name: string) => fireEvent.press(screen.getByRole("button", { name }));
async function drag(testID: string, values: number[]) {
  const slider = screen.getByTestId(testID);
  await fireEvent(slider, "touchStart");
  for (const v of values) await fireEvent(slider, "touchMove", v);
  await fireEvent(slider, "touchEnd", values[values.length - 1]);
}
const BODIES = ["style-outline", "style-shadow", "style-box", "style-spacing", "style-glow"];

test("five rows, all closed when the panel opens: four switches, no controls, no Style button", async () => {
  await show();
  for (const name of ["Outline", "Shadow", "Background", "Glow"]) expect(screen.getByLabelText(name)).toBeTruthy();
  expect(screen.getByLabelText("Outline").props.value).toBe(true);
  expect(screen.getByLabelText("Shadow").props.value).toBe(false);
  for (const id of BODIES) expect(screen.queryByTestId(id)).toBeNull();
  expect(screen.queryByRole("button", { name: "Style" })).toBeNull();
  for (const name of ["Outline options", "Background options", "Spacing and opacity"]) {
    expect(screen.getByRole("button", { name })).toHaveStyle({ height: theme.size.touch });
    expect(screen.getByRole("button", { name }).props.accessibilityState).toMatchObject({ expanded: false });
  }
  expect(screen.getByRole("button", { name: "Shadow options" })).toBeDisabled();       // off: nothing to open
  expect(screen.getByRole("button", { name: "Glow options" })).toBeDisabled();
  expect(screen.getAllByLabelText("Color #F5C542")).toHaveLength(1);                      // only the text colour row is drawn
});

test("a row opens from its name and closes again; the others stay as they are", async () => {
  await show();
  await tap("Outline options");
  expect(screen.getByTestId("style-outline-width-slider")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Outline options" }).props.accessibilityState).toMatchObject({ expanded: true });
  await tap("Spacing and opacity");
  for (const id of ["style-opacity-slider", "style-letter-spacing-slider", "style-line-spacing-slider"]) expect(screen.getByTestId(id)).toBeTruthy();
  expect(screen.getByTestId("style-outline")).toBeTruthy();
  await tap("Outline options");
  expect(screen.queryByTestId("style-outline")).toBeNull();
  expect(screen.getByTestId("style-spacing")).toBeTruthy();
  expect(past()).toBe(0);                                                                // opening and closing is not an edit
});

test("switching a row on opens it (one undo step); off closes it", async () => {
  await show();
  await fireEvent(screen.getByLabelText("Shadow"), "valueChange", true);
  expect(ov().style.shadow).toEqual(DEFAULT_SHADOW);
  expect(past()).toBe(1);
  expect(screen.getByTestId("style-shadow-blur-slider")).toBeTruthy();
  await fireEvent(screen.getByLabelText("Shadow"), "valueChange", false);
  expect(screen.queryByTestId("style-shadow")).toBeNull();
  expect(past()).toBe(2);
  await fireEvent(screen.getByLabelText("Outline"), "valueChange", false);
  expect(ov().outline).toBe(false);
  expect(screen.getByRole("button", { name: "Outline options" })).toBeDisabled();
});

test("Background: an old text shows Rounded; Square is ONE undo step and undo brings Rounded back", async () => {
  await show();
  await tap("Background options");
  expect(screen.getByRole("button", { name: "Rounded" })).toBeSelected();
  expect(screen.getByRole("button", { name: "Square" })).not.toBeSelected();
  expect(screen.getByText("Padding 25")).toBeTruthy();
  expect(screen.getByText("Box opacity 60 %")).toBeTruthy();
  await tap("Square");
  expect(ov().style).toEqual({ ...DEFAULT_TEXT_STYLE, boxCorner: "square" });
  expect(past()).toBe(1);
  expect(screen.getByRole("button", { name: "Square" })).toBeSelected();
  await act(() => { useEditorStore.getState().undo(); });
  expect(ov().style).toEqual(DEFAULT_TEXT_STYLE);
  await tap("Rounded");                                                                   // already rounded: nothing changes, no undo step
  expect(past()).toBe(0);
});

test("a Padding drag is ONE undo step, stored with two decimals and clamped to 0–60", async () => {
  await show();
  await tap("Background options");
  await drag("style-box-padding-slider", [0.3, 0.4, 0.456]);
  expect(ov().style.boxPadding).toBe(0.46);
  expect(past()).toBe(1);
  expect(screen.getByText("Padding 46")).toBeTruthy();
  await drag("style-box-padding-slider", [0.5, 9]);
  expect(ov().style.boxPadding).toBe(0.6);
  expect(past()).toBe(2);
  await act(() => { useEditorStore.getState().undo(); useEditorStore.getState().undo(); });
  expect(ov().style.boxPadding).toBe(0.25);
});

test("the box opacity slider keeps its test id and is one undo step; a box colour keeps the opacity", async () => {
  await show();
  await tap("Background options");
  await drag("opacity-slider", [0.3, 0.5, 0.9]);
  expect(ov().background).toEqual({ color: "#000000", opacity: 0.9 });
  expect(past()).toBe(1);
  expect(screen.getByText("Box opacity 90 %")).toBeTruthy();
  await fireEvent.press(within(screen.getByTestId("style-box-color")).getByLabelText("Color #F5C542"));
  expect(ov().background).toEqual({ color: "#F5C542", opacity: 0.9 });
  expect(past()).toBe(2);
  expect(ov().color).toBe("#F4F4F5");                                                    // the text's own colour was not touched
});

test("Background off removes the box and closes the row; the style keeps its padding and corner for the next time", async () => {
  await show();
  await tap("Background options");
  await tap("Square");
  await fireEvent(screen.getByLabelText("Background"), "valueChange", false);
  expect(ov().background).toBeNull();
  expect(ov().style.boxCorner).toBe("square");
  expect(screen.queryByTestId("style-box")).toBeNull();
  await fireEvent(screen.getByLabelText("Background"), "valueChange", true);
  expect(ov().background).toEqual({ color: "#000000", opacity: 0.6 });
  expect(screen.getByRole("button", { name: "Square" })).toBeSelected();
});

test("a caption gets the same rows (no looks row); the panel is still one vertical scroll without scroll handlers", async () => {
  useEditorStore.getState().setProject({ ...p, overlays: [makeOverlay({ id: "o1", kind: "caption", text: "Cap", start: 1, end: 4, background: { color: "#000000", opacity: 0.6 } })] });
  await show();
  expect(screen.queryByTestId("template-strip")).toBeNull();
  await tap("Background options");
  await tap("Square");
  expect(ov().style.boxCorner).toBe("square");
  const scroll = screen.getByTestId("text-panel-scroll");
  expect(scroll.props.horizontal).toBeFalsy();
  expect(Object.keys(scroll.props).filter((k) => /^on.*Scroll/.test(k))).toEqual([]);
});

test("the order: text field, looks, fonts, the five style rows, then Size, colour and Align", async () => {
  await show();
  const tree = JSON.stringify(screen.toJSON());
  const at = (needle: string) => { const i = tree.indexOf(needle); expect(i).toBeGreaterThan(-1); return i; };
  const order = ["Overlay text", '"template-strip"', '"font-strip"', '"style-sections"', '"size-slider"', "Align Left"].map(at);
  expect([...order].sort((a, b) => a - b)).toEqual(order);
});
