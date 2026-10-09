import { fireEvent, render, screen } from "@testing-library/react-native";
import { View } from "react-native";
import { PALETTES, theme } from "@/src/theme/theme";
import { buttonBox, buttonLabel, DISABLED_OPACITY } from "../buttonStyle";
import { PrimaryButton, primaryInk } from "../PrimaryButton";
import { ToneContext } from "../tone";

const D = PALETTES.dark;
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const lum = (c: number[]) => { const [r, g, b] = c.map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a: string, b: string) => (Math.max(lum(rgb(a)), lum(rgb(b))) + 0.05) / (Math.min(lum(rgb(a)), lum(rgb(b))) + 0.05);
const inEditor = { wrapper: ({ children }: { children: React.ReactNode }) => <ToneContext.Provider value="editor">{children}</ToneContext.Provider> };

test("the plain tone's colours: the label colour as the fill, the page's slate as the ink — 18.28 : 1", () => {
  expect(theme.plain).toEqual({ fill: D.text, ink: D.bg });
  expect(theme.plain.fill).toBe("#FFFFFF");
  expect(Math.round(ratio(theme.plain.ink, theme.plain.fill) * 100) / 100).toBe(18.28);
  expect(ratio(theme.plain.ink, theme.plain.fill)).toBeGreaterThanOrEqual(7);
  // White on the bar it stands on: nothing else in a tool is this bright, so it is the main action at a glance.
  expect(ratio(theme.plain.fill, D.surfaceBar)).toBeGreaterThanOrEqual(7);
  expect(primaryInk("plain")).toBe(theme.plain.ink);
  expect(primaryInk()).toBe(theme.colors.onAccent);
});

test("a tool's main button: white with dark ink, the kit's box and label, its own test id — and no gold", async () => {
  const onPress = jest.fn();
  await render(<PrimaryButton tone="plain" title="Save to Photos" onPress={onPress} />, inEditor);
  const b = screen.getByTestId("main-button");
  expect(b).toHaveAccessibleName("Save to Photos");
  expect(b).toHaveStyle({ ...buttonBox(), backgroundColor: theme.plain.fill, opacity: 1 });
  expect(b).toHaveStyle({ height: theme.size.control, borderRadius: theme.radius.pill });
  expect(screen.getByText("Save to Photos")).toHaveStyle({ ...buttonLabel(), color: theme.plain.ink });
  expect(b).not.toHaveStyle({ backgroundColor: theme.colors.accent });
  expect(b.props.style.borderWidth).toBeUndefined();
  expect(screen.queryByTestId("primary-button")).toBeNull();
  expect(b).toBeEnabled();
  await fireEvent.press(b);
  expect(onPress).toHaveBeenCalledTimes(1);
});

test("disabled: dimmed and inert, as the gold one is", async () => {
  const onPress = jest.fn();
  await render(<><PrimaryButton tone="plain" title="Choose a File" disabled onPress={onPress} /><PrimaryButton title="Export" disabled onPress={onPress} /></>);
  const plain = screen.getByTestId("main-button"), gold = screen.getByTestId("primary-button");
  for (const b of [plain, gold]) { expect(b).toBeDisabled(); expect(b).toHaveStyle({ opacity: DISABLED_OPACITY }); expect(b.props.accessibilityState).toMatchObject({ disabled: true }); }
  expect(plain).toHaveStyle({ backgroundColor: theme.plain.fill });
  await fireEvent.press(plain);
  expect(onPress).not.toHaveBeenCalled();
});

test("compact: 36 pt with the slop to a 44-pt target, 15-pt label; an icon is drawn before the title; a label for VoiceOver can be given", async () => {
  await render(<PrimaryButton tone="plain" compact title="Apply" accessibilityLabel="Apply the trim" icon={<View testID="symbol" />} onPress={() => {}} />);
  const b = screen.getByTestId("main-button");
  expect(b).toHaveAccessibleName("Apply the trim");
  expect(b).toHaveStyle({ ...buttonBox(true), backgroundColor: theme.plain.fill });
  expect(b).toHaveStyle({ height: theme.size.controlCompact });
  const slop = b.props.hitSlop as { top: number; bottom: number };
  expect(theme.size.controlCompact + slop.top + slop.bottom).toBe(theme.size.touch);
  expect(screen.getByText("Apply")).toHaveStyle({ fontSize: theme.type.body, fontWeight: theme.weight.semi, color: theme.plain.ink });
  expect(screen.getByTestId("symbol")).toBeTruthy();
});

test("gold is still the default: a screen's one action is untouched", async () => {
  await render(<PrimaryButton title="Export" onPress={() => {}} />);
  expect(screen.getByTestId("primary-button")).toHaveStyle({ ...buttonBox(), backgroundColor: theme.colors.accent });
  expect(screen.getByText("Export")).toHaveStyle({ color: theme.colors.onAccent });
  expect(screen.queryByTestId("main-button")).toBeNull();
});
