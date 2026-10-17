// The Ionicon draws its name as its text here, so the icon can be found (under Jest `expo-symbols` is empty: Icon draws the Ionicon).
jest.mock("@expo/vector-icons", () => {
  const { createElement } = require("react");
  const { Text } = require("react-native");
  const Ionicons = (p: { name: string; size: number; color: string }) => createElement(Text, { testID: "ionicon", style: { fontSize: p.size, color: p.color } }, p.name);
  Ionicons.glyphMap = {};
  return { Ionicons };
});
import { render, screen } from "@testing-library/react-native";
import { theme } from "@/src/theme/theme";
import { Chip } from "../Chip";

test("a chip with an icon draws it before its label; without one the chip is exactly as before", async () => {
  await render(<Chip label="Auto" selected={false} onPress={() => {}} icon="color-wand-outline" />);
  expect(screen.getByRole("button", { name: "Auto" })).toBeTruthy();
  expect(screen.getByTestId("ionicon")).toHaveTextContent("color-wand-outline");
  expect(screen.getByTestId("ionicon")).toHaveStyle({ fontSize: theme.size.icon.sm });
  await render(<Chip label="Brightness" selected={false} onPress={() => {}} />);
  expect(screen.queryByTestId("ionicon")).toBeNull();
});
