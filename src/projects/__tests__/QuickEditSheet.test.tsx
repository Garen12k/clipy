import { fireEvent, render, screen } from "@testing-library/react-native";

// The real tile, with every render written down: a selection that is shown for one frame is a render too.
jest.mock("@/src/ui/Tile", () => {
  const React = require("react");
  const actual = jest.requireActual("@/src/ui/Tile");
  const g = globalThis as unknown as { __tiles: { label: string; selected: boolean }[] };
  g.__tiles = [];
  return { Tile: (props: { label: string; selected: boolean }) => { g.__tiles.push({ label: props.label, selected: props.selected }); return React.createElement(actual.Tile, props); } };
});

import { QuickEditSheet } from "../QuickEditSheet";

const TILES = (globalThis as unknown as { __tiles: { label: string; selected: boolean }[] }).__tiles;
const selectedNow = () => screen.getAllByRole("button").filter((b) => b.props.accessibilityState?.selected).map((b) => b.props.accessibilityLabel);

test("reopening starts from Travel at once: the style picked last time is never drawn selected, not even for one frame", async () => {
  const sheet = (visible: boolean) => <QuickEditSheet visible={visible} onClose={() => {}} onChoose={() => {}} />;
  const view = await render(sheet(true));
  await fireEvent.press(screen.getByRole("button", { name: "Retro" }));
  expect(selectedNow()).toEqual(["Retro"]);
  await view.rerender(sheet(false));
  TILES.length = 0;
  await view.rerender(sheet(true));
  expect(selectedNow()).toEqual(["Travel"]);
  expect(TILES.length).toBeGreaterThan(0);
  expect(TILES.filter((t) => t.selected).map((t) => t.label).filter((l) => l !== "Travel")).toEqual([]);
});

test("the style chosen is the one handed on", async () => {
  const onChoose = jest.fn();
  await render(<QuickEditSheet visible onClose={() => {}} onChoose={onChoose} />);
  await fireEvent.press(screen.getByRole("button", { name: "Calm" }));
  await fireEvent.press(screen.getByRole("button", { name: "Choose photos and videos" }));
  expect(onChoose).toHaveBeenCalledWith("calm");
});
