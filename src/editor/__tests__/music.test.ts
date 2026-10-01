import { existsSync } from "fs";
import { join } from "path";
import manifestJson from "../../../assets/music/manifest.json";
import { BUNDLED_TRACKS, FILES, type ManifestTrack } from "../music";

const manifest = manifestJson as { tracks: ManifestTrack[] };

test("manifest has a tracks array", () => {
  expect(Array.isArray(manifest.tracks)).toBe(true);
});

test("every manifest track is CC0, has a source, a duration, a file on disk and a FILES entry", () => {
  for (const t of manifest.tracks) {
    expect(t.license).toBe("CC0");
    expect(t.source).toMatch(/^https?:\/\//);
    expect(t.durationSec).toBeGreaterThan(5);
    expect(existsSync(join(__dirname, "../../../assets/music", t.file))).toBe(true);
    expect(FILES[t.file]).toBeDefined();
  }
});

test("BUNDLED_TRACKS ids equal manifest ids", () => {
  expect(BUNDLED_TRACKS.map((t) => t.id)).toEqual(manifest.tracks.map((t) => t.id));
});
