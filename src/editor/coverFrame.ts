import { getStill, getThumb } from "./components/thumbnails";
import { frameAt } from "./model/timeline";
import type { Project } from "./model/types";

/**
 * Image uri of the frame shown at a project time: a photo is its own file; a video goes through the thumbnail
 * helpers (`exact` = the full-quality still at that millisecond, else the cached half-second thumbnail).
 * Null for an empty project or when the frame cannot be read.
 */
export async function frameUriAt(p: Project, time: number, exact = false): Promise<string | null> {
  const f = frameAt(p, time);
  if (!f) return null;
  if (f.clip.kind === "photo") return f.clip.sourceUri;
  try { return await (exact ? getStill : getThumb)(f.clip.sourceUri, f.sourceTime); }
  catch { return null; }
}
