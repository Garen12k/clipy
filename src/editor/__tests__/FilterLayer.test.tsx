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
test("intensity scales every layer's opacity", async () => {
  const f = FILTERS.vintage.preview;
  await render(<FilterLayer filter="vintage" intensity={0.5} />);
  expect(screen.getByTestId("filter-tint")).toHaveStyle({ backgroundColor: f.tint, opacity: f.tintOpacity * 0.5 });
  expect(screen.getByTestId("filter-desaturate")).toHaveStyle({ opacity: 0.55 * (1 - f.saturation) * 0.5 });
  expect(screen.getByTestId("filter-brightness")).toHaveStyle({ opacity: Math.abs(f.brightness) * 0.5 });
});
test("intensity 1 is the same as leaving it out", async () => {
  await render(<FilterLayer filter="vintage" intensity={1} />);
  expect(screen.getByTestId("filter-tint")).toHaveStyle({ opacity: FILTERS.vintage.preview.tintOpacity });
});
test("intensity 0 renders nothing", async () => {
  await render(<FilterLayer filter="vintage" intensity={0} />);
  expect(screen.toJSON()).toBeNull();
});
test("renders nothing for none/null", async () => {
  await render(<FilterLayer filter={null} />);
  expect(screen.queryByTestId("filter-tint")).toBeNull();
});
