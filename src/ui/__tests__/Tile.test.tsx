import { fireEvent, render, screen } from "@testing-library/react-native";
import { View } from "react-native";
import { theme } from "@/src/theme/theme";
import { Tile, TILE_WIDTH } from "../Tile";
import { ToneContext } from "../tone";

test("a 72-pt column with a 44-pt box; unselected is calm; picked is the 2-pt gold ring on the soft tint with a WHITE semibold label", async () => {
  const onPress = jest.fn();
  await render(<><Tile label="Rounded" selected={false} onPress={onPress} icon="ellipse-outline" boxTestID="box-a" /><Tile label="Circle" selected onPress={onPress} boxTestID="box-b"><View testID="shape" /></Tile></>);
  expect(TILE_WIDTH).toBe(theme.size.toolColumn);
  const a = screen.getByRole("button", { name: "Rounded" }), b = screen.getByRole("button", { name: "Circle" });
  expect(a).toHaveStyle({ width: TILE_WIDTH });
  expect(a).not.toBeSelected();
  expect(b).toBeSelected();
  expect(screen.getByTestId("box-a")).toHaveStyle({ width: theme.size.toolBox, height: theme.size.toolBox, borderRadius: theme.radius.box, backgroundColor: theme.screen.tile, ...theme.ringClear });
  expect(screen.getByTestId("box-b")).toHaveStyle({ backgroundColor: theme.screen.picked, borderWidth: 2, borderColor: theme.colors.accent });
  expect(screen.getByText("Rounded")).toHaveStyle({ color: theme.colors.text, fontWeight: theme.weight.regular, fontSize: theme.type.small });
  // Not colour alone: the ring, the tint and the weight say it; the label itself stays white.
  expect(screen.getByText("Circle")).toHaveStyle({ color: theme.colors.text, fontWeight: theme.weight.semi, fontSize: theme.type.small });
  expect(b.props.accessibilityState).toMatchObject({ selected: true });
  expect(a.props.accessibilityState).toMatchObject({ selected: false });
  expect(screen.getByTestId("shape")).toBeTruthy();
  await fireEvent.press(a);
  expect(onPress).toHaveBeenCalledTimes(1);
});

test("the optional second line, hint, spoken label and fill: a muted micro line under the label, and none of it without the props", async () => {
  await render(<><Tile label="Plain" selected={false} onPress={() => {}} icon="ellipse-outline" />
    <Tile label="Social" selected onPress={() => {}} icon="ellipse-outline" note="1080p · 30 · High" hint="For TikTok" accessibilityLabel="Social, 1080p, 30 fps, High" fill /></>);
  const plain = screen.getByRole("button", { name: "Plain" }), rich = screen.getByRole("button", { name: "Social, 1080p, 30 fps, High" });
  expect(plain).toHaveStyle({ width: TILE_WIDTH });
  expect(plain.props.accessibilityHint).toBeUndefined();
  expect(plain).not.toHaveStyle({ flex: 1 });
  expect(rich).toHaveStyle({ flex: 1 });
  expect(rich).not.toHaveStyle({ width: TILE_WIDTH });
  expect(rich.props.accessibilityHint).toBe("For TikTok");
  expect(rich).toBeSelected();
  expect(screen.getByText("1080p · 30 · High")).toHaveStyle({ fontSize: theme.type.micro, color: theme.screen.muted, textAlign: "center" });
  expect(screen.getByText("1080p · 30 · High")).toHaveProp("numberOfLines", 2);
  expect(screen.getByText("Social")).toHaveStyle({ color: theme.colors.text, fontWeight: theme.weight.semi });
});

test("in the editor the picked tile wears the slate family's tint; its glyph keeps the gold, the unpicked one's is white", async () => {
  await render(<ToneContext.Provider value="editor"><Tile label="None" selected onPress={() => {}} icon="ban-outline" boxTestID="on" /><Tile label="Deep" selected={false} onPress={() => {}} icon="mic-outline" boxTestID="off" /></ToneContext.Provider>);
  expect(screen.getByTestId("on")).toHaveStyle({ backgroundColor: theme.elevation.picked, ...theme.ring });
  expect(screen.getByTestId("off")).toHaveStyle({ backgroundColor: theme.elevation.tile, ...theme.ringClear });
  expect(screen.getByText("None")).toHaveStyle({ color: theme.colors.text, fontWeight: theme.weight.semi });
  expect(screen.getByText("Deep")).toHaveStyle({ color: theme.colors.text, fontWeight: theme.weight.regular });
});
