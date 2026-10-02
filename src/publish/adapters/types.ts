import type { PlatformId } from "../platforms";

export interface VideoInfo { fileUri: string; fileSize: number; durationSec: number; mimeType: string }
export interface ClientAdapter {
  id: PlatformId;
  /** Longest caption the platform accepts, or null when the platform does not receive the caption at all. */
  captionMax: number | null;
  defaultOptions(title: string): Record<string, unknown>;
  /** A sentence to show the user, or null when the video and options are acceptable. */
  validate(video: VideoInfo, caption: string, options: Record<string, unknown>): string | null;
  /** Standing note shown on the row (platform rules the user should know), or null. */
  note(video: VideoInfo): string | null;
  /** A note that depends on the caption (e.g. X's price for a post with a link), or null. Shown with the standing note. */
  captionNote?(caption: string): string | null;
  /** Shown on a finished row that has no link (e.g. a TikTok draft). */
  doneNote?: string;
  /** False when the platform has no per-post options (no "options" button). Default true. */
  hasOptions?: boolean;
}
