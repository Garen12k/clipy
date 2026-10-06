jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-06T12:00:00.000Z" }));
import manifest from "../../../assets/music/manifest.json";
import { BEAT_CUT } from "@/src/editor/model/beats";
import { migrateProject } from "@/src/editor/model/migrate";
import { clipDuration, clipStartTimes, totalDuration } from "@/src/editor/model/timeline";
import { FILTER_IDS, PHOTO_MOTION_IDS, TRANSITION_LIMITS, TRANSITION_TYPES, makeAudioTrack, makeClip, makePhotoClip, makeProject, type Clip, type Project, type TextOverlay } from "@/src/editor/model/types";
import { BUNDLED_BEATS } from "@/src/editor/musicBeats";
import { TEXT_TEMPLATE_IDS, TEXT_TEMPLATES } from "@/src/editor/textTemplates";
import { QUICK, QUICK_RECIPE_IDS, QUICK_RECIPES, buildQuickEdit, markerStep, type QuickRecipe } from "../quickEdit";

const GLYPHS: Record<string, number> = require("@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json");

/** 120 bpm, first beat 0.25 s into the file, 62 s of it. */
const BEATS = Array.from({ length: 124 }, (_, i) => Math.round((0.25 + i * 0.5) * 1000) / 1000);
const MUSIC = makeAudioTrack({ id: "song", sourceDuration: 62.3, title: "Song" });
/** A plain recipe for the vectors: a marker every beat (0.5 s), photos 4 steps (2 s), videos at most 6 (3 s). */
const PLAIN: QuickRecipe = { ...QUICK_RECIPES.travel, every: 1, hold: 4, videoHold: 6, transition: { type: "fade", duration: 0.5 }, motions: ["zoomIn", "panLeft"], motionStrength: 0.5 };
const photo = (id: string) => makePhotoClip({ id });
const video = (id: string, sourceDuration: number) => makeClip({ id, sourceDuration });
const draftOf = (clips: Clip[], recipe: QuickRecipe = PLAIN, beats: readonly number[] = BEATS, music = MUSIC): Project =>
  buildQuickEdit({ recipe, project: makeProject({ aspectRatio: "auto", clips }), music, beats, titleId: "title" });
const lengths = (p: Project) => p.clips.map((c) => Math.round(clipDuration(c) * 1e6) / 1e6);
const onBeat = (p: Project, t: number) => p.beatMarkers.some((m) => Math.abs(m - t) <= BEAT_CUT.reach);

describe("the six recipes are data from the editor's own registries", () => {
  test("ids, labels and icons", () => {
    expect(QUICK_RECIPE_IDS).toEqual(["travel", "party", "calm", "cinematic", "retro", "vlog"]);
    expect(QUICK_RECIPE_IDS.map((id) => QUICK_RECIPES[id].label)).toEqual(["Travel", "Party", "Calm", "Cinematic", "Retro", "Vlog"]);
    expect(QUICK_RECIPE_IDS.map((id) => QUICK_RECIPES[id].icon)).toEqual(["airplane-outline", "balloon-outline", "leaf-outline", "film-outline", "radio-outline", "videocam-outline"]);
    for (const id of QUICK_RECIPE_IDS) { expect(QUICK_RECIPES[id].id).toBe(id); expect(GLYPHS[QUICK_RECIPES[id].icon]).toBeDefined(); }
    expect(QUICK).toEqual({ slack: 0.05, fadeOut: 1, titleSeconds: 3, maxItems: 30 });
  });
  test("every id exists: track, filter, transition, text template, motions; six different tracks; every track has beats", () => {
    const trackIds = (manifest as { tracks: { id: string }[] }).tracks.map((t) => t.id);
    for (const id of QUICK_RECIPE_IDS) {
      const r = QUICK_RECIPES[id];
      expect(trackIds).toContain(r.trackId);
      expect(BUNDLED_BEATS[r.trackId]?.beats.length).toBeGreaterThan(20);
      expect(FILTER_IDS).toContain(r.filter);
      expect(TRANSITION_TYPES).toContain(r.transition.type);
      expect(TEXT_TEMPLATE_IDS).toContain(r.textTemplate);
      for (const m of r.motions) expect(PHOTO_MOTION_IDS).toContain(m);
      expect([1, 2, 4]).toContain(r.every);
      expect(r.videoHold).toBeGreaterThanOrEqual(r.hold);
      expect(r.title.length).toBeGreaterThan(0);
      expect(r.title.length).toBeLessThanOrEqual(16);
    }
    expect(new Set(QUICK_RECIPE_IDS.map((id) => QUICK_RECIPES[id].trackId)).size).toBe(6);
  });
  test("the pacing in seconds, from the shipped beats: a photo is 1 to 4 s and long enough to keep its transition", () => {
    const seconds = Object.fromEntries(QUICK_RECIPE_IDS.map((id) => {
      const r = QUICK_RECIPES[id];
      return [id, Math.round(r.hold * markerStep(BUNDLED_BEATS[r.trackId]!.beats, r.every) * 100) / 100];
    }));
    expect(seconds).toEqual({ travel: 2.5, party: 1, calm: 2.79, cinematic: 3, retro: 2.76, vlog: 2.93 });
    for (const id of QUICK_RECIPE_IDS) {
      const r = QUICK_RECIPES[id];
      if (r.transition.type !== "none") expect(r.transition.duration).toBeLessThanOrEqual(Math.min(TRANSITION_LIMITS.max, seconds[id] / 2));
    }
  });
});

