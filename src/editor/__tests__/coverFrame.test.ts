jest.mock("../components/thumbnails", () => ({
  getThumb: jest.fn(async (uri: string, t: number) => `thumb:${uri}@${t}`),
  getStill: jest.fn(async (uri: string, t: number) => `still:${uri}@${t}`),
}));
import { makeClip, makePhotoClip, makeProject } from "@/src/editor/model/types";
import { getStill, getThumb } from "../components/thumbnails";
import { frameUriAt } from "../coverFrame";

const a = makeClip({ id: "a", sourceDuration: 4 });
const b = makeClip({ id: "b", sourceDuration: 6, speed: 2 });
const p = makeProject({ clips: [a, b] });

beforeEach(() => { jest.clearAllMocks(); });

test("a video frame comes from the half-second thumbnail cache, at the clip's source time", async () => {
  await expect(frameUriAt(p, 5)).resolves.toBe(`thumb:${b.sourceUri}@2`);
  expect(getThumb).toHaveBeenCalledWith(b.sourceUri, 2);
  expect(getStill).not.toHaveBeenCalled();
});

test("exact asks for the full-quality still at the same place", async () => {
  await expect(frameUriAt(p, 5, true)).resolves.toBe(`still:${b.sourceUri}@2`);
  expect(getStill).toHaveBeenCalledWith(b.sourceUri, 2);
  expect(getThumb).not.toHaveBeenCalled();
});

test("a photo is its own frame: no helper call", async () => {
  const photo = makePhotoClip({ id: "ph" });
  await expect(frameUriAt(makeProject({ clips: [photo, a] }), 1, true)).resolves.toBe(photo.sourceUri);
  expect(getThumb).not.toHaveBeenCalled();
  expect(getStill).not.toHaveBeenCalled();
});

test("an empty project has no frame", async () => {
  await expect(frameUriAt(makeProject(), 0)).resolves.toBeNull();
});

test("a failing helper gives null, not a throw", async () => {
  (getThumb as jest.Mock).mockRejectedValueOnce(new Error("no frame"));
  await expect(frameUriAt(p, 1)).resolves.toBeNull();
});
