import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { withSpring, withTiming } from "react-native-reanimated";
import { theme } from "@/src/theme/theme";
import { buttonBox, buttonLabel } from "../buttonStyle";
import { Chip } from "../Chip";
import { IconButton } from "../IconButton";
import { EASE } from "../motion";
import { PressableScale } from "../PressableScale";
import { PrimaryButton } from "../PrimaryButton";
import { QuietButton } from "../QuietButton";
import { SecondaryButton } from "../SecondaryButton";
import { ToolButton } from "../ToolButton";
import { setReducedMotionForTests } from "../useReducedMotion";

jest.mock("react-native-reanimated", () => {
  const m = require("react-native-reanimated/mock");
  return { ...m, withSpring: jest.fn(m.withSpring), withTiming: jest.fn(m.withTiming) };
});
const T = withTiming as jest.Mock, S = withSpring as jest.Mock;
const btn = (name: string) => screen.getByRole("button", { name });
beforeEach(() => { setReducedMotionForTests(false); T.mockClear(); S.mockClear(); });

test("PressableScale dips on press-in and comes back on press-out, and still calls the caller's handlers", async () => {
  const onIn = jest.fn(), onOut = jest.fn(), onPress = jest.fn();
  await render(<PressableScale accessibilityRole="button" accessibilityLabel="Go" onPressIn={onIn} onPressOut={onOut} onPress={onPress}><Text>go</Text></PressableScale>);
  expect(T).not.toHaveBeenCalled();                                                       // nothing animates on mount
  await fireEvent(btn("Go"), "pressIn");
  expect(T).toHaveBeenLastCalledWith(theme.motion.pressScale, { duration: theme.motion.fast, easing: EASE });
  expect(onIn).toHaveBeenCalledTimes(1);
  await fireEvent(btn("Go"), "pressOut");
  expect(T).toHaveBeenLastCalledWith(1, { duration: theme.motion.fast, easing: EASE });
  expect(onOut).toHaveBeenCalledTimes(1);
  await fireEvent.press(btn("Go"));
  expect(onPress).toHaveBeenCalledTimes(1);
});

test("with Reduce Motion a press does not animate", async () => {
  setReducedMotionForTests(true);
  await render(<PressableScale accessibilityRole="button" accessibilityLabel="Go"><Text>go</Text></PressableScale>);
  await fireEvent(btn("Go"), "pressIn");
  await fireEvent(btn("Go"), "pressOut");
  expect(T).not.toHaveBeenCalled();
});

test("lifted: no animation on mount; the one spring when it changes, and only then", async () => {
  const ui = (lifted: boolean, label = "a") => <PressableScale lifted={lifted} accessibilityRole="button" accessibilityLabel="Tile"><Text>{label}</Text></PressableScale>;
  const view = await render(ui(true));
  expect(S).not.toHaveBeenCalled();
  await view.rerender(ui(true, "b"));                                                     // a re-render that changes nothing about `lifted`
  expect(S).not.toHaveBeenCalled();
  await view.rerender(ui(false));
  expect(S).toHaveBeenLastCalledWith(0, theme.motion.spring);
  await view.rerender(ui(true));
  expect(S).toHaveBeenLastCalledWith(1, theme.motion.spring);
  expect(S).toHaveBeenCalledTimes(2);
});

test("still: a change of `lifted` lands at once, with no spring (a chip whose selection follows a slider being dragged)", async () => {
  const ui = (lifted: boolean, still: boolean) => <PressableScale lifted={lifted} still={still} accessibilityRole="button" accessibilityLabel="Tile"><Text>a</Text></PressableScale>;
  const view = await render(ui(false, true));
  await view.rerender(ui(true, true));
  await view.rerender(ui(false, true));
  expect(S).not.toHaveBeenCalled();
  await view.rerender(ui(false, false));                                                  // the drag ended: nothing changed, nothing animates
  expect(S).not.toHaveBeenCalled();
  await view.rerender(ui(true, false));                                                   // a pick after it springs as usual
  expect(S).toHaveBeenCalledTimes(1);
});

test("Chip still: the ring and the colours switch at once, the lift does not spring", async () => {
  const ui = (selected: boolean) => <Chip still label="2×" selected={selected} onPress={() => {}} />;
  const view = await render(ui(false));
  await view.rerender(ui(true));
  expect(btn("2×")).toBeSelected();
  expect(btn("2×")).toHaveStyle({ backgroundColor: theme.elevation.lifted, ...theme.ring });
  expect(screen.getByText("2×")).toHaveStyle({ color: theme.colors.accent });
  await view.rerender(ui(false));
  expect(btn("2×")).toHaveStyle({ backgroundColor: theme.elevation.tile, ...theme.ringClear });
  expect(S).not.toHaveBeenCalled();
});

