import { render, screen } from "@testing-library/react-native";
import { FilterLayer } from "../components/FilterLayer";
import { StyleSheet } from "react-native";
import { FILTERS } from "@/src/editor/effects";
import { FILTER_IDS } from "@/src/editor/model/types";

test("renders tint, desaturation and brightness layers from the registry", async () => {
  await render(<FilterLayer filter="vintage" />);
  const tint = screen.getByTestId("filter-tint");
  expect(tint).toHaveStyle({ backgroundColor: FILTERS.vintage.preview.tint, opacity: FILTERS.vintage.preview.tintOpacity });
  expect(screen.getByTestId("filter-desaturate")).toHaveStyle({ opacity: 0.55 * (1 - FILTERS.vintage.preview.saturation) });
  expect(screen.getByTestId("filter-brightness")).toHaveStyle({ backgroundColor: "#000000", opacity: 0.03 });
});
test("the grey desaturation layer never hides the video (opacity < 1 for every filter)", async () => {
  for (const id of FILTER_IDS) {
    if (id === "none") continue;
    const { unmount } = await render(<FilterLayer filter={id} />);
    const opacity = StyleSheet.flatten(screen.getByTestId("filter-desaturate").props.style).opacity as number;
    expect(opacity).toBeGreaterThanOrEqual(0);
    expect(opacity).toBeLessThan(1);
    expect(opacity).toBeLessThanOrEqual(0.55);
    await unmount();
  }
});
test("renders nothing for none/null", async () => {
  await render(<FilterLayer filter={null} />);
  expect(screen.queryByTestId("filter-tint")).toBeNull();
});
