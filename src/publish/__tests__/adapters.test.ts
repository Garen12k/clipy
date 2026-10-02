import { X_LINK_VECTORS, X_WEIGHT_VECTORS } from "@/supabase/functions/_shared/__tests__/xWeightVectors";
import { clientAdapters } from "../adapters";
import { hasLink, weightedLength } from "../adapters/x";
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

test("clientAdapters has all five platforms", () => {
  expect(Object.keys(clientAdapters).sort()).toEqual(["facebook", "instagram", "tiktok", "x", "youtube"]);
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
  // Counted by whole characters, like the server: 2200 emoji (4400 UTF-16 units) fit, 2201 do not.
  expect(ig.validate(video, "😀".repeat(2200), {})).toBeNull();
  expect(ig.validate(video, "😀".repeat(2201), {})).toBe("Instagram captions can be up to 2200 characters.");
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

describe("x", () => {
  const xa = () => clientAdapters.x!;
  const TOO_LONG = "X posts can be up to 280 characters (emoji and links count extra).";
  const COST = "Posting to X costs about 1.5¢ (about 20¢ if the caption has a link). The video goes through Clipy's server in small pieces.";
  const LINK_NOTE = "This caption contains a link — X charges about 20¢ for posts with links.";

  test("defaults: caption 280, no options, the cost note", () => {
    expect(xa().id).toBe("x");
    expect(xa().captionMax).toBe(280);
    expect(xa().hasOptions).toBe(false);
    expect(xa().defaultOptions("Beach day")).toEqual({});
    expect(xa().validate(video, "hello", {})).toBeNull();
    expect(xa().note(video)).toBe(COST);
    expect(xa().doneNote).toBeUndefined();
  });

  test("the caption is counted the way X counts it, at the 280 boundary", () => {
    expect(xa().validate(video, "a".repeat(280), {})).toBeNull();
    expect(xa().validate(video, "a".repeat(281), {})).toBe(TOO_LONG);
    // An emoji weighs 2: 140 fit, 141 do not (282), although 141 emoji are only 141 characters.
    expect(xa().validate(video, "😀".repeat(140), {})).toBeNull();
    expect(xa().validate(video, "😀".repeat(141), {})).toBe(TOO_LONG);
    expect(xa().validate(video, "a".repeat(279) + "😀", {})).toBe(TOO_LONG);
    // A link counts 23 however long it is.
    const link = " https://example.com/" + "p".repeat(60);
    expect(xa().validate(video, "a".repeat(256) + link, {})).toBeNull(); // 256 + 1 + 23 = 280
    expect(xa().validate(video, "a".repeat(257) + link, {})).toBe(TOO_LONG);
  });

  test("duration and size at their boundaries", () => {
    expect(xa().validate({ ...video, durationSec: 1200 }, "", {})).toBeNull();
    expect(xa().validate({ ...video, durationSec: 1200.1 }, "", {})).toBe("X accepts videos up to 20 minutes.");
    expect(xa().validate({ ...video, fileSize: 1024 ** 3 }, "", {})).toBeNull();
    expect(xa().validate({ ...video, fileSize: 1024 ** 3 + 1 }, "", {})).toBe("X uploads go through Clipy's server and are limited to 1 GB.");
  });

  test("weightedLength and hasLink give the server's answers on the shared vectors", () => {
    expect(X_WEIGHT_VECTORS.length).toBeGreaterThan(20);
    for (const [text, n] of X_WEIGHT_VECTORS) expect([text, weightedLength(text)]).toEqual([text, n]);
    for (const [text, link] of X_LINK_VECTORS) expect([text, hasLink(text)]).toEqual([text, link]);
  });

  test("a caption with a link (a bare domain too) gets the price warning; one without does not", () => {
    const note = xa().captionNote!;
    expect(note("Beach day")).toBeNull();
    expect(note("")).toBeNull();
    expect(note("More at clipy.app")).toBe(LINK_NOTE);
    expect(note("https://example.com")).toBe(LINK_NOTE);
  });
});