test("markerStep: the time from the first beat to the every-th; 0 with too few beats", () => {
  expect(markerStep(BEATS, 1)).toBeCloseTo(0.5, 9);
  expect(markerStep(BEATS, 4)).toBeCloseTo(2, 9);
  expect(markerStep([1, 2], 2)).toBe(0);
  expect(markerStep([], 1)).toBe(0);
});

describe("buildQuickEdit — the worked example of the spec", () => {
  // Photo, a 10 s video, photo, a 1.3 s video, photo. Markers every 0.5 s from 0.
  const draft = draftOf([photo("a"), video("b", 10), photo("c"), video("d", 1.3), photo("e")]);

  test("photos last 4 steps, the long video is cut to 6, the short video ends on the latest beat it reaches — and the last clip ends on a beat too", () => {
    expect(lengths(draft)).toEqual([2, 3, 2, 1, 2]);
    expect(totalDuration(draft)).toBeCloseTo(10, 9);
    for (const t of [...clipStartTimes(draft).slice(1), totalDuration(draft)]) expect(onBeat(draft, t)).toBe(true);
    expect(draft.clips.map((c) => c.id)).toEqual(["a", "b", "c", "d", "e"]);
  });
  test("the music starts on its first beat, runs to the video's end and fades out", () => {
    expect(draft.audioTracks).toEqual([{ ...MUSIC, start: 0, trimStart: 0.25, trimEnd: 10.25, fadeIn: 0, fadeOut: 1 }]);
  });
  test("markers: one per beat from 0 to the video's end, none after it", () => {
    expect(draft.beatMarkers).toEqual(Array.from({ length: 21 }, (_, i) => i * 0.5));
  });
  test("the transition on every cut but none after the last clip; the filter and its strength on every clip", () => {
    expect(draft.clips.map((c) => c.transitionOut)).toEqual([
      { type: "fade", duration: 0.5 }, { type: "fade", duration: 0.5 }, { type: "fade", duration: 0.5 }, { type: "fade", duration: 0.5 }, { type: "none", duration: 0 }]);
    for (const c of draft.clips) { expect(c.filter).toBe("golden"); expect(c.filterIntensity).toBe(0.7); }
  });
  test("photos get the motions in turn; videos get none", () => {
    expect(draft.clips.map((c) => c.motion ?? null)).toEqual([{ id: "zoomIn", strength: 0.5 }, null, { id: "panLeft", strength: 0.5 }, null, { id: "zoomIn", strength: 0.5 }]);
  });
  test("one title over the first 3 seconds, in the recipe's text template", () => {
    expect(draft.overlays).toHaveLength(1);
    const title = draft.overlays[0] as TextOverlay;
    const look = TEXT_TEMPLATES.cleanTitle.patch;
    expect(title).toMatchObject({ id: "title", kind: "text", text: "Our trip", x: 0.5, y: 0.2, fontScale: 0.08, start: 0, end: 3, fontId: look.fontId, color: look.color });
  });
  test("the result is an ordinary project: loading it changes nothing", () => {
    expect(migrateProject(JSON.parse(JSON.stringify(draft)))).toEqual(draft);
    expect(draft.aspectRatio).toBe("auto");
    expect(draft.layers).toEqual([]);
    expect(draft.effects).toEqual([]);
  });
});

