import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { theme } from "@/src/theme/theme";
import { Chip } from "../Chip";
import { BAR_HEIGHT, STRIP, StripNote, StripSlider, StripTiles, ToolStrip, tilesStartX, tilesStartXIn, useStripPresence } from "../ToolStrip";

test("the height budget: bar 90, strip 154 = 1 + 44 + 72 + 36 + 1, lifted by the difference", () => {
  expect(BAR_HEIGHT).toBe(90);
  expect(STRIP).toEqual({ header: 44, tiles: 72, slider: 36, height: 154, lift: 64 });
  expect(STRIP.height).toBe(1 + STRIP.header + STRIP.tiles + STRIP.slider + 1);
  expect(STRIP.lift).toBe(STRIP.height - BAR_HEIGHT);
});

test("renders inline with an explicit height: a header title, the note, the content — and no scrim", async () => {
  await render(<ToolStrip visible onClose={() => {}} title="Opacity" note={<StripNote>Shows in the exported video</StripNote>}><Text>body</Text></ToolStrip>);
  expect(screen.getByTestId("tool-strip")).toHaveStyle({ height: STRIP.height - 2 });
  expect(screen.getByRole("header", { name: "Opacity" })).toBeTruthy();
  expect(screen.getByText("Shows in the exported video")).toBeTruthy();
  expect(screen.getByText("body")).toBeTruthy();
  expect(screen.queryByLabelText("Close sheet")).toBeNull();        // the modal Sheet's scrim
});

test("Done closes; the action runs", async () => {
  const onClose = jest.fn(), onAction = jest.fn();
  await render(<ToolStrip visible onClose={onClose} title="Filter" action={{ label: "Apply to all", onPress: onAction }}><Text>body</Text></ToolStrip>);
  await fireEvent.press(screen.getByRole("button", { name: "Apply to all" }));
  expect(onAction).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByRole("button", { name: "Done" }));
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("the header is 44 pt: the ringed ✓ and the quiet action both have a 44-pt target inside it", async () => {
  await render(<ToolStrip visible onClose={() => {}} title="Filter" action={{ label: "Apply to all", onPress: () => {} }}><Text>body</Text></ToolStrip>);
  expect(screen.getByTestId("tool-strip-header")).toHaveStyle({ height: theme.size.touch, paddingHorizontal: theme.space.gutter });
  const done = screen.getByRole("button", { name: "Done" });
  expect(done).toHaveStyle({ width: theme.size.done, height: theme.size.done, backgroundColor: theme.elevation.tile, borderColor: theme.colors.accent });
  expect(theme.size.done + 2 * (done.props.hitSlop as number)).toBe(STRIP.header);            // reaches 44 and stays inside the header
  const action = screen.getByRole("button", { name: "Apply to all" });
  const slop = action.props.hitSlop as { top: number; bottom: number };
  expect(action).toHaveStyle({ height: theme.size.controlCompact });
  expect(theme.size.controlCompact + slop.top + slop.bottom).toBe(STRIP.header);
  expect(screen.getByTestId("tool-strip")).toHaveStyle({ backgroundColor: theme.elevation.bar });
});

test("StripSlider: the name and the value are one text; the value has tabular digits; an empty name shows the value alone", async () => {
  await render(<><StripSlider label="Opacity" value="40 %"><Text>a</Text></StripSlider><StripSlider label="" value="80%" labelWidth={48}><Text>b</Text></StripSlider></>);
  expect(screen.getByText("Opacity 40 %")).toHaveStyle({ fontSize: theme.type.small });
  expect(screen.getByText("40 %")).toHaveStyle({ color: theme.colors.text, fontWeight: theme.weight.semi, fontVariant: ["tabular-nums"] });
  expect(screen.getAllByText("80%").length).toBeGreaterThanOrEqual(1);           // the outer text and, inside it, the value
});

test("hidden: renders nothing and is not counted; visible: counted while mounted", async () => {
  const view = await render(<ToolStrip visible={false} onClose={() => {}} title="Filter"><Text>body</Text></ToolStrip>);
  expect(screen.queryByText("body")).toBeNull();
  expect(useStripPresence.getState().count).toBe(0);
  await view.rerender(<ToolStrip visible onClose={() => {}} title="Filter"><Text>body</Text></ToolStrip>);
  expect(useStripPresence.getState().count).toBe(1);
  await view.rerender(<ToolStrip visible={false} onClose={() => {}} title="Filter"><Text>body</Text></ToolStrip>);
  expect(useStripPresence.getState().count).toBe(0);
  await view.rerender(<ToolStrip visible onClose={() => {}} title="Filter"><Text>body</Text></ToolStrip>);
  await view.unmount();
  expect(useStripPresence.getState().count).toBe(0);
});

test("rows have explicit heights; the slider row shows its label and trailing", async () => {
  await render(
    <ToolStrip visible onClose={() => {}} title="Adjust">
      <StripTiles lead={<Text>tabs</Text>}><Text>tile</Text></StripTiles>
      <StripSlider label="Brightness +35" trailing={<Text>reset</Text>}><Text>slider</Text></StripSlider>
    </ToolStrip>,
  );
  expect(screen.getByTestId("strip-tiles")).toHaveStyle({ height: STRIP.tiles });
  expect(screen.getByTestId("strip-slider")).toHaveStyle({ height: STRIP.slider });
  for (const t of ["tabs", "tile", "Brightness +35", "slider", "reset"]) expect(screen.getByText(t)).toBeTruthy();
});

test("tilesStartXIn: the selected tile in view, but never past the row's end", () => {
  // 32 tiles of 52 with gaps of 8 and a 16 gutter each side: 32·52 + 31·8 + 32 = 1944 wide. In a 375 window the last start is 1569.
  expect(tilesStartXIn(0, 52, 32, 375)).toBe(0);
  expect(tilesStartXIn(5, 52, 32, 375)).toBe(tilesStartX(5, 52));         // 5·60 − 52 = 248: unchanged
  expect(tilesStartXIn(20, 52, 32, 375)).toBe(1148);                       // 20·60 − 52
  expect(tilesStartXIn(31, 52, 32, 375)).toBe(1569);                       // 31·60 − 52 = 1808 → clamped to 1944 − 375
  // A row that fits the window never scrolls: 3·72 + 2·8 + 32 = 264 < 375.
  expect(tilesStartXIn(2, 72, 3, 375)).toBe(0);
});

test("the lead of a tiles row is as high as the row, so a compact tab chip's slop is inside it: a real 44-pt target", async () => {
  await render(<StripTiles lead={<Chip compact label="In" selected onPress={() => {}} />}><Text>tile</Text></StripTiles>);
  expect(screen.getByTestId("strip-lead")).toHaveStyle({ height: STRIP.tiles, alignItems: "center" });
  const chip = screen.getByRole("button", { name: "In" });
  const slop = chip.props.hitSlop as { top: number; bottom: number };
  expect(theme.size.chipCompact + slop.top + slop.bottom).toBeGreaterThanOrEqual(theme.size.touch);
  expect(theme.size.chipCompact + slop.top + slop.bottom).toBeLessThanOrEqual(STRIP.tiles);
});
