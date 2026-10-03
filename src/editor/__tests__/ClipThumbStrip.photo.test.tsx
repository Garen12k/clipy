jest.mock("../components/thumbnails", () => ({ getThumb: jest.fn(async (uri: string, t: number) => `${uri}#thumb@${t}`) }));
import { render, screen, waitFor } from "@testing-library/react-native";
import { makeClip, makePhotoClip, type Clip } from "@/src/editor/model/types";
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

test("swapping the media under the same clip id (Replace) redraws the strip from the new source", async () => {
  const strip = (clip: Clip) => <ClipThumbStrip clip={clip} pixelsPerSecond={50} selected={false} missing={false} onPress={() => {}} />;
  const srcs = () => screen.getAllByTestId("thumb-image").map((i) => i.props.source.uri as string);
  const oldVideo = makeClip({ id: "c", sourceDuration: 4, sourceUri: "file:///old.mp4" });
  const view = await render(strip(oldVideo));
  await waitFor(() => expect(srcs().length).toBe(thumbTimes(oldVideo, 50).length));
  expect(srcs().every((u) => u.startsWith("file:///old.mp4#thumb@"))).toBe(true);

  const newVideo = { ...oldVideo, sourceUri: "file:///new.mp4" };
  await view.rerender(strip(newVideo));
  await waitFor(() => expect(srcs().length).toBe(thumbTimes(newVideo, 50).length));
  expect(srcs().every((u) => u.startsWith("file:///new.mp4#thumb@"))).toBe(true);
  expect(getThumb).toHaveBeenCalledWith("file:///new.mp4", 0);

  const photo = makePhotoClip({ id: "c", seconds: 4, sourceUri: "file:///pic.jpg" });
  await view.rerender(strip(photo));
  expect(srcs().every((u) => u === "file:///pic.jpg")).toBe(true);

  const again = { ...oldVideo, sourceUri: "file:///third.mp4" };
  await view.rerender(strip(again));
  await waitFor(() => expect(srcs().length).toBe(thumbTimes(again, 50).length));
  expect(srcs().every((u) => u.startsWith("file:///third.mp4#thumb@"))).toBe(true);
});
