// The app on the "icons and light" build: the glass native module is there. What the phone says about Liquid Glass is `mockPhone`.
jest.mock("expo-modules-core", () => {
  const actual = jest.requireActual("expo-modules-core");
  return { ...actual, requireOptionalNativeModule: jest.fn((name: string) => (name === "ExpoGlassEffect" ? {} : null)) };
});
const mockPhone = { liquid: true, api: true };
jest.mock("expo-glass-effect", () => {
  const { createElement } = require("react");
  const { View } = require("react-native");
  return {
    GlassView: (p: object) => createElement(View, { ...p, accessibilityHint: "system glass" }),
    isLiquidGlassAvailable: () => mockPhone.liquid,
    isGlassEffectAPIAvailable: () => mockPhone.api,
  };
});
import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { GLASS, theme } from "@/src/theme/theme";
import { Glass } from "../Glass";

afterEach(() => { GLASS.home = false; GLASS.editor = false; });
const box = { height: 48, borderRadius: 12 };

test("switched off (as shipped): the solid colour, even on a phone that has glass", async () => {
  await render(<Glass side="home" color={theme.screen.bar} style={box} testID="bar" />);
  expect(screen.getByTestId("bar")).toHaveStyle({ ...box, backgroundColor: theme.screen.bar });
  expect(screen.getByTestId("bar")).not.toHaveProp("accessibilityHint", "system glass");
});

test("switched on, on a phone that has glass: the system glass in the SAME box, without the solid colour", async () => {
  GLASS.home = true;
  await render(<Glass side="home" color={theme.screen.bar} style={box} testID="bar"><Text>Inside</Text></Glass>);
  const bar = screen.getByTestId("bar");
  expect(bar).toHaveProp("accessibilityHint", "system glass");
  expect(bar).toHaveProp("glassEffectStyle", "regular");
  expect(bar).toHaveStyle(box);
  expect(bar).not.toHaveStyle({ backgroundColor: theme.screen.bar });
  expect(screen.getByText("Inside")).toBeTruthy();
  // The other side keeps its own switch.
  await render(<Glass side="editor" color={theme.elevation.bar} style={box} testID="other" />);
  expect(screen.getByTestId("other")).toHaveStyle({ ...box, backgroundColor: theme.elevation.bar });
});

test.each([["an iOS from before Liquid Glass", false, true], ["a phone whose glass API is missing", true, false]])("switched on, on %s: the solid colour", (_name, liquid, api) => {
  jest.isolateModules(() => {
    mockPhone.liquid = liquid; mockPhone.api = api;
    const fresh = require("../systemGlass") as typeof import("../systemGlass");
    expect(fresh.isGlassAvailable()).toBe(false);
    mockPhone.liquid = true; mockPhone.api = true;
  });
});
