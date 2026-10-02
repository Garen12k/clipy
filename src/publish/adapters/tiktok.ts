import type { ClientAdapter } from "./types";

const MAX_DURATION_SEC = 600;
const MAX_BYTES = 4 * 1024 ** 3;
const TYPES = ["video/mp4", "video/quicktime", "video/webm"];

/**
 * TikTok keeps un-audited apps to private-only Direct Posts, so Clipy sends the video to the user's TikTok inbox
 * as a draft: no caption, no options, and no link when it's done.
 */
export const tiktok: ClientAdapter = {
  id: "tiktok",
  captionMax: null,
  hasOptions: false,
  defaultOptions: () => ({}),
  validate(video) {
    if (video.durationSec > MAX_DURATION_SEC) return "TikTok accepts videos up to 10 minutes.";
    if (video.fileSize > MAX_BYTES) return "TikTok accepts videos up to 4 GB.";
    if (!TYPES.includes(video.mimeType)) return "TikTok accepts MP4, MOV or WebM videos.";
    return null;
  },
  note: () => "Clipy sends the video to your TikTok inbox. Open TikTok to add the caption and post it (up to 5 unfinished drafts a day).",
  doneNote: "Sent to TikTok — open TikTok to finish posting.",
};
