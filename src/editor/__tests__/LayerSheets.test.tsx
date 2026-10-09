import { fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/editor/components/thumbnails", () => ({ getThumb: jest.fn(async () => "file:///thumb.jpg") }));
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { getThumb } from "@/src/editor/components/thumbnails";
import { ANIM_IN, SPEED_CURVES } from "@/src/editor/effects";
import { setClipSpeedCurve } from "@/src/editor/model/ops";
import { clipDuration } from "@/src/editor/model/timeline";
import { maskRadius } from "@/src/editor/model/clipLayout";
import { FULL_CROP, makeClip, makeLayer, makePhotoClip, makeProject, type LayerClip, type Project } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { useToast } from "@/src/ui/Toast";
import { AdjustSheet } from "../components/AdjustSheet";
import { ClipAnimationSheet } from "../components/ClipAnimationSheet";
import { CropScreen } from "../components/CropScreen";
import { FilterSheet } from "../components/FilterSheet";
import { MaskSheet } from "../components/MaskSheet";
import { OpacitySheet } from "../components/OpacitySheet";
import { SpeedSheet } from "../components/SpeedSheet";
import { TransformSheet } from "../components/TransformSheet";
import { TrimSheet } from "../components/TrimSheet";
import { VolumeSheet } from "../components/VolumeSheet";

const state = () => useEditorStore.getState();
const layerNow = (id = "L") => state().project!.layers.find((l) => l.id === id)!;
const layer = (idOrProject: string | Project = "L", id = "L") =>
  typeof idOrProject === "string" ? layerNow(idOrProject) : idOrProject.layers.find((l) => l.id === id)!;
const main = () => state().project!.clips[0];
const past = () => state().past.length;
const drag = async (testID: string, ...values: number[]) => {
  const slider = screen.getByTestId(testID);
  await fireEvent(slider, "slidingStart");
  for (const v of values) await fireEvent(slider, "valueChange", v);
};
const photoLayer = (id: string, start = 0): LayerClip => ({ ...makePhotoClip({ id }), start });
/** L plays 0–2 s (of a 4 s source); X and Y both play 2–4 s: L may not grow past 2 s. */
const crowded = () => state().setProject(makeProject({
  clips: [makeClip({ id: "a", sourceDuration: 8 })],
  layers: [makeLayer({ id: "L", sourceDuration: 4, trimEnd: 2 }), makeLayer({ id: "X", sourceDuration: 2, start: 2 }), makeLayer({ id: "Y", sourceDuration: 2, start: 2 })],
}));

beforeEach(() => {
  jest.clearAllMocks();
  useToast.getState().clear();
  state().reset();
  state().setProject(makeProject({
    clips: [makeClip({ id: "a", sourceDuration: 8 })],
    layers: [makeLayer({ id: "L", sourceDuration: 4, start: 1, crop: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 } }), photoLayer("P")],
  }));
});

test('"Apply to all" is a main-clip action: hidden when the sheet\'s item is a layer', async () => {
  const sheets: [string, (id: string) => React.JSX.Element][] = [
    ["Apply to All Clips", (id) => <FilterSheet clipId={id} visible onClose={() => {}} />],
    ["Apply to All", (id) => <AdjustSheet clipId={id} visible onClose={() => {}} />],
    ["Apply to All Clips", (id) => <ClipAnimationSheet clipId={id} visible onClose={() => {}} />],
  ];
  for (const [name, sheet] of sheets) {
    const onLayer = await render(sheet("L"));
    expect(screen.queryByRole("button", { name })).toBeNull();
    await onLayer.unmount();
    const onPhotoLayer = await render(sheet("P"));
    expect(screen.queryByRole("button", { name })).toBeNull();
    await onPhotoLayer.unmount();
    const onClip = await render(sheet("a"));
    expect(screen.getByRole("button", { name })).toBeTruthy();
    await onClip.unmount();
  }
});

test("Filter: a tile and the strength slider write to the layer", async () => {
  await render(<FilterSheet clipId="L" visible onClose={() => {}} />);
  await fireEvent.press(screen.getByRole("button", { name: "Vivid" }));
  expect(layer().filter).toBe("vivid");
  expect(main().filter).toBeNull();
  await drag("filter-strength", 0.4);
  expect(layer().filterIntensity).toBe(0.4);
  expect(past()).toBe(2);
});

test("Adjust: the slider writes to the layer in one undo step", async () => {
  await render(<AdjustSheet clipId="L" visible onClose={() => {}} />);
  await drag("adjust-slider", 0.2, 0.5);
  expect(layer().adjust.brightness).toBe(0.5);
  expect(main().adjust.brightness).toBe(0);
  expect(past()).toBe(1);
});

test("Transform: the buttons act on the layer", async () => {
  await render(<TransformSheet clipId="L" visible onClose={() => {}} />);
  await fireEvent.press(screen.getByRole("button", { name: "Flip horizontal" }));
  expect(layer().transform.flipH).toBe(true);
  expect(main().transform.flipH).toBe(false);
  expect(past()).toBe(1);
});

