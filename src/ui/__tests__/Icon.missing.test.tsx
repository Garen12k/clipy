// The app as it runs on a build from BEFORE "icons and light": no SF Symbols native module. The package itself is made to
// throw when it is loaded, as its iOS files would without their native view — so these tests pass only if nothing loads it.
jest.mock("expo-modules-core", () => {
  const actual = jest.requireActual("expo-modules-core");
  return { ...actual, requireOptionalNativeModule: jest.fn(() => null) };
});
const mockLoads = { count: 0 };
jest.mock("expo-symbols", () => {
  mockLoads.count += 1;
  throw new Error("Cannot find native module 'SymbolModule'");
});
jest.mock("@expo/vector-icons", () => {
  const { createElement } = require("react");
  const { Text } = require("react-native");
  const Ionicons = (p: { name: string; size: number; color: string; testID?: string }) => createElement(Text, { testID: p.testID ?? "ionicon", style: { fontSize: p.size, color: p.color } }, p.name);
  Ionicons.glyphMap = {};
  return { Ionicons };
});
import { render, screen } from "@testing-library/react-native";
import { requireOptionalNativeModule } from "expo-modules-core";
import { theme } from "@/src/theme/theme";
import { Icon } from "../Icon";
import { isSymbolsAvailable, SF_SYMBOLS } from "../sfSymbols";

test("importing the icon loads nothing native, and a mapped name is the Ionicon exactly as today", async () => {
  expect(mockLoads.count).toBe(0);
  expect(SF_SYMBOLS["chevron-back-outline"]).toBe("chevron.backward");
  await render(<Icon name="chevron-back-outline" size={20} color={theme.colors.accent} />);
  expect(screen.getByTestId("ionicon")).toHaveTextContent("chevron-back-outline");
  expect(screen.getByTestId("ionicon")).toHaveStyle({ fontSize: 20, color: theme.colors.accent });
  expect(isSymbolsAvailable()).toBe(false);
  expect(requireOptionalNativeModule).toHaveBeenCalledWith("SymbolModule");
  expect(mockLoads.count).toBe(0);                 // the package was never even asked for
});

test("the defaults are the kit's icon size and the text colour", async () => {
  await render(<Icon name="add-outline" />);
  expect(screen.getByTestId("ionicon")).toHaveStyle({ fontSize: theme.size.icon.lg, color: theme.colors.text });
});

test("a native module that is there but a package that throws on load: still the Ionicon, never a crash", () => {
  jest.isolateModules(() => {
    jest.mocked(requireOptionalNativeModule).mockReturnValue({} as never);
    const fresh = require("../sfSymbols") as typeof import("../sfSymbols");
    const before = mockLoads.count;
    expect(fresh.symbolView()).toBeNull();
    expect(mockLoads.count).toBe(before + 1);
    expect(fresh.symbolView()).toBeNull();
    expect(mockLoads.count).toBe(before + 1);      // asked once
    expect(fresh.isSymbolsAvailable()).toBe(false);
  });
});