test("the three buttons share one box and one label style; compact is 36", async () => {
  expect(buttonBox()).toMatchObject({ height: theme.size.control, paddingHorizontal: theme.space.xl, borderRadius: theme.radius.pill });
  expect(buttonBox(true)).toMatchObject({ height: theme.size.controlCompact, paddingHorizontal: theme.space.lg });
  expect(buttonLabel()).toMatchObject({ fontFamily: theme.fonts.bodyBold, fontSize: theme.type.body, textTransform: "uppercase" });
  expect(buttonLabel(true)).toMatchObject({ fontSize: theme.type.label });
  await render(<><PrimaryButton title="Main" onPress={() => {}} /><SecondaryButton title="Second" onPress={() => {}} /><QuietButton title="Quiet" onPress={() => {}} />
    <PrimaryButton compact title="Main small" onPress={() => {}} /><SecondaryButton compact title="Second small" onPress={() => {}} /><QuietButton compact title="Quiet small" onPress={() => {}} /></>);
  for (const name of ["Main", "Second", "Quiet"]) expect(btn(name)).toHaveStyle({ height: theme.size.control, borderRadius: theme.radius.pill });
  for (const name of ["Main small", "Second small", "Quiet small"]) expect(btn(name)).toHaveStyle({ height: theme.size.controlCompact });
  expect(btn("Main")).toHaveStyle({ backgroundColor: theme.colors.accent });
  expect(btn("Second")).toHaveStyle({ borderWidth: 1.5, borderColor: theme.colors.hairline });
  expect(btn("Second").props.style).not.toEqual(expect.objectContaining({ backgroundColor: theme.colors.accent }));
  expect(screen.getByText("Quiet")).toHaveStyle({ color: theme.colors.accent, fontFamily: theme.fonts.bodyBold });
  expect(screen.getByText("Second")).toHaveStyle({ color: theme.colors.text, fontFamily: theme.fonts.bodyBold });
});

test("compact main / secondary / quiet buttons are 36 pt high and reach 44 with the same vertical slop; regular ones need none", async () => {
  await render(<><PrimaryButton compact title="Export" onPress={() => {}} /><SecondaryButton compact title="Use" onPress={() => {}} /><QuietButton compact title="Reset" onPress={() => {}} />
    <PrimaryButton title="Tap" onPress={() => {}} /><SecondaryButton title="Cancel" onPress={() => {}} /></>);
  for (const name of ["Export", "Use", "Reset"]) {
    const slop = btn(name).props.hitSlop as { top: number; bottom: number };
    expect(theme.size.controlCompact + slop.top + slop.bottom).toBe(theme.size.touch);
    expect(slop).toEqual(btn("Reset").props.hitSlop);
  }
  for (const name of ["Tap", "Cancel"]) expect(btn(name).props.hitSlop).toBeUndefined();
});

test("QuietButton: presses, can be disabled, danger is red, compact reaches 44 pt with its slop", async () => {
  const onPress = jest.fn();
  await render(<><QuietButton title="Reset" onPress={onPress} compact /><QuietButton title="Off" onPress={onPress} disabled /><QuietButton title="Remove" onPress={onPress} danger /></>);
  await fireEvent.press(btn("Reset"));
  expect(onPress).toHaveBeenCalledTimes(1);
  await fireEvent.press(btn("Off"));
  expect(onPress).toHaveBeenCalledTimes(1);
  expect(btn("Off")).toBeDisabled();
  expect(screen.getByText("Remove")).toHaveStyle({ color: theme.colors.dangerText });
  const slop = btn("Reset").props.hitSlop as { top: number; bottom: number };
  expect(theme.size.controlCompact + slop.top + slop.bottom).toBeGreaterThanOrEqual(theme.size.touch);
  expect(btn("Reset")).toHaveStyle({ minWidth: theme.size.touch });
});

test("IconButton is a 40-pt box that reaches 44 with its slop", async () => {
  await render(<IconButton name="chevron-back-outline" accessibilityLabel="Back" onPress={() => {}} />);
  expect(btn("Back")).toHaveStyle({ width: theme.size.iconButton, height: theme.size.iconButton });
  expect(theme.size.iconButton + 2 * (btn("Back").props.hitSlop as number)).toBeGreaterThanOrEqual(theme.size.touch);
});

test("ToolButton: a 72-pt column with a 44-pt box; active = ring, lifted surface, gold label — not a gold fill", async () => {
  await render(<><ToolButton label="Split" icon="cut-outline" onPress={() => {}} /><ToolButton label="Reverse" icon="play-back-outline" onPress={() => {}} active /></>);
  expect(btn("Split")).toHaveStyle({ width: theme.size.toolColumn });
  expect(screen.getByText("Split")).toHaveStyle({ color: theme.colors.text, fontSize: theme.type.micro });
  expect(btn("Reverse")).toBeSelected();
  expect(screen.getByText("Reverse")).toHaveStyle({ color: theme.colors.accent, fontFamily: theme.fonts.bodySemi });
});

test("Chip: explicit heights; selected = ring + lifted surface + gold label; regular chips reach 44 pt too", async () => {
  await render(<><Chip label="9:16" selected onPress={() => {}} /><Chip label="1:1" selected={false} onPress={() => {}} /><Chip compact label="In" selected={false} onPress={() => {}} /></>);
  expect(btn("9:16")).toBeSelected();
  expect(btn("9:16")).toHaveStyle({ height: theme.size.chip, backgroundColor: theme.elevation.lifted, ...theme.ring });
  expect(screen.getByText("9:16")).toHaveStyle({ color: theme.colors.accent });
  expect(btn("1:1")).toHaveStyle({ height: theme.size.chip, backgroundColor: theme.elevation.tile, ...theme.ringClear });
  expect(screen.getByText("1:1")).toHaveStyle({ color: theme.colors.text });
  expect(btn("In")).toHaveStyle({ height: theme.size.chipCompact, paddingHorizontal: theme.space.md });
  const slop = btn("1:1").props.hitSlop as { top: number; bottom: number };
  expect(theme.size.chip + slop.top + slop.bottom).toBeGreaterThanOrEqual(theme.size.touch);
});
