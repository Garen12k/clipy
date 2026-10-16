jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-06T12:00:00.000Z" }));
import { textLookOf } from "@/src/editor/model/ops";
import { totalDuration } from "@/src/editor/model/timeline";
import { makeAudioTrack, makeClip, makeOverlay, makePhotoClip, makeProject, makeSticker, type TextOverlay } from "@/src/editor/model/types";
import { BUNDLED_BEATS } from "@/src/editor/musicBeats";
import { buildQuickEdit, markerStep } from "../quickEdit";
import { STYLES, USER_PACE, cleanStyle, paceFor, parseStyles, planOfStyle, styleFromProject, stylesText, type UserStyle } from "../userStyles";

const PARTY = { title: "Party Sector", sourceDuration: 96.1 };   // a bundled song as AddAudioSheet writes it (quickEditFlow.test.ts)
const style = (over: Partial<UserStyle> = {}): UserStyle => ({ id: "s1", name: "Mine", createdAt: "2026-10-16T00:00:00.000Z", music: null, filter: null, filterIntensity: 1,
  transition: { type: "none", duration: 0 }, title: null, motions: [], motionStrength: 0.5, ...over });

describe("styleFromProject", () => {
  test("music: the music track that sounds longest; a bundled song is its manifest id; voice never counts", () => {
    const p = makeProject({ audioTracks: [
      makeAudioTrack({ id: "v", kind: "voice", sourceDuration: 200, title: "Voice" }),
      makeAudioTrack({ id: "short", sourceDuration: 40, trimEnd: 5, title: "Short" }),
      makeAudioTrack({ id: "song", ...PARTY, trimStart: 10, trimEnd: 40 }),
    ] });
    expect(styleFromProject(p).music).toEqual({ kind: "bundled", trackId: "party-sector" });
  });
  test("own music: its file, title and length; its beats are the markers inside its stretch, in FILE seconds", () => {
    const p = makeProject({ beatMarkers: [0, 1, 2, 2.5, 3, 3.5, 4, 25],
      audioTracks: [makeAudioTrack({ id: "m", sourceUri: "file:///doc/projects/p1/media/m.mp3", title: "mine.mp3", sourceDuration: 60, start: 2, trimStart: 10, trimEnd: 30 })] });
    expect(styleFromProject(p).music).toEqual({ kind: "own", sourceUri: "file:///doc/projects/p1/media/m.mp3", title: "mine.mp3", durationSec: 60, beats: [10, 10.5, 11, 11.5, 12] });
  });
  test("own music with fewer than four markers in its stretch: no beats", () => {
    const p = makeProject({ beatMarkers: [1, 2, 50], audioTracks: [makeAudioTrack({ id: "m", title: "mine.mp3", sourceDuration: 60 })] });
    expect(styleFromProject(p).music).toMatchObject({ kind: "own", beats: [] });
    expect(STYLES.minBeats).toBe(4);
  });
  test("filter: the most common over the main clips, a tie goes to the one met first, its strength from its first clip; none → null", () => {
    const at = (filter: "vivid" | "golden" | null, filterIntensity = 1, id = Math.random().toString()) => makeClip({ id, sourceDuration: 5, filter, filterIntensity });
    expect(styleFromProject(makeProject({ clips: [at(null), at("vivid", 0.6), at("vivid", 0.9), at("golden")] }))).toMatchObject({ filter: "vivid", filterIntensity: 0.6 });
    expect(styleFromProject(makeProject({ clips: [at("golden", 0.4), at("vivid")] }))).toMatchObject({ filter: "golden", filterIntensity: 0.4 });
    expect(styleFromProject(makeProject({ clips: [at(null), at(null), at("vivid")] }))).toMatchObject({ filter: null, filterIntensity: 1 });
    expect(styleFromProject(makeProject())).toMatchObject({ filter: null, filterIntensity: 1 });
  });
  test("transition: the most common type that is not none, the last clip left out; its duration from the first such clip", () => {
    const t = (type: "fade" | "slide" | "none", duration: number, id: string) => makeClip({ id, sourceDuration: 5, transitionOut: { type, duration } });
    expect(styleFromProject(makeProject({ clips: [t("fade", 0.5, "a"), t("slide", 0.4, "b"), t("slide", 0.6, "c"), t("fade", 0.3, "d"), t("fade", 0.3, "e")] })).transition)
      .toEqual({ type: "fade", duration: 0.5 });
    expect(styleFromProject(makeProject({ clips: [t("none", 0, "a"), t("fade", 0.5, "b")] })).transition).toEqual({ type: "none", duration: 0 });
  });
  test("title: the earliest TEXT with words — never a caption or a sticker; its words, whole look, place and turn", () => {
    const first = makeOverlay({ id: "t2", text: "First", start: 1, fontId: "oswald", color: "#112233", x: 0.3, y: 0.8, scale: 1.4, rotation: 12, align: "left" });
    const p = makeProject({ overlays: [
      makeOverlay({ id: "c", kind: "caption", text: "Caption", start: 0 }), makeSticker({ id: "s", start: 0 }), makeOverlay({ id: "blank", text: "  ", start: 0 }),
      makeOverlay({ id: "t1", text: "Later", start: 2 }), first, makeOverlay({ id: "t3", text: "Same time, later in the list", start: 1 }),
    ] });
    expect(styleFromProject(p).title).toEqual({ text: "First", look: textLookOf(first), x: 0.3, y: 0.8, scale: 1.4, rotation: 12, align: "left" });
    expect(styleFromProject(makeProject()).title).toBeNull();
  });
  test("photo motion: the motions that play, distinct, in order; the first one's strength; videos and keyframed photos ignored", () => {
    const p = makeProject({ clips: [
      makePhotoClip({ id: "a", motion: { id: "zoomIn", strength: 0.7 } }), makeClip({ id: "v", sourceDuration: 4 }),
      makePhotoClip({ id: "b", motion: { id: "panLeft", strength: 0.2 } }), makePhotoClip({ id: "c", motion: { id: "zoomIn", strength: 0.2 } }),
      makePhotoClip({ id: "k", motion: { id: "panUp", strength: 0.5 }, keyframes: [{ t: 0, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 }] }),
    ] });
    expect(styleFromProject(p)).toMatchObject({ motions: ["zoomIn", "panLeft"], motionStrength: 0.7 });
    expect(styleFromProject(makeProject())).toMatchObject({ motions: [], motionStrength: 0.5 });
  });
  test("total: any project makes a style a draft can be built from — captions only, stickers only, photos only, videos only, an own song with no markers", () => {
    const empty = { music: null, filter: null, filterIntensity: 1, transition: { type: "none", duration: 0 }, title: null, motions: [], motionStrength: 0.5 };
    const projects = {
      captionsOnly: makeProject({ overlays: [makeOverlay({ id: "c1", kind: "caption", text: "Hello", start: 0 }), makeOverlay({ id: "c2", kind: "caption", text: "World", start: 1 })] }),
      stickersOnly: makeProject({ overlays: [makeSticker({ id: "s1", start: 0 }), makeSticker({ id: "s2", start: 2 })] }),
      photosOnly: makeProject({ clips: [makePhotoClip({ id: "a" }), makePhotoClip({ id: "b" })] }),
      videosOnly: makeProject({ clips: [makeClip({ id: "a", sourceDuration: 3 }), makeClip({ id: "b", sourceDuration: 4 })] }),
      ownSongNoMarkers: makeProject({ audioTracks: [makeAudioTrack({ id: "m", title: "mine.mp3", sourceDuration: 60 })] }),
    };
    for (const p of Object.values(projects)) {
      const d = styleFromProject(p);
      expect({ ...d, music: d.music && { ...d.music } }).toMatchObject({ ...empty, music: d.music === null ? null : { kind: "own", beats: [] } });
      const s: UserStyle = { ...d, id: "s", name: "n", createdAt: "", music: d.music?.kind === "own" ? { kind: "own", file: "s.mp3", title: d.music.title, durationSec: d.music.durationSec, beats: d.music.beats } : null };
      expect(cleanStyle(JSON.parse(stylesText([s])).styles[0])).toEqual(s);
      const { plan, beats } = planOfStyle(s);
      const music = s.music ? makeAudioTrack({ id: "m", sourceDuration: 60, title: "mine.mp3" }) : null;
      const built = buildQuickEdit({ recipe: plan, project: makeProject({ clips: [makePhotoClip({ id: "x" })] }), music, beats, titleId: "t" });
      expect(built.overlays).toEqual([]);
      expect(built.audioTracks).toHaveLength(music ? 1 : 0);
    }
    expect(styleFromProject(projects.ownSongNoMarkers).music).toEqual({ kind: "own", sourceUri: expect.any(String), title: "mine.mp3", durationSec: 60, beats: [] });
  });
  test("a project with nothing still makes a style: nothing in it", () => {
    expect(styleFromProject(makeProject())).toEqual({ music: null, filter: null, filterIntensity: 1, transition: { type: "none", duration: 0 }, title: null, motions: [], motionStrength: 0.5 });
  });
});

