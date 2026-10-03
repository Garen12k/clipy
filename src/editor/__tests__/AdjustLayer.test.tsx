import { render, screen } from "@testing-library/react-native";
import { VIGNETTE_PREVIEW } from "@/src/editor/model/adjust";
import { DEFAULT_ADJUST, type ClipAdjust } from "@/src/editor/model/types";
import { AdjustLayer } from "../components/AdjustLayer";

const adj = (over: Partial<ClipAdjust>): ClipAdjust => ({ ...DEFAULT_ADJUST, ...over });

test("renders nothing for a neutral adjust", async () => {
  await render(<AdjustLayer adjust={adj({})} />);
  expect(screen.toJSON()).toBeNull();
});

test("values the preview cannot show render nothing", async () => {
  await render(<AdjustLayer adjust={adj({ contrast: 1, saturation: 1, sharpen: 1, grain: 1, highlights: 1, shadows: -1 })} />);
  expect(screen.toJSON()).toBeNull();
});

test("brightness renders a white layer, darkening a black one capped at 0.5", async () => {
  const { unmount } = await render(<AdjustLayer adjust={adj({ brightness: 1 })} />);
  expect(screen.getByTestId("adjust-light")).toHaveStyle({ backgroundColor: "#FFFFFF", opacity: 0.25, position: "absolute" });
  await unmount();
  await render(<AdjustLayer adjust={adj({ brightness: -1, exposure: -1 })} />);
  expect(screen.getByTestId("adjust-light")).toHaveStyle({ backgroundColor: "#000000", opacity: 0.5 });
});

test("temperature, tint, negative saturation and fade each render their layer, in order, without touches", async () => {
  await render(<AdjustLayer adjust={adj({ temperature: 1, tint: -1, saturation: -1, fade: 1 })} />);
  expect(screen.getByTestId("adjust-temperature")).toHaveStyle({ backgroundColor: "#FF9A3C", opacity: 0.25 });
  expect(screen.getByTestId("adjust-tint")).toHaveStyle({ backgroundColor: "#4FFF7A", opacity: 0.18 });
  expect(screen.getByTestId("adjust-saturation")).toHaveStyle({ backgroundColor: "#808080", opacity: 0.55 });
  expect(screen.getByTestId("adjust-fade")).toHaveStyle({ backgroundColor: "#9A9A9A", opacity: 0.25 });
  expect(screen.queryByTestId("adjust-light")).toBeNull();
  expect(screen.queryByTestId("adjust-vignette")).toBeNull();
  const root = screen.getByTestId("adjust-layer");
  expect(root.props.pointerEvents).toBe("none");
  expect(root.children.map((c) => (typeof c === "string" ? c : c.props.testID))).toEqual(["adjust-temperature", "adjust-tint", "adjust-saturation", "adjust-fade"]);
});

test("vignette renders four black-to-transparent edge strips with the overall opacity", async () => {
  await render(<AdjustLayer adjust={adj({ vignette: 0.5 })} />);
  expect(screen.getByTestId("adjust-vignette")).toHaveStyle({ opacity: 0.3 });
  const size = VIGNETTE_PREVIEW.strip;
  const strip = (edge: string) => screen.getByTestId(`adjust-vignette-${edge}`);
  for (const edge of ["top", "bottom", "left", "right"]) expect(strip(edge).props.colors).toEqual(VIGNETTE_PREVIEW.colors);
  expect(strip("top")).toHaveStyle({ position: "absolute", left: 0, right: 0, top: 0, height: size });
  expect(strip("bottom")).toHaveStyle({ left: 0, right: 0, bottom: 0, height: size });
  expect(strip("left")).toHaveStyle({ top: 0, bottom: 0, left: 0, width: size });
  expect(strip("right")).toHaveStyle({ top: 0, bottom: 0, right: 0, width: size });
  // Each gradient starts black at its own edge and fades towards the middle of the frame.
  expect([strip("top").props.start, strip("top").props.end]).toEqual([{ x: 0.5, y: 0 }, { x: 0.5, y: 1 }]);
  expect([strip("bottom").props.start, strip("bottom").props.end]).toEqual([{ x: 0.5, y: 1 }, { x: 0.5, y: 0 }]);
  expect([strip("left").props.start, strip("left").props.end]).toEqual([{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }]);
  expect([strip("right").props.start, strip("right").props.end]).toEqual([{ x: 1, y: 0.5 }, { x: 0, y: 0.5 }]);
});