test("Transform: Fill on a keyframed layer writes the pin at the playhead's offset inside the layer", async () => {
  state().setProject(makeProject({
    clips: [makeClip({ id: "a", sourceDuration: 8 })],
    layers: [makeLayer({ id: "L", sourceDuration: 4, start: 1, keyframes: [{ t: 0, x: 0, y: 0, scale: 0.4, rotation: 0, opacity: 1 }] })],
  }));
  state().seek(3);
  await render(<TransformSheet clipId="L" visible onClose={() => {}} />);
  await fireEvent.press(screen.getByRole("button", { name: "Fill" }));
  expect(layer().keyframes.map((k) => k.t)).toEqual([0, 2]);
});

test("Crop: opens on the layer (still taken at the playhead inside it) and Done writes its crop", async () => {
  state().seek(2.5);
  const onClose = jest.fn();
  await render(<CropScreen clipId="L" visible onClose={onClose} />);
  expect(getThumb).toHaveBeenCalledWith(layer().sourceUri, 1.5);
  await fireEvent.press(screen.getByRole("button", { name: "Reset" }));
  await fireEvent.press(screen.getByRole("button", { name: "Done" }));
  expect(layer().crop).toEqual(FULL_CROP);
  expect(past()).toBe(1);
  expect(onClose).toHaveBeenCalled();
});

test("Animation: an In tile is set on the layer", async () => {
  await render(<ClipAnimationSheet clipId="L" visible onClose={() => {}} />);
  await fireEvent.press(screen.getByRole("button", { name: ANIM_IN.fade.label }));
  expect(layer().animation.in?.id).toBe("fade");
  expect(main().animation.in).toBeNull();
});

test("Speed: a preset changes the layer's speed", async () => {
  await render(<SpeedSheet clipId="L" visible onClose={() => {}} />);
  await fireEvent.press(screen.getByRole("button", { name: "2×" }));
  expect(layer().speed).toBe(2);
  expect(main().speed).toBe(1);
  expect(useToast.getState().message).toBeNull();
});

test("Speed: a change the layer rules refuse closes the sheet and says so", async () => {
  crowded();
  const onClose = jest.fn();
  await render(<SpeedSheet clipId="L" visible onClose={onClose} />);
  await fireEvent.press(screen.getByRole("button", { name: "0.5×" }));   // 2 s → 4 s: a third video at once
  expect(layer().speed).toBe(1);
  expect(past()).toBe(0);
  expect(onClose).toHaveBeenCalled();
  expect(useToast.getState().message).toBe("That speed doesn't fit this layer.");
});

test("Speed: re-picking the current speed is silent; a refused curve gets the layer message", async () => {
  crowded();
  const onClose = jest.fn();
  await render(<SpeedSheet clipId="L" visible onClose={onClose} />);
  await fireEvent.press(screen.getByRole("button", { name: "1×" }));
  expect(onClose).not.toHaveBeenCalled();
  expect(useToast.getState().message).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Curve" }));
  // Bullet in steps (Smooth off; a smooth Bullet is shorter and fits) over L's 2 s of source plays for about 2.1 s (its slow middle):
  // past 2 s it would be a third video at once.
  await fireEvent(screen.getByLabelText("Smooth"), "valueChange", false);
  expect(clipDuration(layer(setClipSpeedCurve(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 8 })], layers: [layerNow()] }), "L", "bullet"), "L"))).toBeGreaterThan(2);
  await fireEvent.press(screen.getByRole("button", { name: SPEED_CURVES.bullet.label }));
  expect(layerNow().speedCurve).toBeNull();
  expect(past()).toBe(0);
  expect(onClose).toHaveBeenCalled();
  expect(useToast.getState().message).toBe("That speed doesn't fit this layer.");
});

test("Volume: the slider and Mute write to the layer", async () => {
  await render(<VolumeSheet clipId="L" visible onClose={() => {}} />);
  await drag("volume-slider", 0.5);
  expect(layer().volume).toBe(0.5);
  expect(main().volume).toBe(1);
  await fireEvent(screen.getByLabelText("Mute"), "valueChange", true);
  expect(layer().muted).toBe(true);
});

