jest.mock("expo-video-thumbnails", () => ({ getThumbnailAsync: jest.fn(async (uri: string, o: { time: number }) => ({ uri: `${uri}#${o.time}` })) }));
import * as VT from "expo-video-thumbnails";
import { getStill, getThumb } from "../components/thumbnails";

test("getThumb memoizes per uri and half-second", async () => {
  const a = await getThumb("file:///a.mov", 1.2);
  const b = await getThumb("file:///a.mov", 1.3);
  expect(a).toBe(b);
  expect(VT.getThumbnailAsync).toHaveBeenCalledTimes(1);
  expect(VT.getThumbnailAsync).toHaveBeenCalledWith("file:///a.mov", expect.objectContaining({ time: 1000 }));
});

describe("getStill", () => {
  const thumb = VT.getThumbnailAsync as jest.Mock;
  beforeEach(() => { thumb.mockClear(); });

  test("asks for the exact millisecond at full quality", async () => {
    await expect(getStill("file:///s1.mov", 2.34)).resolves.toBe("file:///s1.mov#2340");
    expect(thumb).toHaveBeenCalledWith("file:///s1.mov", { time: 2340, quality: 1 });
  });

  test("a second call for the same uri and millisecond reuses the promise", async () => {
    const first = getStill("file:///s2.mov", 1.2);
    expect(getStill("file:///s2.mov", 1.2)).toBe(first);
    await getStill("file:///s2.mov", 1.2004);
    expect(thumb).toHaveBeenCalledTimes(1);
    await getStill("file:///s2.mov", 1.3);
    expect(thumb).toHaveBeenCalledTimes(2);
  });

  test("a failure is not cached", async () => {
    thumb.mockRejectedValueOnce(new Error("no frame"));
    await expect(getStill("file:///s3.mov", 1)).rejects.toThrow("no frame");
    await expect(getStill("file:///s3.mov", 1)).resolves.toBe("file:///s3.mov#1000");
    expect(thumb).toHaveBeenCalledTimes(2);
  });
});
