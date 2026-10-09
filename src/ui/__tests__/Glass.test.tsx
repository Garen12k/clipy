// The app on the "icons and light" build: the glass native module is there. What the phone says about Liquid Glass is `mockPhone`.
jest.mock("expo-modules-core", () => {
  const actual = jest.requireActual("expo-modules-core");
  return { ...actual, requireOptionalNativeModule: jest.fn((name: string) => (name === "ExpoGlassEffect" ? {} : null)) };
});
// It lives on the global object: the app asks while it LOADS (the imports below), before a `const` of this file exists.
type Phone = { liquid: boolean; api: boolean };
jest.mock("expo-glass-effect", () => {
  const { createElement } = require("react");
  const { View } = require("react-native");
  const phone = ((globalThis as { __glassPhone?: Phone }).__glassPhone ??= { liquid: true, api: true });
  return {
    GlassView: (p: object) => createElement(View, { ...p, accessibilityHint: "system glass" }),
    isLiquidGlassAvailable: () => phone.liquid,
    isGlassEffectAPIAvailable: () => phone.api,
  };
});
import { render, screen } from "@testing-library/react-native";
import { useEffect } from "react";
import { AccessibilityInfo, StyleSheet, Text } from "react-native";
import { GLASS, GLASS_TINT, glassTint, PALETTES, theme } from "@/src/theme/theme";
import { Glass } from "../Glass";
import { SecondaryButton } from "../SecondaryButton";
import { reduceTransparencyPhone } from "../testing/glassPhone";
import { ShownContext } from "../tone";

const mockPhone = (globalThis as unknown as { __glassPhone: Phone }).__glassPhone;
const phone = reduceTransparencyPhone();
beforeEach(() => { GLASS.home = true; GLASS.editor = true; phone.start(false); });
afterEach(() => { jest.restoreAllMocks(); });

const box = { height: 48, borderRadius: theme.radius.pill, paddingHorizontal: theme.space.xs, flexDirection: "row" as const };
const NAVY = theme.screens.dark;
const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style);
const mounts = { count: 0 };
function Inside() { useEffect(() => { mounts.count += 1; }, []); return <Text>Inside</Text>; }
const bar = (over: object = {}) => <Glass side="home" color={NAVY.bar} tint={glassTint(NAVY)} style={box} testID="bar" {...over}><Inside /></Glass>;

test("the trial: both sides are on, and each is its own word", () => {
  expect(GLASS).toEqual({ home: true, editor: true });
});

test("the tints are the three bar colours at 60 %, written out — and a family gets its own", () => {
  const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(",");
  expect(GLASS_TINT).toEqual({ editor: `rgba(${rgb(PALETTES.dark.surfaceBar)},0.6)`, dark: `rgba(${rgb(PALETTES.dark.screenBar)},0.6)`, light: `rgba(${rgb(PALETTES.light.screenBar)},0.6)` });
  expect(glassTint(theme.surfaces.editor)).toBe(GLASS_TINT.editor);
  expect(glassTint(theme.screens.dark)).toBe(GLASS_TINT.dark);
  expect(glassTint(theme.screens.light)).toBe(GLASS_TINT.light);
});

test("switched on, a phone that draws glass, Reduce Transparency off: OUR box as it was, and the glass behind the children — its corners, its tint, no touches", async () => {
  await render(bar());
  await phone.settle();
  const outer = screen.getByTestId("bar");
  expect(outer).not.toHaveProp("accessibilityHint", "system glass");      // the box is a plain view
  expect(flat("bar")).toEqual(box);                                       // the same style, and no solid colour
  const glass = screen.getByTestId("bar-glass");
  expect(glass).toHaveProp("accessibilityHint", "system glass");
  expect(glass).toHaveProp("glassEffectStyle", "regular");
  expect(glass).toHaveProp("tintColor", GLASS_TINT.dark);
  expect(glass).toHaveProp("colorScheme", "dark");
  expect(glass).toHaveProp("pointerEvents", "none");
  expect(glass.props.isInteractive).toBeUndefined();
  expect(glass.props.children).toBeUndefined();                           // nothing of ours is inside the system's view
  // It fills the box and has the box's corner: half the height, not the pill's 999.
  expect(flat("bar-glass")).toEqual({ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, borderRadius: 24 });
  expect(screen.getByText("Inside")).toBeTruthy();
  expect(outer.children[0]).toBe(glass);                                  // behind the children
});

