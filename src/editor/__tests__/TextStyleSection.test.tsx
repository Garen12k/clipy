import { fireEvent, render, screen, within } from "@testing-library/react-native";
jest.mock("@react-native-community/slider", () => { const { View } = require("react-native"); return ({ testID, step, onSlidingStart, onValueChange, onSlidingComplete }: { testID?: string; step?: number; onSlidingStart?: () => void; onValueChange?: (v: number) => void; onSlidingComplete?: (v: number) => void }) => <View testID={testID} step={step} onTouchStart={() => onSlidingStart?.()} onTouchMove={(v: number) => onValueChange?.(v)} onTouchEnd={(v: number) => onSlidingComplete?.(v)} />; });
import { DEFAULT_GLOW, DEFAULT_SHADOW, DEFAULT_TEXT_STYLE, type TextStyle } from "@/src/editor/model/types";
import { CollapsibleTextStyle, TextStyleSection } from "../components/TextStyleSection";

const onBegin = jest.fn(), onPatch = jest.fn(), onPatchTransient = jest.fn();
beforeEach(() => { onBegin.mockClear(); onPatch.mockClear(); onPatchTransient.mockClear(); });
const show = (style: Partial<TextStyle> = {}, outline = false) =>
  render(<TextStyleSection style={{ ...DEFAULT_TEXT_STYLE, ...style }} outline={outline} onBegin={onBegin} onPatch={onPatch} onPatchTransient={onPatchTransient} />);

async function drag(testID: string, values: number[]) {
  const slider = screen.getByTestId(testID);
  await fireEvent(slider, "touchStart");
  for (const v of values) await fireEvent(slider, "touchMove", v);
  await fireEvent(slider, "touchEnd", values[values.length - 1]);
}

test("labels show rounded values", async () => {
  await show({ opacity: 0.8, letterSpacing: 0.1, lineSpacing: 1.5, outlineWidth: 2, shadow: { ...DEFAULT_SHADOW }, glow: { ...DEFAULT_GLOW } }, true);
  for (const label of ["Opacity 80 %", "Letter spacing 10", "Line spacing 1.50×", "Thickness 2.00×", "Shadow opacity 60 %", "Distance 6", "Blur 10", "Size 25"]) {
    expect(screen.getByText(label)).toBeTruthy();
  }
});

test("line spacing and thickness show two decimals, as fine as the sliders' 0.01 step", async () => {
  await show({ lineSpacing: 1.25, outlineWidth: 0.75 }, true);
  expect(screen.getByText("Line spacing 1.25×")).toBeTruthy();
  expect(screen.getByText("Thickness 0.75×")).toBeTruthy();
  for (const id of ["style-line-spacing-slider", "style-outline-width-slider"]) expect(screen.getByTestId(id).props.step).toBe(0.01);
});

test.each([
  ["style-opacity-slider", "opacity"], ["style-letter-spacing-slider", "letterSpacing"], ["style-line-spacing-slider", "lineSpacing"],
] as const)("a %s drag begins once and patches transiently", async (testID, key) => {
  await show();
  await drag(testID, [0.2, 0.3]);
  expect(onBegin).toHaveBeenCalledTimes(1);
  expect(onPatchTransient).toHaveBeenLastCalledWith({ [key]: 0.3 });
  expect(onPatch).not.toHaveBeenCalled();
});

test("outline controls exist only while the outline is on", async () => {
  await show({}, false);
  expect(screen.queryByTestId("style-outline-width-slider")).toBeNull();
  expect(screen.queryByRole("button", { name: "Auto" })).toBeNull();
});

test("outline: Auto → null, a colour, and a thickness drag", async () => {
  await show({ outlineColor: "#C8102E" }, true);
  expect(screen.getByRole("button", { name: "Auto" })).not.toBeSelected();
  await fireEvent.press(screen.getByRole("button", { name: "Auto" }));
  expect(onPatch).toHaveBeenLastCalledWith({ outlineColor: null });
  await fireEvent.press(within(screen.getByTestId("style-outline-color")).getByLabelText("Color #2E86AB"));
  expect(onPatch).toHaveBeenLastCalledWith({ outlineColor: "#2E86AB" });
  await drag("style-outline-width-slider", [2.5]);
  expect(onBegin).toHaveBeenCalledTimes(1);
  expect(onPatchTransient).toHaveBeenLastCalledWith({ outlineWidth: 2.5 });
});

