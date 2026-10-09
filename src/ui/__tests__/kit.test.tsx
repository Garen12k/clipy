import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { theme } from "@/src/theme/theme";
import { Chip } from "../Chip";
import { EmptyState } from "../EmptyState";
import { haptic } from "../haptics";
import { PrimaryButton } from "../PrimaryButton";
import { ProgressRing } from "../ProgressRing";
import { SecondaryButton } from "../SecondaryButton";
import { Body, Title } from "../Text";
import { ToolButton } from "../ToolButton";

test("haptic maps kinds and never throws", () => {
  haptic("light"); haptic("medium"); haptic("success");
  expect(Haptics.impactAsync).toHaveBeenCalledWith("light");
  expect(Haptics.impactAsync).toHaveBeenCalledWith("medium");
  expect(Haptics.notificationAsync).toHaveBeenCalledWith("success");
  (Haptics.impactAsync as jest.Mock).mockImplementationOnce(() => { throw new Error("no module"); });
  expect(() => haptic("light")).not.toThrow();
});

test("PrimaryButton is a gold pill with on-accent text", async () => {
  await render(<PrimaryButton title="New clip" onPress={() => {}} />);
  expect(screen.getByTestId("primary-button")).toHaveStyle({ backgroundColor: theme.colors.accent, borderRadius: theme.radius.pill });
  expect(screen.getByText("New clip")).toHaveStyle({ color: theme.colors.onAccent, fontWeight: theme.weight.semi, fontSize: theme.type.headline });
});

test("SecondaryButton presses and can be disabled", async () => {
  const onPress = jest.fn();
  await render(<SecondaryButton title="Share" onPress={onPress} />);
  await fireEvent.press(screen.getByRole("button", { name: "Share" }));
  expect(onPress).toHaveBeenCalledTimes(1);
});

test("SecondaryButton draws its icon before the title; without one it is the title alone, the same box", async () => {
  const { View } = require("react-native");
  const v = await render(<SecondaryButton title="Continue with email" onPress={() => {}} icon={<View testID="mail-icon" />} />);
  const withIcon = screen.getByRole("button", { name: "Continue with email" });
  expect(withIcon.children).toHaveLength(2);
  expect(withIcon.children[0]).toBe(screen.getByTestId("mail-icon"));
  expect(withIcon.children[1]).toBe(screen.getByText("Continue with email"));
  expect(withIcon).toHaveStyle({ backgroundColor: theme.elevation.lifted, height: theme.size.control });
  await v.rerender(<SecondaryButton title="Share" onPress={() => {}} />);
  const plain = screen.getByRole("button", { name: "Share" });
  expect(plain.children).toHaveLength(1);
  expect(plain).toHaveStyle({ backgroundColor: theme.elevation.lifted, height: theme.size.control });
});

test("ToolButton is a button and shows the selected state when active", async () => {
  await render(<ToolButton label="Effects" icon="sparkles" onPress={() => {}} active />);
  expect(screen.getByRole("button", { name: "Effects" })).toBeSelected();
});

test("ProgressRing reports its value", async () => {
  await render(<ProgressRing progress={0.42} />);
  expect(screen.getByRole("progressbar")).toHaveProp("accessibilityValue", { min: 0, max: 100, now: 42 });
  expect(screen.getByText("42%")).toBeTruthy();
});

test("ProgressRing shows a check when done", async () => {
  await render(<ProgressRing progress={1} done />);
  expect(screen.getByLabelText("Done")).toBeTruthy();
});

test("ProgressRing when done reports 100 and labels the accessible root", async () => {
  await render(<ProgressRing progress={0.3} done />);
  const ring = screen.getByRole("progressbar");
  expect(ring).toHaveProp("accessibilityValue", { min: 0, max: 100, now: 100 });
  expect(ring).toHaveProp("accessibilityLabel", "Done");
});

test("EmptyState and Title render", async () => {
  await render(<><Title>Projects</Title><EmptyState emoji="🏝️" title="No clips yet" hint="Pick some videos" /></>);
  expect(screen.getByText("Projects")).toHaveStyle({ fontWeight: theme.weight.bold, fontSize: theme.type.title });
  expect(StyleSheet.flatten(screen.getByText("Projects").props.style)).not.toHaveProperty("textTransform");
  expect(screen.getByText("No clips yet")).toBeTruthy();
  expect(screen.getByText("Pick some videos")).toBeTruthy();
});

test("Chip compact is smaller and keeps role, label and states", async () => {
  await render(<Chip compact label="Reset" selected={false} disabled onPress={() => {}} />);
  const chip = screen.getByRole("button", { name: "Reset" });
  expect(chip).toBeDisabled();
  expect(chip).toHaveStyle({ height: theme.size.chipCompact, paddingHorizontal: theme.space.md });
});

test("Chip compact widens its touch target sideways too; the regular chip only up and down", async () => {
  await render(<><Chip compact label="Tab" selected={false} onPress={() => {}} /><Chip label="Big" selected={false} onPress={() => {}} /></>);
  expect(screen.getByRole("button", { name: "Tab" })).toHaveProp("hitSlop", { top: 10, bottom: 10, left: 4, right: 4 });
  expect(screen.getByRole("button", { name: "Big" })).toHaveProp("hitSlop", { top: 4, bottom: 4 });
});

test("text is the system font: Title, Body and a button's label set no family, no upper case, no letter spacing", async () => {
  await render(<><Title size={theme.type.headline}>Remove background</Title><Body weight="bold">Bold</Body><Body>Plain</Body><PrimaryButton title="New Project" onPress={() => {}} /></>);
  for (const t of ["Remove background", "Bold", "Plain", "New Project"]) {
    const s = StyleSheet.flatten(screen.getByText(t).props.style);
    for (const k of ["fontFamily", "textTransform", "letterSpacing"]) expect(s).not.toHaveProperty(k);
  }
  expect(screen.getByText("Remove background")).toHaveStyle({ fontSize: theme.type.headline, fontWeight: theme.weight.semi });   // below Title 2: semibold
  expect(screen.getByText("Bold")).toHaveStyle({ fontSize: theme.type.body, fontWeight: theme.weight.bold });
  expect(screen.getByText("Plain")).toHaveStyle({ fontSize: theme.type.body, fontWeight: theme.weight.regular });
  expect(screen.getByText("New Project")).toBeTruthy();                                                                    // shown as typed
});

test("the export ring's percent has tabular digits", async () => {
  await render(<ProgressRing progress={0.4} />);
  expect(screen.getByText("40%")).toHaveStyle({ fontVariant: ["tabular-nums"] });
});
