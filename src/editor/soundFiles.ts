import { create } from "zustand";
import { soundFileName } from "./model/sound";
import type { AudioTrack } from "./model/types";

/** What is known of one rendered copy, by its file name (`soundFileName`). Nothing known = no entry. */
export type SoundFile = { status: "ready"; uri: string } | { status: "busy" } | { status: "failed"; message: string };

/**
 * The copies of the open project (transient: not saved, not undoable), and `hold`: a Strength or Pitch slider is being dragged,
 * so nothing is rendered until it is let go. `holdTrack` is the track that slider belongs to (null: none): the one track whose
 * preview plays its original meanwhile — every other track keeps playing its copy. Written only by soundRenders.ts.
 */
export const useSoundFiles = create<{ files: Record<string, SoundFile>; hold: boolean; holdTrack: string | null }>(() => ({ files: {}, hold: false, holdTrack: null }));

/** What is known of the copy a track needs: undefined for a track as recorded, and for a copy nobody has asked for yet. */
export function soundFileOf(files: Record<string, SoundFile>, track: AudioTrack | null): SoundFile | undefined {
  return track?.sound ? files[soundFileName(track.sourceUri, track.sound)] : undefined;
}

/** The file a track's preview player loads: its changed copy once that is ready, otherwise its own file. */
export function playUri(files: Record<string, SoundFile>, track: AudioTrack): string {
  const entry = soundFileOf(files, track);
  return entry?.status === "ready" ? entry.uri : track.sourceUri;
}
/** Whether the copy this track needs is being rendered right now. */
export function isPreparing(files: Record<string, SoundFile>, track: AudioTrack | null): boolean {
  return soundFileOf(files, track)?.status === "busy";
}
