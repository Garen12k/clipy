import { render, screen } from "@testing-library/react-native";
import { Compass } from "../Compass";

test("Compass renders a ring and a two-part needle", async () => {
  await render(<Compass size={64} />);
  expect(screen.getByLabelText("Clipy compass")).toBeTruthy();
  expect(screen.getByTestId("compass-ring")).toBeTruthy();
  expect(screen.getAllByTestId("compass-needle")).toHaveLength(2);
});