test("the glass's corner: the style's own when it is smaller than half the height, `glassRadius` when the style has no height", async () => {
  await render(<>
    <Glass side="home" color={NAVY.bar} tint={GLASS_TINT.dark} style={{ height: 48, borderRadius: 12 }} testID="card" />
    <Glass side="home" color={NAVY.bar} tint={GLASS_TINT.dark} style={{ borderRadius: theme.radius.pill }} glassRadius={24} testID="pill" />
    <Glass side="home" color={NAVY.bar} tint={GLASS_TINT.dark} style={{ height: 48 }} testID="square" />
  </>);
  await phone.settle();
  expect(flat("card-glass").borderRadius).toBe(12);
  expect(flat("pill-glass").borderRadius).toBe(24);
  expect(flat("square-glass").borderRadius).toBe(0);
});

test("switched OFF: the solid colour in the same box, even on a phone that has glass — and the phone is asked nothing", async () => {
  GLASS.home = false;
  await render(bar());
  await phone.settle();
  expect(flat("bar")).toEqual({ ...box, backgroundColor: NAVY.bar });
  expect(screen.queryByTestId("bar-glass")).toBeNull();
  expect(phone.asked).toBe(0);
  expect(phone.listeners()).toBe(0);
  // The other side keeps its own switch.
  await render(<Glass side="editor" color={theme.elevation.bar} tint={GLASS_TINT.editor} style={box} testID="other" />);
  await phone.settle();
  expect(screen.getByTestId("other-glass")).toHaveProp("tintColor", GLASS_TINT.editor);
  expect(flat("other")).toEqual(box);
});

test("the three states draw the same box: off, Reduce Transparency and glass differ only in the solid colour", async () => {
  const seen: object[] = [];
  GLASS.home = false;
  const off = await render(bar()); await phone.settle(); seen.push(flat("bar")); const offTree = JSON.stringify(off.toJSON()); await off.unmount();
  GLASS.home = true; phone.start(true);
  const reduced = await render(bar()); await phone.settle(); seen.push(flat("bar")); const reducedTree = JSON.stringify(reduced.toJSON()); await reduced.unmount();
  phone.start(false);
  await render(bar()); await phone.settle(); seen.push({ ...flat("bar"), backgroundColor: NAVY.bar });
  expect(screen.getByTestId("bar-glass")).toBeTruthy();
  expect(seen[0]).toEqual({ ...box, backgroundColor: NAVY.bar });
  expect(seen[1]).toEqual(seen[0]);
  expect(seen[2]).toEqual(seen[0]);
  expect(reducedTree).toBe(offTree);                                      // Reduce Transparency is exactly the switched-off tree
});

test("Reduce Transparency: solid when the phone says on, and it follows the setting live — the children stay mounted", async () => {
  phone.start(true);
  mounts.count = 0;
  await render(bar());
  await phone.settle();
  expect(flat("bar")).toEqual({ ...box, backgroundColor: NAVY.bar });
  expect(screen.queryByTestId("bar-glass")).toBeNull();
  await phone.change(false);
  expect(screen.getByTestId("bar-glass")).toBeTruthy();
  expect(flat("bar")).toEqual(box);
  await phone.change(true);
  expect(screen.queryByTestId("bar-glass")).toBeNull();
  expect(flat("bar").backgroundColor).toBe(NAVY.bar);
  expect(mounts.count).toBe(1);
});

test("until the phone has answered, a surface is solid — never glass first", async () => {
  jest.spyOn(AccessibilityInfo, "isReduceTransparencyEnabled").mockImplementation(() => new Promise(() => {}));
  await render(bar());
  await phone.settle();
  expect(flat("bar")).toEqual({ ...box, backgroundColor: NAVY.bar });
  expect(screen.queryByTestId("bar-glass")).toBeNull();
  expect(phone.listeners()).toBe(1);                                      // and it is listening for the answer to change
});

