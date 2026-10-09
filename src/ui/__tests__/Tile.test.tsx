import { fireEvent, render, screen } from "@testing-library/react-native";
import { View } from "react-native";
import { theme } from "@/src/theme/theme";
import { Tile, TILE_WIDTH } from "../Tile";

test("a 72-pt column with a 44-pt box; unselected is calm, selected is ringed, lighter and gold", async () => {
  const onPress = jest.fn();
  await render(<><Tile label="Rounded" selected={false} onPress={onPress} icon="ellipse-outline" boxTestID="box-a" /><Tile label="Circle" selected onPress={onPress} boxTestID="box-b"><View testID="shape" /></Tile></>);
  expect(TILE_WIDTH).toBe(theme.size.toolColumn);
  const a = screen.getByRole("button", { name: "Rounded" }), b = screen.getByRole("button", { name: "Circle" });
  expect(a).toHaveStyle({ width: TILE_WIDTH });
  expect(a).not.toBeSelected();
  expect(b).toBeSelected();
  expect(screen.getByTestId("box-a")).toHaveStyle({ width: theme.size.toolBox, height: theme.size.toolBox, borderRadius: theme.radius.box, backgroundColor: theme.screen.tile, ...theme.ringClear });
  expect(screen.getByTestId("box-b")).toHaveStyle({ backgroundColor: theme.screen.lifted, ...theme.ring });
  expect(screen.getByText("Rounded")).toHaveStyle({ color: theme.colors.text, fontSize: theme.type.small });
  expect(screen.getByText("Circle")).toHaveStyle({ color: theme.colors.accent, fontWeight: theme.weight.semi, fontSize: theme.type.small });
  expect(screen.getByTestId("shape")).toBeTruthy();
  await fireEvent.press(a);
  expect(onPress).toHaveBeenCalledTimes(1);
});
