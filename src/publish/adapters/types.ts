import type { PlatformId } from "../platforms";

export interface VideoInfo { fileUri: string; fileSize: number; durationSec: number; mimeType: string }
export interface ClientAdapter {
  id: PlatformId; captionMax: number;
  defaultOptions(title: string): Record<string, unknown>;
  /** A sentence to show the user, or null when the video and options are acceptable. */
  validate(video: VideoInfo, caption: string, options: Record<string, unknown>): string | null;
  /** Standing note shown on the row (platform rules the user should know), or null. */
  note(video: VideoInfo): string | null;
}