test("Auto is selected while the outline colour is automatic", async () => {
  await show({}, true);
  expect(screen.getByRole("button", { name: "Auto" })).toBeSelected();
});

test("the shadow switch turns the default shadow on and off", async () => {
  const view = await show();
  expect(screen.queryByTestId("style-shadow-blur-slider")).toBeNull();
  await fireEvent(screen.getByLabelText("Shadow"), "valueChange", true);
  expect(onPatch).toHaveBeenLastCalledWith({ shadow: DEFAULT_SHADOW });
  await view.rerender(<TextStyleSection style={{ ...DEFAULT_TEXT_STYLE, shadow: { ...DEFAULT_SHADOW } }} outline={false} onBegin={onBegin} onPatch={onPatch} onPatchTransient={onPatchTransient} />);
  await fireEvent(screen.getByLabelText("Shadow"), "valueChange", false);
  expect(onPatch).toHaveBeenLastCalledWith({ shadow: null });
});

test("shadow controls send the whole shadow", async () => {
  await show({ shadow: { ...DEFAULT_SHADOW } });
  await fireEvent.press(within(screen.getByTestId("style-shadow-color")).getByLabelText("Color #C8102E"));
  expect(onPatch).toHaveBeenLastCalledWith({ shadow: { ...DEFAULT_SHADOW, color: "#C8102E" } });
  await drag("style-shadow-opacity-slider", [0.9]);
  expect(onPatchTransient).toHaveBeenLastCalledWith({ shadow: { ...DEFAULT_SHADOW, opacity: 0.9 } });
  await drag("style-shadow-distance-slider", [0.2]);
  expect(onPatchTransient).toHaveBeenLastCalledWith({ shadow: { ...DEFAULT_SHADOW, distance: 0.2 } });
  await drag("style-shadow-blur-slider", [0.4]);
  expect(onPatchTransient).toHaveBeenLastCalledWith({ shadow: { ...DEFAULT_SHADOW, blur: 0.4 } });
  expect(onBegin).toHaveBeenCalledTimes(3);
});

test("the glow switch, colour and size", async () => {
  const view = await show();
  expect(screen.queryByTestId("style-glow-size-slider")).toBeNull();
  await fireEvent(screen.getByLabelText("Glow"), "valueChange", true);
  expect(onPatch).toHaveBeenLastCalledWith({ glow: DEFAULT_GLOW });
  await view.rerender(<TextStyleSection style={{ ...DEFAULT_TEXT_STYLE, glow: { ...DEFAULT_GLOW } }} outline={false} onBegin={onBegin} onPatch={onPatch} onPatchTransient={onPatchTransient} />);
  await fireEvent.press(within(screen.getByTestId("style-glow-color")).getByLabelText("Color #00E5A0"));
  expect(onPatch).toHaveBeenLastCalledWith({ glow: { ...DEFAULT_GLOW, color: "#00E5A0" } });
  await drag("style-glow-size-slider", [0.5]);
  expect(onPatchTransient).toHaveBeenLastCalledWith({ glow: { ...DEFAULT_GLOW, size: 0.5 } });
  await fireEvent(screen.getByLabelText("Glow"), "valueChange", false);
  expect(onPatch).toHaveBeenLastCalledWith({ glow: null });
});

test("the collapsible block is closed until its row is pressed", async () => {
  await render(<CollapsibleTextStyle style={DEFAULT_TEXT_STYLE} outline={false} onBegin={onBegin} onPatch={onPatch} onPatchTransient={onPatchTransient} />);
  expect(screen.queryByTestId("style-opacity-slider")).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Style" }));
  expect(screen.getByTestId("style-opacity-slider")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Style" }));
  expect(screen.queryByTestId("style-opacity-slider")).toBeNull();
});