test("ONE listener however many surfaces, and it is removed with the last of them", async () => {
  const first = await render(bar());
  const second = await render(<Glass side="editor" color={theme.elevation.bar} tint={GLASS_TINT.editor} style={box} testID="other" />);
  await phone.settle();
  expect(phone.listeners()).toBe(1);
  await first.unmount();
  expect(phone.listeners()).toBe(1);
  expect(phone.removed).toBe(0);
  await second.unmount();
  expect(phone.listeners()).toBe(0);
  expect(phone.removed).toBe(1);
});

test("a phone that cannot be asked at all: solid, never a crash", async () => {
  jest.spyOn(AccessibilityInfo, "isReduceTransparencyEnabled").mockImplementation(() => { throw new Error("no such method"); });
  await render(bar());
  await phone.settle();
  expect(flat("bar").backgroundColor).toBe(NAVY.bar);
});

test("glass is never under an opacity: a dimmed box is the solid colour for as long as it is dimmed, with its children kept", async () => {
  mounts.count = 0;
  const view = await render(bar());
  await phone.settle();
  expect(screen.getByTestId("bar-glass")).toBeTruthy();
  await view.rerender(bar({ style: [box, { opacity: 0.4 }], pointerEvents: "none" }));
  expect(screen.queryByTestId("bar-glass")).toBeNull();
  expect(flat("bar")).toEqual({ ...box, opacity: 0.4, backgroundColor: NAVY.bar });
  expect(screen.getByTestId("bar")).toHaveProp("pointerEvents", "none");
  await view.rerender(bar({ style: [box, { opacity: 1 }], pointerEvents: "auto" }));
  expect(screen.getByTestId("bar-glass")).toBeTruthy();
  expect(flat("bar").backgroundColor).toBeUndefined();
  expect(mounts.count).toBe(1);
});

test("on a screen the glass follows the app's appearance; in the editor it is dark whatever the phone wears", async () => {
  const LIGHT = theme.screens.light;
  await render(<ShownContext.Provider value="light">
    <Glass side="home" color={LIGHT.bar} tint={glassTint(LIGHT)} style={box} testID="cream" />
    <Glass side="editor" color={theme.elevation.bar} tint={GLASS_TINT.editor} style={box} testID="slate" />
  </ShownContext.Provider>);
  await phone.settle();
  expect(screen.getByTestId("cream-glass")).toHaveProp("colorScheme", "light");
  expect(screen.getByTestId("cream-glass")).toHaveProp("tintColor", GLASS_TINT.light);
  expect(screen.getByTestId("slate-glass")).toHaveProp("colorScheme", "dark");
  expect(screen.getByTestId("slate-glass")).toHaveProp("tintColor", GLASS_TINT.editor);
});

test("a secondary button ON glass gives up its own fill only while that surface really is glass", async () => {
  const button = () => StyleSheet.flatten(screen.getByRole("button", { name: "Quick Edit" }).props.style);
  const view = await render(<SecondaryButton glass="home" title="Quick Edit" onPress={() => {}} />);
  await phone.settle();
  const onGlass = button();
  expect(onGlass.backgroundColor).toBeUndefined();
  await phone.change(true);
  const solid = button();
  expect(solid).toEqual({ ...onGlass, backgroundColor: theme.screen.lifted });   // the same box
  await phone.change(false);
  GLASS.home = false;
  await view.rerender(<SecondaryButton glass="home" title="Quick Edit" onPress={() => {}} />);
  expect(button()).toEqual(solid);
  // Without the prop it is the grey fill, glass or not.
  GLASS.home = true;
  await view.rerender(<SecondaryButton title="Quick Edit" onPress={() => {}} />);
  expect(button()).toEqual(solid);
});

test.each([["an iOS from before Liquid Glass", false, true], ["a phone whose glass API is missing", true, false]])("switched on, on %s: the solid colour", (_name, liquid, api) => {
  jest.isolateModules(() => {
    mockPhone.liquid = liquid; mockPhone.api = api;
    const fresh = require("../systemGlass") as typeof import("../systemGlass");
    expect(fresh.isGlassAvailable()).toBe(false);
    mockPhone.liquid = true; mockPhone.api = true;
  });
});
