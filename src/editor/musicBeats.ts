import data from "../../assets/music/beats.json";
import { BUNDLED_TRACKS, type BundledTrack } from "./music";
import type { AudioTrack } from "./model/types";

/** One bundled track's beats as scripts/generate-beats.mjs wrote them: seconds into the FILE, ascending. */
export interface TrackBeats { bpm: number; first: number; confidence: number; beats: number[] }

/** By manifest id. `null` = the generator found no steady beat in that track (it is shipped without beats). */
export const BUNDLED_BEATS: Record<string, TrackBeats | null> = (data as { version: number; tracks: Record<string, TrackBeats | null> }).tracks;

/**
 * Which bundled song a track is, or null for anything else (a file of the owner's, a recording, a sound effect). A track stores no
 * song id: a bundled track is recognised by what `AddAudioSheet` wrote when it was added — the manifest's title and its exact
 * length. A split piece or a copy keeps both, so it is still recognised. A file of the owner's has its file name as its title.
 */
export function bundledTrackOf(t: Pick<AudioTrack, "title" | "sourceDuration" | "kind">): BundledTrack | null {
  if (t.kind !== "music") return null;
  return BUNDLED_TRACKS.find((b) => b.title === t.title && b.durationSec === t.sourceDuration) ?? null;
}

/**
 * What Find beats can do with a track: `ok` — its beats (file seconds); `unsteady` — a bundled track without a steady beat;
 * `own` — not a bundled track (reading a file's sound needs the native build).
 */
export type FoundBeats = { status: "ok"; title: string; beats: readonly number[] } | { status: "unsteady"; title: string } | { status: "own" };
export function beatsOf(t: Pick<AudioTrack, "title" | "sourceDuration" | "kind">): FoundBeats {
  const song = bundledTrackOf(t);
  if (!song) return { status: "own" };
  const found = BUNDLED_BEATS[song.id];
  return found && found.beats.length > 0 ? { status: "ok", title: song.title, beats: found.beats } : { status: "unsteady", title: song.title };
}
