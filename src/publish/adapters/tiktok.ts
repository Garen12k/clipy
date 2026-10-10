import { DIRECT_DONE, directBlocker, directNote, isDirect, readDirect, sendDirect, TITLE_MAX } from "../tiktokDirect";
import type { ClientAdapter } from "./types";

const MAX_DURATION_SEC = 600;
const MAX_BYTES = 4 * 1024 ** 3;
const TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const DRAFT_NOTE = "Clipy sends the video to your TikTok inbox. Open TikTok to add the caption and post it (up to 5 unfinished drafts a day).";
const DRAFT_DONE = "Sent to TikTok — open TikTok to finish posting.";

/**
 * TikTok has two ways to send, chosen in its options. "Send as draft" (the default — the options are `{}`) puts the video in the
 * user's TikTok inbox: no caption, nothing else sent, no link when it is done. "Post now" (`mode: "direct"`) is TikTok's Direct Post:
 * the caption is the title and the rules live in tiktokDirect.ts. Whatever the options hold, a draft sends `{}`.
 */
export const tiktok: ClientAdapter = {
  id: "tiktok",
  captionMax: null,
  captionLimit: (options) => (isDirect(options) ? TITLE_MAX : null),
  hasOptions: true,
  defaultOptions: () => ({}),
  sendOptions: (options) => (isDirect(options) ? sendDirect(readDirect(options)) : {}),
  validate(video, _caption, options) {
    if (video.durationSec > MAX_DURATION_SEC) return "TikTok accepts videos up to 10 minutes.";
    if (video.fileSize > MAX_BYTES) return "TikTok accepts videos up to 4 GB.";
    if (!TYPES.includes(video.mimeType)) return "TikTok accepts MP4, MOV or WebM videos.";
    return isDirect(options) ? directBlocker(video, readDirect(options)) : null;
  },
  note: () => DRAFT_NOTE,
  noteFor: (video, options) => (isDirect(options) ? directNote(video, readDirect(options)) : DRAFT_NOTE),
  doneNote: DRAFT_DONE,
  doneNoteFor: (options) => (isDirect(options) ? DIRECT_DONE : DRAFT_DONE),
};
