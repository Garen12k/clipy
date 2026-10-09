// The app on the "icons and light" build: the SF Symbols native module is there.
jest.mock("expo-modules-core", () => {
  const actual = jest.requireActual("expo-modules-core");
  return { ...actual, requireOptionalNativeModule: jest.fn((name: string) => (name === "SymbolModule" ? {} : null)) };
});
jest.mock("expo-symbols", () => {
  const { createElement } = require("react");
  const { View } = require("react-native");
  return { SymbolView: (p: { testID?: string }) => createElement(View, { ...p, testID: p.testID ?? "symbol" }) };
});
jest.mock("@expo/vector-icons", () => {
  const { createElement } = require("react");
  const { Text } = require("react-native");
  const Ionicons = (p: { name: string; size: number; color: string; testID?: string }) => createElement(Text, { testID: p.testID ?? "ionicon", style: { fontSize: p.size, color: p.color } }, p.name);
  Ionicons.glyphMap = {};
  return { Ionicons };
});
import { render, screen } from "@testing-library/react-native";
import { theme } from "@/src/theme/theme";
import { Icon, SYMBOL_SCALE } from "../Icon";
import { isSymbolsAvailable } from "../sfSymbols";

test("a mapped name is drawn as its SF Symbol in the colour given: regular, one colour, no effect, with the Ionicon as its fallback", async () => {
  expect(isSymbolsAvailable()).toBe(true);
  await render(<Icon name="share-outline" size={20} color={theme.colors.accent} />);
  const symbol = screen.getByTestId("symbol");
  expect(symbol).toHaveProp("name", "square.and.arrow.up");
  expect(symbol).toHaveProp("tintColor", theme.colors.accent);
  expect(symbol).toHaveProp("weight", "regular");
  expect(symbol).toHaveProp("scale", "medium");
  expect(symbol).toHaveProp("type", "monochrome");
  expect(symbol).toHaveProp("resizeMode", "scaleAspectFit");
  expect(symbol.props.animationSpec).toBeUndefined();          // no symbol effects: nothing moves beside the video
  expect(symbol.props.fallback.props).toMatchObject({ name: "share-outline", size: 20, color: theme.colors.accent });
  expect(screen.queryByTestId("ionicon")).toBeNull();
});

test("the symbol sits where the Ionicon sat: a square of `size`, the symbol centred in it at the kit's one scale", async () => {
  expect(SYMBOL_SCALE).toBe(0.8);
  await render(<Icon testID="it" name="trash-outline" size={24} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />);
  const box = screen.getByTestId("it", { includeHiddenElements: true });
  expect(box).toHaveStyle({ width: 24, height: 24, alignItems: "center", justifyContent: "center" });
  expect(box).toHaveProp("accessibilityElementsHidden", true);
  expect(box).toHaveProp("importantForAccessibility", "no-hide-descendants");
  const symbol = screen.getByTestId("symbol", { includeHiddenElements: true });
  expect(symbol).toHaveProp("name", "trash");
  expect(symbol).toHaveProp("size", 24 * SYMBOL_SCALE);
  expect(symbol).toHaveProp("tintColor", theme.colors.text);   // the default colour
});

test("a state that swaps an outline name for a filled one swaps the symbol too", async () => {
  await render(<><Icon testID="off" name="diamond-outline" /><Icon testID="on" name="diamond" /></>);
  expect(screen.getAllByTestId("symbol").map((s) => s.props.name)).toEqual(["diamond", "diamond.fill"]);
});

test("`plain` is always the text glyph, even for a mapped name with the module there", async () => {
  await render(<Icon plain testID="glyph" name="trash-outline" size={14} color={theme.colors.onKind} />);
  expect(screen.getByTestId("glyph")).toHaveTextContent("trash-outline");
  expect(screen.getByTestId("glyph")).toHaveStyle({ fontSize: 14, color: theme.colors.onKind });
  expect(screen.queryByTestId("symbol")).toBeNull();
});

test("a name with no SF Symbol in the table (a brand mark) is the Ionicon, even with the module there", async () => {
  await render(<Icon name="logo-youtube" />);
  expect(screen.getByTestId("ionicon")).toHaveTextContent("logo-youtube");
  expect(screen.queryByTestId("symbol")).toBeNull();
});

test("the kit parts draw through Icon: a tool, a tile, the Done tick and a button are symbols; a `plain` button is the text glyph", async () => {
  const { DoneButton } = require("../DoneButton") as typeof import("../DoneButton");
  const { IconButton } = require("../IconButton") as typeof import("../IconButton");
  const { Tile } = require("../Tile") as typeof import("../Tile");
  const { ToolButton } = require("../ToolButton") as typeof import("../ToolButton");
  const noop = () => {};
  await render(
    <>
      <ToolButton variant="bar" label="Split" icon="cut-outline" onPress={noop} />
      <ToolButton label="Glow" icon="bulb-outline" active onPress={noop} />
      <Tile label="None" icon="ban-outline" selected onPress={noop} />
      <DoneButton onPress={noop} />
      <IconButton name="close-outline" accessibilityLabel="Close" onPress={noop} />
      <IconButton plain name="play-outline" accessibilityLabel="Play" color={theme.colors.accent} onPress={noop} />
    </>,
  );
  const symbols = screen.getAllByTestId("symbol");
  expect(symbols.map((s) => [s.props.name, s.props.tintColor, s.props.size])).toEqual([
    ["scissors", theme.colors.text, theme.size.icon.lg * SYMBOL_SCALE],
    ["lightbulb", theme.colors.accent, theme.size.icon.md * SYMBOL_SCALE],
    ["nosign", theme.colors.accent, theme.size.icon.md * SYMBOL_SCALE],
    ["checkmark", theme.colors.text, theme.size.icon.md * SYMBOL_SCALE],
    ["xmark", theme.colors.text, theme.size.icon.lg * SYMBOL_SCALE],
  ]);
  expect(screen.getByTestId("done-check")).toHaveStyle({ width: theme.size.icon.md, height: theme.size.icon.md });
  expect(screen.getByTestId("ionicon")).toHaveTextContent("play-outline");
  expect(screen.getByTestId("ionicon")).toHaveStyle({ fontSize: theme.size.icon.lg, color: theme.colors.accent });
});
