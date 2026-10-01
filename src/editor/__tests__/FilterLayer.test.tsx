import { render, screen } from "@testing-library/react-native";
import { FilterLayer } from "../components/FilterLayer";
import { FILTERS } from "@/src/editor/effects";

test("renders tint, desaturation and brightness layers from the registry", async () => {
  await render(<FilterLayer filter="vintage" />);
  const tint = screen.getByTestId("filter-tint");
  expect(tint).toHaveStyle({ backgroundColor: FILTERS.vintage.preview.tint, opacity: FILTERS.vintage.preview.tintOpacity });
  expect(screen.getByTestId("filter-desaturate")).toHaveStyle({ opacity: 1 - FILTERS.vintage.preview.saturation });
  expect(screen.getByTestId("filter-brightness")).toHaveStyle({ backgroundColor: "#000000", opacity: 0.03 });
});
test("renders nothing for none/null", async () => {
  await render(<FilterLayer filter={null} />);
  expect(screen.queryByTestId("filter-tint")).toBeNull();
});
