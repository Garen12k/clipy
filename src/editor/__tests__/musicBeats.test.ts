import manifestJson from "../../../assets/music/manifest.json";
import { makeAudioTrack } from "../model/types";
import { BUNDLED_TRACKS } from "../music";
import { BUNDLED_BEATS, beatsOf, bundledTrackOf } from "../musicBeats";

const manifest = manifestJson as { tracks: { id: string; title: string; durationSec: number }[] };
const asAdded = (id: string) => { const t = manifest.tracks.find((x) => x.id === id)!; return makeAudioTrack({ id: "x", title: t.title, sourceDuration: t.durationSec }); };

test("beats.json has one entry per manifest track, in the manifest's order", () => {
  expect(Object.keys(BUNDLED_BEATS)).toEqual(manifest.tracks.map((t) => t.id));
});

test("every track with beats: a plausible tempo, a first beat inside the first beat's length, a steady grid inside the file", () => {
  for (const t of manifest.tracks) {
    const found = BUNDLED_BEATS[t.id];
    if (found === null) continue;
    const step = 60 / found.bpm;
    expect(found.bpm).toBeGreaterThanOrEqual(70);
    expect(found.bpm).toBeLessThanOrEqual(180);
    expect(found.confidence).toBeGreaterThanOrEqual(1.5);
    expect(found.beats[0]).toBe(found.first);
    expect(found.first).toBeGreaterThanOrEqual(0);
    expect(found.first).toBeLessThan(step);
    expect(Math.abs(found.beats.length - (t.durationSec - found.first) / step)).toBeLessThanOrEqual(1.5);   // beats ≈ length × bpm / 60
    found.beats.forEach((b, k) => {
      expect(b).toBeLessThan(t.durationSec + 0.05);
      expect(Math.abs(b - (found.first + k * step))).toBeLessThan(0.03);                                     // bpm is stored to 2 decimals
      if (k > 0) expect(b - found.beats[k - 1]).toBeGreaterThan(0.3);
    });
  }
});

test("seven of the eight tracks ship with beats; The Frigid Seas has no steady beat and ships without", () => {
  const without = manifest.tracks.filter((t) => BUNDLED_BEATS[t.id] === null).map((t) => t.id);
  expect(without).toEqual(["frigid-seas"]);
});

test("bundledTrackOf: a bundled song is recognised by the title and length it was added with — also as a trimmed, moved or split piece", () => {
  for (const b of BUNDLED_TRACKS) expect(bundledTrackOf(asAdded(b.id))?.id).toBe(b.id);
  const piece = { ...asAdded("party-sector"), id: "piece", start: 12, trimStart: 30, trimEnd: 41 };
  expect(bundledTrackOf(piece)?.id).toBe("party-sector");
});

test("bundledTrackOf: a file of the owner's, a recording and a sound effect are not bundled songs", () => {
  expect(bundledTrackOf(makeAudioTrack({ id: "f", title: "Party Sector.mp3", sourceDuration: 96.1 }))).toBeNull();   // a file keeps its extension in the title
  expect(bundledTrackOf(makeAudioTrack({ id: "f", title: "Party Sector", sourceDuration: 96.13 }))).toBeNull();
  expect(bundledTrackOf({ ...asAdded("party-sector"), kind: "voice" })).toBeNull();
  expect(bundledTrackOf({ ...asAdded("party-sector"), kind: "sfx" })).toBeNull();
});

test("beatsOf: ok with the beats, unsteady for the track without, own for anything else", () => {
  const ok = beatsOf(asAdded("party-sector"));
  expect(ok).toEqual({ status: "ok", title: "Party Sector", beats: BUNDLED_BEATS["party-sector"]!.beats });
  expect(beatsOf(asAdded("frigid-seas"))).toEqual({ status: "unsteady", title: "The Frigid Seas" });
  expect(beatsOf(makeAudioTrack({ id: "f", title: "my song.m4a", sourceDuration: 180 }))).toEqual({ status: "own" });
});