describe("buildQuickEdit — edge cases", () => {
  test("one photo: 4 steps long, on the beat, a title, music — and no transition", () => {
    const d = draftOf([photo("a")]);
    expect(lengths(d)).toEqual([2]);
    expect(d.clips[0].transitionOut).toEqual({ type: "none", duration: 0 });
    expect(d.audioTracks[0]).toMatchObject({ trimStart: 0.25, trimEnd: 2.25, fadeOut: 1 });
    expect((d.overlays[0] as TextOverlay).end).toBe(2);           // the title never runs past the video
  });
  test("thirty photos: every cut on a beat", () => {
    const d = draftOf(Array.from({ length: 30 }, (_, i) => photo(`p${i}`)));
    expect(lengths(d)).toEqual(Array(30).fill(2));
    expect(totalDuration(d)).toBeCloseTo(60, 6);
    expect(d.audioTracks[0].trimEnd).toBeCloseTo(60.25, 9);
  });
  test("only videos: long ones are cut to 6 steps, short ones to their latest beat; nothing is given a Motion", () => {
    const d = draftOf([video("a", 8), video("b", 2.2), video("c", 0.4)]);
    expect(lengths(d)).toEqual([3, 2, 0.4]);                      // c is shorter than the minimum: left as it is
    for (const c of d.clips) expect("motion" in c).toBe(false);
  });
  test("more clips than music: the clip the music ends under is cut on its last beat; clips after it keep their target length; the music plays to its own end", () => {
    const short = makeAudioTrack({ id: "song", sourceDuration: 5.3, title: "Song" });
    const d = draftOf(Array.from({ length: 5 }, (_, i) => photo(`p${i}`)), PLAIN, BEATS.filter((b) => b < 5.3), short);
    // The last beat is 5.0 s into the video: the clip it falls in is cut there, and the clips after it have no marker in reach.
    expect(lengths(d)).toEqual([2, 2, 1, 2.05, 2.05]);
    expect(d.audioTracks[0]).toMatchObject({ trimStart: 0.25, trimEnd: 5.3 });
    expect(Math.max(...d.beatMarkers)).toBe(5);
  });
  test("no beats known: the clips keep their own lengths, there are no markers, the music starts at its start — the look is still applied", () => {
    const d = draftOf([photo("a"), video("b", 4)], PLAIN, []);
    expect(lengths(d)).toEqual([3, 4]);
    expect(d.beatMarkers).toEqual([]);
    expect(d.audioTracks[0]).toMatchObject({ trimStart: 0, trimEnd: 7, fadeOut: 1 });
    expect(d.clips[0].filter).toBe("golden");
    expect(d.overlays).toHaveLength(1);
  });
  test("a recipe without a transition or motions leaves both alone", () => {
    const d = draftOf([photo("a"), photo("b")], { ...PLAIN, transition: { type: "none", duration: 0 }, motions: [] });
    expect(d.clips.map((c) => c.transitionOut.type)).toEqual(["none", "none"]);
    for (const c of d.clips) expect("motion" in c).toBe(false);
  });
  test("no clips: the project comes back as it is", () => {
    const empty = makeProject();
    expect(buildQuickEdit({ recipe: PLAIN, project: empty, music: MUSIC, beats: BEATS, titleId: "t" })).toBe(empty);
  });
  test("the given project is not mutated", () => {
    const project = makeProject({ aspectRatio: "auto", clips: [photo("a"), video("b", 10)] });
    const frozen = JSON.stringify(project);
    buildQuickEdit({ recipe: PLAIN, project, music: MUSIC, beats: BEATS, titleId: "t" });
    expect(JSON.stringify(project)).toBe(frozen);
  });
});

test.each(QUICK_RECIPE_IDS)("the shipped recipe %s with the shipped beats: eight photos and two videos, every cut and the end on a marker", (id) => {
  const recipe = QUICK_RECIPES[id];
  const found = BUNDLED_BEATS[recipe.trackId]!;
  const song = (manifest as { tracks: { id: string; title: string; durationSec: number }[] }).tracks.find((t) => t.id === recipe.trackId)!;
  const clips = [...Array.from({ length: 4 }, (_, i) => photo(`p${i}`)), video("v1", 30), ...Array.from({ length: 4 }, (_, i) => photo(`q${i}`)), video("v2", 2.2)];
  const d = draftOf(clips, recipe, found.beats, makeAudioTrack({ id: "song", sourceDuration: song.durationSec, title: song.title }));
  const total = totalDuration(d);
  expect(total).toBeLessThanOrEqual(song.durationSec - found.first);   // ten clips fit under every recipe's track
  for (const t of [...clipStartTimes(d).slice(1), total]) expect(onBeat(d, t)).toBe(true);
  const step = markerStep(found.beats, recipe.every);
  d.clips.forEach((c) => { if (c.kind === "photo") expect(clipDuration(c)).toBeCloseTo(recipe.hold * step, 2); });
  expect(clipDuration(d.clips[4])).toBeCloseTo(recipe.videoHold * step, 2);
  expect(d.audioTracks[0].trimStart).toBe(found.first);
  expect(d.audioTracks[0].trimEnd).toBeCloseTo(found.first + total, 3);
  if (recipe.transition.type !== "none") for (const c of d.clips.slice(0, -2)) expect(c.transitionOut).toEqual(recipe.transition);
  expect(migrateProject(JSON.parse(JSON.stringify(d)))).toEqual(d);
});
