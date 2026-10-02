import { clientAdapters } from "../adapters";
import { PLATFORM_IDS, PLATFORMS } from "../platforms";

const video = { fileUri: "file:///v.mp4", fileSize: 20_000_000, durationSec: 21, mimeType: "video/mp4" };

test("every platform has a label and an icon", () => {
  expect(PLATFORM_IDS).toEqual(["youtube", "tiktok", "instagram", "facebook", "x"]);
  for (const id of PLATFORM_IDS) { expect(PLATFORMS[id].label.length).toBeGreaterThan(0); expect(PLATFORMS[id].icon).toBeTruthy(); }
});

test("youtube: defaults, limits and the private-until-audit note", () => {
  const yt = clientAdapters.youtube!;
  expect(yt.defaultOptions("x".repeat(150))).toEqual({ title: "x".repeat(100), privacy: "public" });
  expect(yt.validate(video, "hello", { title: "Beach day", privacy: "public" })).toBeNull();
  expect(yt.validate(video, "hello", { title: "x".repeat(101), privacy: "public" })).toBe("YouTube titles can be up to 100 characters.");
  expect(yt.validate(video, "hello", { title: "  ", privacy: "public" })).toBe("Add a title for YouTube.");
  expect(yt.validate(video, "x".repeat(5001), { title: "t", privacy: "public" })).toBe("YouTube descriptions can be up to 5000 characters.");
  expect(yt.note(video)).toMatch(/private until Google reviews/i);
  expect(yt.note({ ...video, durationSec: 200 })).toMatch(/regular video, not a Short/i);
});
