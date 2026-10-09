// The app as it runs on a build from BEFORE "icons and light": no glass native module. The package itself is made to throw
// when it is loaded, as its iOS files would without their native view — so these tests pass only if nothing loads it.
jest.mock("expo-modules-core", () => {
  const actual = jest.requireActual("expo-modules-core");
  return { ...actual, requireOptionalNativeModule: jest.fn(() => null) };
});
const mockLoads = { count: 0 };
jest.mock("expo-glass-effect", () => {
  mockLoads.count += 1;
  throw new Error("Cannot find native module 'ExpoGlassEffect'");
});
import { render, screen } from "@testing-library/react-native";
import { requireOptionalNativeModule } from "expo-modules-core";
import { Text } from "react-native";
import { GLASS, GLASS_TINT, theme } from "@/src/theme/theme";
import { Glass } from "../Glass";
import { isGlassAvailable } from "../systemGlass";

// When the app loaded (the imports above), with the trial's two switches on: the native module was looked for, the package was not.
const atLoad = { looked: jest.mocked(requireOptionalNativeModule).mock.calls.map((c) => c[0]), switches: { ...GLASS }, loads: mockLoads.count };
beforeEach(() => { GLASS.home = false; GLASS.editor = false; jest.mocked(requireOptionalNativeModule).mockClear(); });

test("the trial has both sides switched on — and loading the app looked for the native module without ever loading the package", () => {
  expect(atLoad.switches).toEqual({ home: true, editor: true });
  expect(atLoad.looked).toEqual(["ExpoGlassEffect"]);
  expect(atLoad.loads).toBe(0);
});

test("switched off: the solid colour in the given box, and nothing native is even looked for", async () => {
  await render(<Glass side="home" color={theme.screen.bar} tint={GLASS_TINT.dark} style={{ height: 48, borderRadius: 12 }} testID="bar"><Text>Inside</Text></Glass>);
  expect(screen.getByTestId("bar")).toHaveStyle({ height: 48, borderRadius: 12, backgroundColor: theme.screen.bar });
  expect(screen.getByText("Inside")).toBeTruthy();
  expect(requireOptionalNativeModule).not.toHaveBeenCalled();
  expect(mockLoads.count).toBe(0);
});

test("switched ON in an app without the module: still the solid colour, the same box, never a crash", async () => {
  GLASS.editor = true;
  await render(<Glass side="editor" color={theme.elevation.bar} tint={GLASS_TINT.editor} style={{ height: 48 }} testID="bar" />);
  expect(screen.getByTestId("bar")).toHaveStyle({ height: 48, backgroundColor: theme.elevation.bar });
  expect(requireOptionalNativeModule).not.toHaveBeenCalled();   // asked once, when the app loaded
  expect(isGlassAvailable()).toBe(false);
  expect(mockLoads.count).toBe(0);                 // the package was never even asked for
});

test("a native module that is there but a package that throws on load: no glass, never a crash", () => {
  jest.isolateModules(() => {
    jest.mocked(requireOptionalNativeModule).mockReturnValue({} as never);
    const fresh = require("../systemGlass") as typeof import("../systemGlass");
    const before = mockLoads.count;
    expect(fresh.glassView()).toBeNull();
    expect(fresh.glassView()).toBeNull();
    expect(mockLoads.count).toBe(before + 1);      // asked once
  });
});
