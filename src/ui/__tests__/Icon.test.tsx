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
import { readFileSync } from "fs";
import { join } from "path";
import { theme } from "@/src/theme/theme";
import { Icon } from "../Icon";
import { isSymbolsAvailable, SF_SYMBOLS } from "../sfSymbols";

test("a mapped name is drawn as its SF Symbol, same size and colour, with the Ionicon as its fallback", async () => {
  expect(isSymbolsAvailable()).toBe(true);
  await render(<Icon name="share-outline" size={20} color={theme.colors.accent} />);
  const symbol = screen.getByTestId("symbol");
  expect(symbol).toHaveProp("name", "square.and.arrow.up");
  expect(symbol).toHaveProp("size", 20);
  expect(symbol).toHaveProp("tintColor", theme.colors.accent);
  expect(symbol.props.fallback.props).toMatchObject({ name: "share-outline", size: 20, color: theme.colors.accent });
  expect(screen.queryByTestId("ionicon")).toBeNull();
});

test("a name with no SF Symbol in the table is the Ionicon, even with the module there", async () => {
  await render(<Icon name="trash-outline" />);
  expect(screen.getByTestId("ionicon")).toHaveTextContent("trash-outline");
  expect(screen.queryByTestId("symbol")).toBeNull();
});

test("the table is the ten common icons, by the names the app already uses", () => {
  expect(SF_SYMBOLS).toEqual({
    "chevron-back-outline": "chevron.backward", "close-outline": "xmark", "checkmark-outline": "checkmark", "checkmark": "checkmark",
    "add-outline": "plus", "add": "plus", "ellipsis-horizontal-outline": "ellipsis", "share-outline": "square.and.arrow.up",
    "arrow-undo-outline": "arrow.uturn.backward", "arrow-redo-outline": "arrow.uturn.forward", "play": "play.fill", "pause": "pause.fill",
  });
});

test("every symbol in the table is a real SF Symbol name (the list expo-symbols is typed with)", () => {
  const list = readFileSync(join(__dirname, "../../../node_modules/sf-symbols-typescript/dist/index.d.ts"), "utf8");
  for (const symbol of new Set(Object.values(SF_SYMBOLS))) expect(list.includes(`"${symbol}"`) || list.includes(`'${symbol}'`)).toBe(true);
});
