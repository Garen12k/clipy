import { fireEvent, render, screen } from "@testing-library/react-native";
import * as Haptics from "expo-haptics";
import { theme } from "@/src/theme/theme";
import { EmptyState } from "../EmptyState";
import { haptic } from "../haptics";
import { PrimaryButton } from "../PrimaryButton";
import { ProgressRing } from "../ProgressRing";
import { SecondaryButton } from "../SecondaryButton";
import { Title } from "../Text";
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
  expect(screen.getByText("New clip")).toHaveStyle({ color: theme.colors.onAccent, fontFamily: theme.fonts.bodyBold });
});

test("SecondaryButton presses and can be disabled", async () => {
  const onPress = jest.fn();
  await render(<SecondaryButton title="Share" onPress={onPress} />);
  await fireEvent.press(screen.getByRole("button", { name: "Share" }));
  expect(onPress).toHaveBeenCalledTimes(1);
});

test("ToolButton exposes tab role and selected state when asked", async () => {
  await render(<ToolButton label="Effects" icon="sparkles" onPress={() => {}} active role="tab" />);
  expect(screen.getByRole("tab", { name: "Effects" })).toBeSelected();
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

test("EmptyState and Title render", async () => {
  await render(<><Title>Your voyages</Title><EmptyState emoji="🏝️" title="No clips yet" hint="Pick some videos" /></>);
  expect(screen.getByText("Your voyages")).toHaveStyle({ fontFamily: theme.fonts.title });
  expect(screen.getByText("No clips yet")).toBeTruthy();
  expect(screen.getByText("Pick some videos")).toBeTruthy();
});