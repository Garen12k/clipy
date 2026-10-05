import manifest from "../../assets/music/manifest.json";

export interface ManifestTrack { id: string; title: string; file: string; durationSec: number; license: "CC0"; source: string }
export interface BundledTrack { id: string; title: string; durationSec: number; license: "CC0"; source: string; file: number }

// Metro needs static require() calls, one per file in the manifest. Keep this map in sync
// with assets/music/manifest.json — see assets/music/README.md for how to add a track.
export const FILES: Record<string, number> = {
  "party-sector.mp3": require("../../assets/music/party-sector.mp3"),
  "funked-up.mp3": require("../../assets/music/funked-up.mp3"),
  "happy-adventure.mp3": require("../../assets/music/happy-adventure.mp3"),
  "bossa-nova.mp3": require("../../assets/music/bossa-nova.mp3"),
  "frigid-seas.mp3": require("../../assets/music/frigid-seas.mp3"),
  "jrpg2-piano.mp3": require("../../assets/music/jrpg2-piano.mp3"),
  "field-of-dreams.mp3": require("../../assets/music/field-of-dreams.mp3"),
  "mandatory-overtime.mp3": require("../../assets/music/mandatory-overtime.mp3"),
};

const tracks = (manifest as { tracks: ManifestTrack[] }).tracks;

export const BUNDLED_TRACKS: BundledTrack[] = tracks.map((t) => ({ ...t, license: "CC0", file: FILES[t.file] }));