describe("planOfStyle and the pace", () => {
  test("paceFor: a photo about 2.5 s, a video at most about 5 s, whatever the tempo", () => {
    const every500 = Array.from({ length: 40 }, (_, i) => i * 0.5);
    expect(paceFor(every500, 1)).toEqual({ hold: 5, videoHold: 10 });
    expect(paceFor(every500, 2)).toEqual({ hold: 3, videoHold: 5 });
    expect(paceFor([0, 0.1, 0.2, 0.3, 0.4], 1)).toEqual({ hold: 16, videoHold: 16 });
    expect(paceFor([], 2)).toEqual({ hold: 1, videoHold: 1 });
    expect(USER_PACE).toEqual({ photoSeconds: 2.5, videoSeconds: 5, most: 16 });
  });
  test("bundled: every 2nd of the shipped beats; own: every one of its own beats (the owner's markers); none: no beats", () => {
    const bundled = planOfStyle(style({ music: { kind: "bundled", trackId: "party-sector" } }));
    expect(bundled.beats).toBe(BUNDLED_BEATS["party-sector"]!.beats);
    expect(bundled.plan.every).toBe(2);
    expect({ hold: bundled.plan.hold, videoHold: bundled.plan.videoHold }).toEqual(paceFor(bundled.beats, 2));
    const own = planOfStyle(style({ music: { kind: "own", file: "s1.mp3", title: "mine.mp3", durationSec: 60, beats: [1, 2, 3, 4, 5] } }));
    expect(own.beats).toEqual([1, 2, 3, 4, 5]);
    expect(own.plan.every).toBe(1);
    expect(planOfStyle(style()).beats).toEqual([]);
  });
});