describe("Trim on a layer", () => {
  test("shows the layer's range and applies through trimLayer, keeping its start", async () => {
    const onClose = jest.fn();
    await render(<TrimSheet clipId="L" visible onClose={onClose} />);
    expect(screen.getByLabelText("Trim end").props.value).toBe("4.0");
    await fireEvent.changeText(screen.getByLabelText("Trim start"), "1");
    await fireEvent.changeText(screen.getByLabelText("Trim end"), "3");
    await fireEvent.press(screen.getByRole("button", { name: "Apply" }));
    expect(layer()).toMatchObject({ trimStart: 1, trimEnd: 3, start: 1 });
    expect(past()).toBe(1);
    expect(onClose).toHaveBeenCalled();
    expect(useToast.getState().message).toBeNull();
  });

  test("a photo layer has the Length field", async () => {
    await render(<TrimSheet clipId="P" visible onClose={() => {}} />);
    await fireEvent.changeText(screen.getByLabelText("Length"), "7.5");
    await fireEvent.press(screen.getByRole("button", { name: "Apply" }));
    expect(layer("P").trimEnd).toBe(7.5);
    expect(past()).toBe(1);
  });

  test("a trim the layer rules refuse toasts and changes nothing", async () => {
    crowded();
    await render(<TrimSheet clipId="L" visible onClose={() => {}} />);
    await fireEvent.changeText(screen.getByLabelText("Trim end"), "4");   // 0–4 s would overlap X and Y
    await fireEvent.press(screen.getByRole("button", { name: "Apply" }));
    expect(layer().trimEnd).toBe(2);
    expect(past()).toBe(0);
    expect(useToast.getState().message).toBe("That trim doesn't fit — only two video layers can play at the same time.");
  });

  test("a trim refused for the layer itself (too short) gets its own message, not the overlap one", async () => {
    await render(<TrimSheet clipId="L" visible onClose={() => {}} />);
    await fireEvent.changeText(screen.getByLabelText("Trim start"), "3");
    await fireEvent.changeText(screen.getByLabelText("Trim end"), "3.1");   // 0.1 s: under the layer minimum
    await fireEvent.press(screen.getByRole("button", { name: "Apply" }));
    expect(layerNow()).toMatchObject({ trimStart: 0, trimEnd: 4 });
    expect(past()).toBe(0);
    expect(useToast.getState().message).toBe("That trim is too short or outside the clip.");
  });

  test("too short wins even where the layer is crowded", async () => {
    crowded();
    await render(<TrimSheet clipId="L" visible onClose={() => {}} />);
    await fireEvent.changeText(screen.getByLabelText("Trim start"), "5");
    await fireEvent.changeText(screen.getByLabelText("Trim end"), "9");     // outside the 4 s source
    await fireEvent.press(screen.getByRole("button", { name: "Apply" }));
    expect(past()).toBe(0);
    expect(useToast.getState().message).toBe("That trim is too short or outside the clip.");
  });

  test("applying the current values is silent", async () => {
    await render(<TrimSheet clipId="L" visible onClose={() => {}} />);
    await fireEvent.press(screen.getByRole("button", { name: "Apply" }));
    expect(past()).toBe(0);
    expect(useToast.getState().message).toBeNull();
  });
});

describe("OpacitySheet", () => {
  test("shows the percentage and writes one undo step per drag, on a layer", async () => {
    await render(<OpacitySheet clipId="L" visible onClose={() => {}} />);
    expect(screen.getByText("Opacity 100 %")).toBeTruthy();
    const slider = screen.getByTestId("opacity-slider");
    expect([slider.props.minimumValue, slider.props.maximumValue, slider.props.step]).toEqual([0, 1, 0.01]);
    await drag("opacity-slider", 0.9, 0.8);
    expect(layer().opacity).toBe(0.8);
    expect(past()).toBe(1);
    expect(screen.getByText("Opacity 80 %")).toBeTruthy();
    state().undo();
    expect(layer().opacity).toBe(1);
  });

  test("works on a main clip; renders nothing for an unknown id", async () => {
    const view = await render(<OpacitySheet clipId="a" visible onClose={() => {}} />);
    await drag("opacity-slider", 0.25);
    expect(main().opacity).toBe(0.25);
    await view.rerender(<OpacitySheet clipId="nope" visible onClose={() => {}} />);
    expect(screen.queryByTestId("opacity-slider")).toBeNull();
  });
});

describe("MaskSheet", () => {
  test("three tiles; picking one is one undo step, re-picking it is none", async () => {
    await render(<MaskSheet clipId="L" visible onClose={() => {}} />);
    expect(["None", "Rounded", "Circle"].map((n) => !!screen.getByRole("button", { name: n }))).toEqual([true, true, true]);
    expect(screen.getByRole("button", { name: "None" })).toBeSelected();
    await fireEvent.press(screen.getByRole("button", { name: "Circle" }));
    expect(layer().mask).toBe("circle");
    expect(past()).toBe(1);
    expect(screen.getByRole("button", { name: "Circle" })).toBeSelected();
    expect(screen.getByRole("button", { name: "None" })).not.toBeSelected();
    await fireEvent.press(screen.getByRole("button", { name: "Circle" }));
    expect(past()).toBe(1);
    await fireEvent.press(screen.getByRole("button", { name: "Rounded" }));
    expect(layer().mask).toBe("rounded");
    expect(past()).toBe(2);
  });

  test("each tile previews its shape with the shared mask radius", async () => {
    await render(<MaskSheet clipId="a" visible onClose={() => {}} />);
    for (const id of ["none", "rounded", "circle"] as const) {
      const style = [screen.getByTestId(`mask-shape-${id}`).props.style].flat(Infinity).reduce((a: object, s: object) => ({ ...a, ...s }), {}) as { width: number; height: number; borderRadius: number };
      expect(style.borderRadius).toBeCloseTo(maskRadius({ width: style.width, height: style.height }, id));
    }
    await fireEvent.press(screen.getByRole("button", { name: "Rounded" }));
    expect(main().mask).toBe("rounded");
  });
});
