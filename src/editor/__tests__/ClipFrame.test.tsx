jest.mock("@/src/editor/components/thumbnails", () => ({ getThumb: jest.fn(async () => "file:///thumb.jpg") }));
import { render, screen, within } from "@testing-library/react-native";
import { StyleSheet, Text } from "react-native";
import { getThumb } from "@/src/editor/components/thumbnails";
import { fitScale, maskRadius, placeClip } from "@/src/editor/model/clipLayout";
import { makeClip, makeKeyframe, makePhotoClip, type Clip } from "@/src/editor/model/types";
import { ClipFrame, clipFrameMotion } from "../components/ClipFrame";

const W = 1080, H = 1920;
const style = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style);
const landscape = (over: Partial<Clip> = {}) => {
  const base = makeClip({ id: "l", sourceDuration: 4, width: 1920, height: 1080 });
  const scale = fitScale({ width: 1920, height: 1080 }, base.crop, 0, W, H);
  return makeClip({ id: "l", sourceDuration: 4, width: 1920, height: 1080, transform: { ...base.transform, scale }, ...over });
};

beforeEach(() => jest.clearAllMocks());

test("a default clip's picture box equals the frame and no background is drawn", async () => {
  await render(<ClipFrame clip={makeClip({ id: "a", sourceDuration: 4 })} frameW={W} frameH={H}><Text>video</Text></ClipFrame>);
  expect(style("clip-box")).toMatchObject({ position: "absolute", left: 0, top: 0, width: W, height: H, overflow: "hidden" });
  expect(screen.queryByTestId("clip-background")).toBeNull();
  expect(screen.getByText("video")).toBeTruthy();
});

test("a landscape clip at fit scale is 1080×607.5 centred, with a black background", async () => {
  await render(<ClipFrame clip={landscape()} frameW={W} frameH={H}><Text>video</Text></ClipFrame>);
  const box = style("clip-box");
  expect(box.width).toBeCloseTo(1080);
  expect(box.height).toBeCloseTo(607.5);
  expect(box.left).toBeCloseTo(0);
  expect(box.top).toBeCloseTo((H - 607.5) / 2);
  expect(style("clip-background")).toMatchObject({ backgroundColor: "black" });
});

test("a colour background uses the clip's colour", async () => {
  await render(<ClipFrame clip={landscape({ background: { type: "color", color: "#FF0000" } })} frameW={W} frameH={H} />);
  expect(style("clip-background")).toMatchObject({ backgroundColor: "#FF0000" });
});

test("a blur background of a video shows its still with blurRadius 24", async () => {
  const clip = landscape({ background: { type: "blur" }, trimStart: 1.5 });
  await render(<ClipFrame clip={clip} frameW={W} frameH={H} />);
  const img = await screen.findByTestId("clip-background-blur");
  expect(img.props.blurRadius).toBe(24);
  expect(img.props.source).toEqual({ uri: "file:///thumb.jpg" });
  expect(getThumb).toHaveBeenCalledWith(clip.sourceUri, 1.5);
});

test("a blur background of a photo blurs the photo itself", async () => {
  const clip = makePhotoClip({ id: "p", background: { type: "blur" }, transform: { scale: 0.5, x: 0, y: 0, rotation: 0, flipH: false, flipV: false } });
  await render(<ClipFrame clip={clip} frameW={W} frameH={H} />);
  expect(screen.getByTestId("clip-background-blur").props.source).toEqual({ uri: clip.sourceUri });
  expect(getThumb).not.toHaveBeenCalled();
});

test("a blur background that is covered fetches nothing", async () => {
  await render(<ClipFrame clip={makeClip({ id: "a", sourceDuration: 4, background: { type: "blur" } })} frameW={W} frameH={H} />);
  expect(screen.queryByTestId("clip-background")).toBeNull();
  expect(getThumb).not.toHaveBeenCalled();
});

test("a crop sizes and offsets the inner content so only the crop shows", async () => {
  const crop = { x: 0.25, y: 0.1, w: 0.5, h: 0.8 };
  await render(<ClipFrame clip={makeClip({ id: "a", sourceDuration: 4, crop })} frameW={W} frameH={H}><Text>video</Text></ClipFrame>);
  const box = style("clip-box"), content = style("clip-content");
  expect(content.width).toBeCloseTo(box.width / 0.5);
  expect(content.height).toBeCloseTo(box.height / 0.8);
  expect(content.left).toBeCloseTo(-0.25 * content.width);
  expect(content.top).toBeCloseTo(-0.1 * content.height);
});