describe("buildQuickEdit with a style's plan", () => {
  const title = { text: "Our day", look: textLookOf(makeOverlay({ id: "x", fontId: "oswald", color: "#112233", fontScale: 0.09 })), x: 0.4, y: 0.7, scale: 1.2, rotation: 5, align: "left" as const };
  test("no music: the clips keep their own lengths, no sound, no marker; a null filter touches nothing; the title wears the look", () => {
    const project = makeProject({ aspectRatio: "auto", clips: [makePhotoClip({ id: "a" }), makeClip({ id: "b", sourceDuration: 10 })] });
    const { plan, beats } = planOfStyle(style({ title }));
    const d = buildQuickEdit({ recipe: plan, project, music: null, beats, titleId: "title" });
    expect(totalDuration(d)).toBeCloseTo(13, 9);
    expect(d.audioTracks).toEqual([]);
    expect(d.beatMarkers).toEqual([]);
    expect(d.clips.map((c) => c.filter)).toEqual([null, null]);
    expect(d.overlays).toHaveLength(1);
    expect(d.overlays[0] as TextOverlay).toMatchObject({ id: "title", kind: "text", text: "Our day", x: 0.4, y: 0.7, scale: 1.2, rotation: 5, align: "left", start: 0, end: 3, fontId: "oswald", color: "#112233", fontScale: 0.09 });
  });
  test("own music with beats: cut on its beats from the first one, music faded at the end", () => {
    const beats = Array.from({ length: 60 }, (_, i) => 1 + i * 0.5);
    const music = makeAudioTrack({ id: "m", sourceDuration: 40, title: "mine.mp3" });
    const { plan } = planOfStyle(style({ music: { kind: "own", file: "s1.mp3", title: "mine.mp3", durationSec: 40, beats } }));
    const d = buildQuickEdit({ recipe: plan, project: makeProject({ clips: [makePhotoClip({ id: "a" }), makePhotoClip({ id: "b" })] }), music, beats, titleId: "t" });
    expect(markerStep(beats, 1)).toBe(0.5);
    expect(d.clips.map((c) => Math.round((c.trimEnd - c.trimStart) * 1e6) / 1e6)).toEqual([2.5, 2.5]);
    expect(d.audioTracks[0]).toMatchObject({ trimStart: 1, trimEnd: 6, fadeOut: 1 });
    expect(d.overlays).toEqual([]);
  });
});

describe("the file's text", () => {
  test("round trip; version 1; newest first is kept", () => {
    const a = style({ id: "a" }), b = style({ id: "b", music: { kind: "bundled", trackId: "party-sector" } });
    expect(JSON.parse(stylesText([a, b]))).toEqual({ version: 1, styles: [a, b] });
    expect(parseStyles(stylesText([a, b]))).toEqual({ status: "ok", styles: [a, b] });
  });
  test("damaged: not JSON, no version, no list; newer: a later version", () => {
    expect(parseStyles("{oops")).toEqual({ status: "damaged" });
    expect(parseStyles("{}")).toEqual({ status: "damaged" });
    expect(parseStyles(JSON.stringify({ version: 1 }))).toEqual({ status: "damaged" });
    expect(parseStyles(JSON.stringify({ version: 2, styles: [] }))).toEqual({ status: "newer" });
  });
  test("cleanStyle: a style without id or name is dropped; anything else out of range is clamped", () => {
    expect(cleanStyle({ name: "x" })).toBeNull();
    expect(cleanStyle(null)).toBeNull();
    const c = cleanStyle({ id: "s", name: "x".repeat(60), filter: "nope", filterIntensity: 7, transition: { type: "twirl", duration: 3 }, motions: ["zoomIn", "warp", "zoomIn"], motionStrength: -1,
      music: { kind: "own", file: "../evil.mp3", title: "t", durationSec: 3, beats: [] }, title: { text: "  " } })!;
    expect(c).toMatchObject({ name: "x".repeat(40), filter: null, filterIntensity: 1, transition: { type: "none", duration: 0 }, motions: ["zoomIn"], motionStrength: 0, music: null, title: null });
    expect(cleanStyle({ id: "s", name: "n", transition: { type: "fade", duration: 9 } })!.transition).toEqual({ type: "fade", duration: 1 });
    expect(cleanStyle({ id: "s", name: "n", title: { text: "Hi", look: { fontId: "nope", color: "red", style: {} }, x: 3 } })!.title).toMatchObject({ text: "Hi", x: 1, look: { fontId: "bangers", color: "#F4F4F5" } });
  });
});
