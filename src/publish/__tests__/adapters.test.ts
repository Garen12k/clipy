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
  // An empty title is fine when there is a caption (the server derives the title from it); both empty is not.
  expect(yt.validate(video, "hello", { title: "  ", privacy: "public" })).toBeNull();
  expect(yt.validate(video, "hello", { title: "", privacy: "public" })).toBeNull();
  expect(yt.validate(video, "  ", { title: "  ", privacy: "public" })).toBe("Add a caption or a title for YouTube.");
  expect(yt.validate(video, "", { privacy: "public" })).toBe("Add a caption or a title for YouTube.");
  expect(yt.validate(video, "x".repeat(5001), { title: "t", privacy: "public" })).toBe("YouTube descriptions can be up to 5000 characters.");
  expect(yt.note(video)).toMatch(/private until Google reviews/i);
  expect(yt.note({ ...video, durationSec: 200 })).toMatch(/regular video, not a Short/i);
  expect(yt.hasOptions ?? true).toBe(true);
  expect(yt.captionMax).toBe(5000);
});

test("clientAdapters has youtube and tiktok", () => {
  expect(Object.keys(clientAdapters).sort()).toEqual(["tiktok", "youtube"]);
});

test("tiktok: no caption, no options, its limits, the inbox note and the done note", () => {
  const tt = clientAdapters.tiktok!;
  expect(tt.id).toBe("tiktok");
  expect(tt.captionMax).toBeNull();
  expect(tt.hasOptions).toBe(false);
  expect(tt.defaultOptions("Beach day")).toEqual({});
  expect(tt.validate(video, "x".repeat(10000), {})).toBeNull();
  expect(tt.validate({ ...video, durationSec: 600 }, "", {})).toBeNull();
  expect(tt.validate({ ...video, durationSec: 601 }, "", {})).toBe("TikTok accepts videos up to 10 minutes.");
  expect(tt.validate({ ...video, fileSize: 4 * 1024 ** 3 }, "", {})).toBeNull();
  expect(tt.validate({ ...video, fileSize: 4 * 1024 ** 3 + 1 }, "", {})).toBe("TikTok accepts videos up to 4 GB.");
  expect(tt.validate({ ...video, mimeType: "video/quicktime" }, "", {})).toBeNull();
  expect(tt.validate({ ...video, mimeType: "video/webm" }, "", {})).toBeNull();
  expect(tt.validate({ ...video, mimeType: "video/x-msvideo" }, "", {})).toBe("TikTok accepts MP4, MOV or WebM videos.");
  expect(tt.note(video)).toBe("Clipy sends the video to your TikTok inbox. Open TikTok to add the caption and post it (up to 5 unfinished drafts a day).");
  expect(tt.doneNote).toBe("Sent to TikTok — open TikTok to finish posting.");
});