test("flips map to negative scales and rotation is applied", async () => {
  const clip = makeClip({ id: "a", sourceDuration: 4, transform: { scale: 1, x: 0, y: 0, rotation: 30, flipH: true, flipV: false } });
  await render(<ClipFrame clip={clip} frameW={W} frameH={H} />);
  expect(style("clip-box").transform).toEqual([{ rotate: "30deg" }, { scaleX: -1 }, { scaleY: 1 }]);
});

test("a photo is drawn as an Image and children are ignored", async () => {
  const clip = makePhotoClip({ id: "p" });
  await render(<ClipFrame clip={clip} frameW={W} frameH={H}><Text>video</Text></ClipFrame>);
  expect(screen.getByTestId("clip-photo").props.source).toEqual({ uri: clip.sourceUri });
  expect(screen.queryByText("video")).toBeNull();
});

describe("masks", () => {
  const small = { scale: 0.5, x: 0, y: 0, rotation: 0, flipH: false, flipV: false };

  test("rounded: the picture box gets 12 % of its shorter side as corner radius and stays clipped", async () => {
    const clip = makeClip({ id: "a", sourceDuration: 4, mask: "rounded", transform: small });
    await render(<ClipFrame clip={clip} frameW={W} frameH={H} />);
    const placed = placeClip({ width: clip.width, height: clip.height }, clip.crop, small, W, H);
    expect(style("clip-box").borderRadius).toBeCloseTo(maskRadius(placed, "rounded"), 10);
    expect(style("clip-box").borderRadius).toBeCloseTo(0.12 * 540, 10);
    expect(style("clip-box").overflow).toBe("hidden");
  });

  test("circle: half the shorter side, following a motion transform override", async () => {
    const clip = landscape({ mask: "circle" });
    const view = await render(<ClipFrame clip={clip} frameW={W} frameH={H} />);
    expect(style("clip-box").borderRadius).toBeCloseTo(607.5 / 2, 10);
    await view.rerender(<ClipFrame clip={clip} frameW={W} frameH={H} transform={{ ...clip.transform, scale: clip.transform.scale / 2 }} />);
    expect(style("clip-box").borderRadius).toBeCloseTo(607.5 / 4, 10);
  });

  test("a masked clip that covers the frame shows its background around the rounded corners", async () => {
    const clip = makeClip({ id: "a", sourceDuration: 4, mask: "rounded", background: { type: "color", color: "#00FF00" } });
    await render(<ClipFrame clip={clip} frameW={W} frameH={H} />);
    expect(style("clip-background")).toMatchObject({ backgroundColor: "#00FF00" });
    expect(style("clip-background").borderRadius).toBeUndefined();
  });

  test("mask none adds no radius key and no background (the default tree)", async () => {
    await render(<ClipFrame clip={makeClip({ id: "a", sourceDuration: 4 })} frameW={W} frameH={H} />);
    expect("borderRadius" in style("clip-box")).toBe(false);
    expect(screen.queryByTestId("clip-background")).toBeNull();
  });
});

describe("transparent (layers) and overlayChildren", () => {
  test("transparent: never a background node — uncovered, see-through or masked — and no blur still is fetched", async () => {
    const clip = landscape({ mask: "circle", background: { type: "blur" } });
    await render(<ClipFrame clip={clip} frameW={W} frameH={H} transparent opacity={0.5}><Text>video</Text></ClipFrame>);
    expect(screen.queryByTestId("clip-background")).toBeNull();
    expect(screen.queryByTestId("clip-background-blur")).toBeNull();
    expect(getThumb).not.toHaveBeenCalled();
    expect(style("clip-box").opacity).toBe(0.5);
    expect(screen.getByText("video")).toBeTruthy();
  });

  test("overlayChildren are drawn inside the picture box, after the picture, for videos and photos", async () => {
    const view = await render(<ClipFrame clip={makeClip({ id: "a", sourceDuration: 4 })} frameW={W} frameH={H} overlayChildren={<Text>look</Text>}><Text>video</Text></ClipFrame>);
    expect(within(screen.getByTestId("clip-box")).getByText("look")).toBeTruthy();
    expect(within(screen.getByTestId("clip-content")).queryByText("look")).toBeNull();
    expect(JSON.stringify(view.toJSON()).indexOf("look")).toBeGreaterThan(JSON.stringify(view.toJSON()).indexOf("video"));
    await view.rerender(<ClipFrame clip={makePhotoClip({ id: "p" })} frameW={W} frameH={H} overlayChildren={<Text>look</Text>} />);
    expect(within(screen.getByTestId("clip-box")).getByText("look")).toBeTruthy();
  });
});

