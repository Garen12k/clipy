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

test("clientAdapters has youtube, tiktok, instagram and facebook", () => {
  expect(Object.keys(clientAdapters).sort()).toEqual(["facebook", "instagram", "tiktok", "youtube"]);
  for (const id of Object.keys(clientAdapters) as (keyof typeof clientAdapters)[]) expect(clientAdapters[id]!.id).toBe(id);
});

const MB = 1024 * 1024;

test("instagram: caption 2200, no options, Reel limits at the boundaries, the processing note", () => {
  const ig = clientAdapters.instagram!;
  expect(ig.id).toBe("instagram");
  expect(ig.captionMax).toBe(2200);
  expect(ig.hasOptions).toBe(false);
  expect(ig.defaultOptions("Beach day")).toEqual({});
  expect(ig.validate(video, "hello", {})).toBeNull();
  expect(ig.validate({ ...video, durationSec: 2.9 }, "", {})).toBe("Instagram Reels must be at least 3 seconds.");
  expect(ig.validate({ ...video, durationSec: 3 }, "", {})).toBeNull();
  expect(ig.validate({ ...video, durationSec: 90.1 }, "", {})).toBeNull();
  expect(ig.validate({ ...video, durationSec: 900 }, "", {})).toBeNull();
  expect(ig.validate({ ...video, durationSec: 900.1 }, "", {})).toBe("Instagram Reels can be up to 15 minutes.");
  expect(ig.validate({ ...video, fileSize: 300 * MB }, "", {})).toBeNull();
  expect(ig.validate({ ...video, fileSize: 300 * MB + 1 }, "", {})).toBe("Instagram accepts videos up to 300 MB.");
  expect(ig.validate(video, "x".repeat(2200), {})).toBeNull();
  expect(ig.validate(video, "x".repeat(2201), {})).toBe("Instagram captions can be up to 2200 characters.");
  expect(ig.note(video)).toBe("Posts as a Reel. Instagram can take a few minutes to process — keep this screen open.");
  expect(ig.doneNote).toBeUndefined();
});

test("facebook: caption 5000, no options, Reel limits at the boundaries, the Development-mode note", () => {
  const fb = clientAdapters.facebook!;
  expect(fb.id).toBe("facebook");
  expect(fb.captionMax).toBe(5000);
  expect(fb.hasOptions).toBe(false);
  expect(fb.defaultOptions("Beach day")).toEqual({});
  expect(fb.validate(video, "hello", {})).toBeNull();
  expect(fb.validate({ ...video, durationSec: 2.9 }, "", {})).toBe("Facebook Reels must be at least 3 seconds.");
  expect(fb.validate({ ...video, durationSec: 3 }, "", {})).toBeNull();
  expect(fb.validate({ ...video, durationSec: 90 }, "", {})).toBeNull();
  expect(fb.validate({ ...video, durationSec: 90.1 }, "", {})).toBe("Facebook Reels can be up to 90 seconds.");
  expect(fb.validate({ ...video, durationSec: 900 }, "", {})).toBe("Facebook Reels can be up to 90 seconds.");
  expect(fb.validate({ ...video, fileSize: 300 * MB + 1 }, "", {})).toBeNull();
  expect(fb.validate({ ...video, fileSize: 1024 ** 3 }, "", {})).toBeNull();
  expect(fb.validate({ ...video, fileSize: 1024 ** 3 + 1 }, "", {})).toBe("Facebook accepts videos up to 1 GB.");
  expect(fb.note(video)).toBe("Posts as a Reel on your Page. Until Clipy's Facebook app is switched to Live, the Reel may be visible only to you.");
  expect(fb.doneNote).toBeUndefined();
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
