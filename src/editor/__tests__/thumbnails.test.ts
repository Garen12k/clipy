jest.mock("expo-video-thumbnails", () => ({ getThumbnailAsync: jest.fn(async (uri: string, o: { time: number }) => ({ uri: `${uri}#${o.time}` })) }));
import * as VT from "expo-video-thumbnails";
import { getThumb } from "../components/thumbnails";

test("getThumb memoizes per uri and half-second", async () => {
  const a = await getThumb("file:///a.mov", 1.2);
  const b = await getThumb("file:///a.mov", 1.3);
  expect(a).toBe(b);
  expect(VT.getThumbnailAsync).toHaveBeenCalledTimes(1);
  expect(VT.getThumbnailAsync).toHaveBeenCalledWith("file:///a.mov", expect.objectContaining({ time: 1000 }));
});
