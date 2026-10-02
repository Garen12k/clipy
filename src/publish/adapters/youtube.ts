import type { ClientAdapter } from "./types";

const SHORT_MAX_SEC = 180;

export const youtube: ClientAdapter = {
  id: "youtube",
  captionMax: 5000,
  hasOptions: true,
  defaultOptions: (title) => ({ title: title.slice(0, 100), privacy: "public" }),
  validate(_video, caption, options) {
    const title = typeof options.title === "string" ? options.title.trim() : "";
    // No title is fine when there is a caption: the server derives the title from it.
    if (!title && !caption.trim()) return "Add a caption or a title for YouTube.";
    if (title.length > 100) return "YouTube titles can be up to 100 characters.";
    if (caption.length > 5000) return "YouTube descriptions can be up to 5000 characters.";
    return null;
  },
  note(video) {
    const base = "YouTube keeps uploads from new apps private until Google reviews Clipy. Open the video in YouTube to make it public.";
    return video.durationSec > SHORT_MAX_SEC ? `${base} Longer than 3 minutes, so it posts as a regular video, not a Short.` : base;
  },
};
