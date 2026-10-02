import type { ClientAdapter } from "./types";

const MIN_DURATION_SEC = 3;
const MAX_DURATION_SEC = 900;
const MAX_BYTES = 300 * 1024 * 1024;
const CAPTION_MAX = 2200;

/**
 * Instagram posts as a Reel on the professional account linked to the user's Facebook Page. Meta processes the video before it can be
 * published, so the server's wait hint keeps the row polling (up to 10 minutes) and a timeout ends in Resume, never "upload again".
 */
export const instagram: ClientAdapter = {
  id: "instagram",
  captionMax: CAPTION_MAX,
  hasOptions: false,
  defaultOptions: () => ({}),
  validate(video, caption) {
    if (video.durationSec < MIN_DURATION_SEC) return "Instagram Reels must be at least 3 seconds.";
    if (video.durationSec > MAX_DURATION_SEC) return "Instagram Reels can be up to 15 minutes.";
    if (video.fileSize > MAX_BYTES) return "Instagram accepts videos up to 300 MB.";
    // Whole characters (code points), as the server counts when it cuts the caption: an emoji counts once.
    if (Array.from(caption).length > CAPTION_MAX) return "Instagram captions can be up to 2200 characters.";
    return null;
  },
  note: () => "Posts as a Reel. Instagram can take a few minutes to process — keep this screen open.",
};
