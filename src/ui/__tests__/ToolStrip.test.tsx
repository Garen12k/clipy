import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { BAR_HEIGHT, STRIP, StripNote, StripSlider, StripTiles, ToolStrip, useStripPresence } from "../ToolStrip";

test("the height budget: bar 86, strip 150 = 1 + 36 + 76 + 36 + 1, lifted by two lanes", () => {
  expect(BAR_HEIGHT).toBe(86);
  expect(STRIP).toEqual({ header: 36, tiles: 76, slider: 36, height: 150, lift: 64 });
  expect(STRIP.height).toBe(1 + STRIP.header + STRIP.tiles + STRIP.slider + 1);
  expect(STRIP.lift).toBe(STRIP.height - BAR_HEIGHT);
});

test("renders inline with an explicit height: a header title, the note, the content — and no scrim", async () => {
  await render(<ToolStrip visible onClose={() => {}} title="Opacity" note={<StripNote>Shows in the exported video</StripNote>}><Text>body</Text></ToolStrip>);
  expect(screen.getByTestId("tool-strip")).toHaveStyle({ height: 148 });
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
  expect(screen.getByTestId("strip-tiles")).toHaveStyle({ height: 76 });
  expect(screen.getByTestId("strip-slider")).toHaveStyle({ height: 36 });
  for (const t of ["tabs", "tile", "Brightness +35", "slider", "reset"]) expect(screen.getByText(t)).toBeTruthy();
});
