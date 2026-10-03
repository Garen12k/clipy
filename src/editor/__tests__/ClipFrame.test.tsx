jest.mock("@/src/editor/components/thumbnails", () => ({ getThumb: jest.fn(async () => "file:///thumb.jpg") }));
import { render, screen } from "@testing-library/react-native";
import { StyleSheet, Text } from "react-native";
import { getThumb } from "@/src/editor/components/thumbnails";
import { fitScale } from "@/src/editor/model/clipLayout";
import { makeClip, makePhotoClip, type Clip } from "@/src/editor/model/types";
import { ClipFrame } from "../components/ClipFrame";

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
