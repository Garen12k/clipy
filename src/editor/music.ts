import manifest from "../../assets/music/manifest.json";

export interface ManifestTrack { id: string; title: string; file: string; durationSec: number; license: "CC0"; source: string }
export interface BundledTrack { id: string; title: string; durationSec: number; license: "CC0"; source: string; file: number }

// Metro needs static require() calls, one per file in the manifest. Keep this map in sync
// with assets/music/manifest.json — see assets/music/README.md for how to add a track.
export const FILES: Record<string, number> = {
  // "<slug>.mp3": require("../../assets/music/<slug>.mp3"),
};

const tracks = (manifest as { tracks: ManifestTrack[] }).tracks;

export const BUNDLED_TRACKS: BundledTrack[] = tracks.map((t) => ({ ...t, license: "CC0", file: FILES[t.file] }));