describe("clipFrameMotion: what a clip passes to its frame", () => {
  test("a default clip passes nothing", () => {
    expect(clipFrameMotion(makeClip({ id: "a", sourceDuration: 4 }), 1)).toEqual({});
  });
  test("a static opacity below 1 passes the opacity only", () => {
    expect(clipFrameMotion(makeClip({ id: "a", sourceDuration: 4, opacity: 0.4 }), 1)).toEqual({ opacity: 0.4 });
  });
  test("a clip with motion passes its transform and its opacity × the clip's own", () => {
    const clip = makeClip({ id: "a", sourceDuration: 4, opacity: 0.5, keyframes: [makeKeyframe({ t: 0, x: 0.25, opacity: 0.5 })] });
    const m = clipFrameMotion(clip, 1);
    expect(m.transform).toMatchObject({ x: 0.25, scale: 1 });
    expect(m.opacity).toBeCloseTo(0.25, 10);
    const plain = clipFrameMotion(makeClip({ id: "a", sourceDuration: 4, keyframes: [makeKeyframe({ t: 0 })] }), 1);
    expect(plain.opacity).toBe(1); // with motion the opacity is always passed, as before
  });
});

describe("motion overrides (transform / opacity)", () => {
  const moved = { scale: 0.5, x: 0.25, y: -0.1, rotation: 40, flipH: false, flipV: true };

  test("a transform override places the picture instead of the clip's own transform", async () => {
    const clip = makeClip({ id: "a", sourceDuration: 4 });
    await render(<ClipFrame clip={clip} frameW={W} frameH={H} transform={moved} />);
    const placed = placeClip({ width: clip.width, height: clip.height }, clip.crop, moved, W, H);
    const box = style("clip-box");
    expect(box.left).toBeCloseTo(placed.centerX - placed.width / 2);
    expect(box.top).toBeCloseTo(placed.centerY - placed.height / 2);
    expect(box.width).toBeCloseTo(W * 0.5);
    expect(box.transform).toEqual([{ rotate: "40deg" }, { scaleX: 1 }, { scaleY: -1 }]);
    expect(screen.getByTestId("clip-background")).toBeTruthy(); // the override no longer covers the frame
  });

  test("opacity goes on the picture box only; the background stays opaque", async () => {
    await render(<ClipFrame clip={landscape()} frameW={W} frameH={H} opacity={0.4} />);
    expect(style("clip-box").opacity).toBe(0.4);
    expect(style("clip-background").opacity).toBeUndefined();
    expect(style("clip-content").opacity).toBeUndefined();
  });

  test("a covering clip shows its background while its opacity is below 1, and not at 1", async () => {
    const clip = makeClip({ id: "a", sourceDuration: 4, background: { type: "color", color: "#00FF00" } });
    const view = await render(<ClipFrame clip={clip} frameW={W} frameH={H} opacity={0.5} />);
    expect(style("clip-background")).toMatchObject({ backgroundColor: "#00FF00" });
    await view.rerender(<ClipFrame clip={clip} frameW={W} frameH={H} opacity={1} />);
    expect(screen.queryByTestId("clip-background")).toBeNull();
    expect(style("clip-box").opacity).toBe(1);
  });

  test("a covering blur-background clip with motion fetches its still before the fade starts, so the first faded frame is not black", async () => {
    const clip = makeClip({ id: "a", sourceDuration: 4, background: { type: "blur" }, trimStart: 0.5 });
    const view = await render(<ClipFrame clip={clip} frameW={W} frameH={H} opacity={1} />);
    expect(getThumb).toHaveBeenCalledWith(clip.sourceUri, 0.5);
    expect(screen.queryByTestId("clip-background")).toBeNull(); // still covered and opaque: nothing drawn yet
    await view.rerender(<ClipFrame clip={clip} frameW={W} frameH={H} opacity={0.9} />);
    expect(screen.getByTestId("clip-background-blur").props.source).toEqual({ uri: "file:///thumb.jpg" }); // at once, no wait
    expect(getThumb).toHaveBeenCalledTimes(1);
  });

  test("without overrides the picture box carries no opacity (the tree is as before)", async () => {
    const clip = makeClip({ id: "a", sourceDuration: 4 });
    const plain = await render(<ClipFrame clip={clip} frameW={W} frameH={H}><Text>video</Text></ClipFrame>);
    expect("opacity" in style("clip-box")).toBe(false);
    const before = JSON.stringify(plain.toJSON());
    await plain.rerender(<ClipFrame clip={clip} frameW={W} frameH={H} transform={undefined} opacity={undefined}><Text>video</Text></ClipFrame>);
    expect(JSON.stringify(plain.toJSON())).toBe(before);
    expect(Object.keys(style("clip-box")).sort()).toEqual(["height", "left", "overflow", "position", "top", "transform", "width"]);
  });
});
