jest.mock("../components/thumbnails", () => ({ getThumb: jest.fn(async () => "file:///thumb.jpg") }));
import { render, screen } from "@testing-library/react-native";
import { makePhotoClip } from "@/src/editor/model/types";
import { thumbTimes } from "../timelineLayout";
import { getThumb } from "../components/thumbnails";
import { ClipThumbStrip } from "../components/ClipThumbStrip";

beforeEach(() => jest.clearAllMocks());

test("a photo clip draws the photo in every thumbnail slot without asking for video thumbnails", async () => {
  const clip = makePhotoClip({ id: "p", seconds: 5 });
  await render(<ClipThumbStrip clip={clip} pixelsPerSecond={50} selected={false} missing={false} onPress={() => {}} />);
  const images = screen.getAllByTestId("thumb-image");
  expect(images.length).toBe(thumbTimes(clip, 50).length);
  expect(images.length).toBeGreaterThan(1);
  for (const img of images) expect(img.props.source).toEqual({ uri: clip.sourceUri });
  expect(getThumb).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Photo")).toBeTruthy();
});

test("a missing photo draws no images", async () => {
  await render(<ClipThumbStrip clip={makePhotoClip({ id: "p" })} pixelsPerSecond={50} selected={false} missing onPress={() => {}} />);
  expect(screen.queryAllByTestId("thumb-image")).toHaveLength(0);
  expect(getThumb).not.toHaveBeenCalled();
});
