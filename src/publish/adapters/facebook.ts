import type { ClientAdapter } from "./types";

const MIN_DURATION_SEC = 3;
const MAX_DURATION_SEC = 90;
const MAX_BYTES = 1024 ** 3;

/** Facebook posts as a Reel on the user's Page. While Clipy's Meta app is in Development mode the Reel may be visible only to the user. */
export const facebook: ClientAdapter = {
  id: "facebook",
  captionMax: 5000,
  hasOptions: false,
  defaultOptions: () => ({}),
  validate(video) {
    if (video.durationSec < MIN_DURATION_SEC) return "Facebook Reels must be at least 3 seconds.";
    if (video.durationSec > MAX_DURATION_SEC) return "Facebook Reels can be up to 90 seconds.";
    if (video.fileSize > MAX_BYTES) return "Facebook accepts videos up to 1 GB.";
    return null;
  },
  note: () => "Posts as a Reel on your Page. Until Clipy's Facebook app is switched to Live, the Reel may be visible only to you.",
};
