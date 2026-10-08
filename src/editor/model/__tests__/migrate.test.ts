import { readFileSync } from "fs";
import { join } from "path";
import { migrateProject } from "../migrate";
import { setClipSpeedCurve } from "../ops";
import { ANIM_COMBO_IDS, CROP_MIN, DEFAULT_ADJUST, DEFAULT_SHADOW, DEFAULT_TEXT_STYLE, DEFAULT_TRANSFORM, EFFECT_IDS, FILTER_IDS, FULL_CROP, makeAudioTrack, makeClip, makeEffect, makeKeyframe, makeLayer, makeOverlay, makePhotoClip, makeProject, makeSticker, NO_CLIP_ANIMATION, NO_OVERLAY_ANIMATION, PHOTO, SCHEMA_VERSION, TRANSITION_TYPES, type AudioTrack, type Clip, type EffectItem, type LayerClip, type Overlay, type TextOverlay } from "../types";

const v1 = {
  id: "p1", name: "Old", createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z",
  aspectRatio: "9:16", schemaVersion: 1,
  clips: [{ id: "a", sourceUri: "file:///m/a.mp4", sourceDuration: 4, width: 1080, height: 1920, trimStart: 0, trimEnd: 4, speed: 1, filter: null, volume: 1, transitionOut: { type: "none", duration: 0 } }],
};

test("v1 → v2 adds muted, empty overlays/audioTracks and bumps the version", () => {
  const p = migrateProject(v1);
  expect(p.schemaVersion).toBe(SCHEMA_VERSION);
  expect(p.clips[0]).toMatchObject({ muted: false, volume: 1 });
  expect(p.overlays).toEqual([]);
  expect(p.audioTracks).toEqual([]);
});

test("v3 passes through unchanged (idempotent)", () => {
  const p = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 })] });
  expect(migrateProject(p)).toEqual(p);
});

test("rejects newer versions and malformed files with readable errors", () => {
  expect(() => migrateProject({ ...v1, schemaVersion: SCHEMA_VERSION + 1 })).toThrow(/newer version of Clipy/);
  expect(() => migrateProject({ schemaVersion: 1 })).toThrow(/missing required fields/);
  expect(() => migrateProject("nope")).toThrow(/missing required fields/);
});

test("v2 → v3 normalises effect fields; v1 → v3 chains", () => {
  const v2 = { ...v1, schemaVersion: 2, overlays: [], audioTracks: [], clips: [{ ...v1.clips[0], muted: false, speed: 7, filter: "bogus", transitionOut: { type: "bogus", duration: 2 } }] };
  const p = migrateProject(v2);
  expect(p.schemaVersion).toBe(SCHEMA_VERSION);
  expect(p.clips[0]).toMatchObject({ speed: 1, filter: null, transitionOut: { type: "none", duration: 0 } });
  const fromV1 = migrateProject(v1);
  expect(fromV1.schemaVersion).toBe(SCHEMA_VERSION);
  expect(fromV1.clips[0]).toMatchObject({ muted: false, speed: 1, filter: null });
  expect(FILTER_IDS).toContain("none");
});
test("a corrupted v3 file loads safely (unknown ids normalised, bad stickers fixed or dropped) and the pass is idempotent", () => {
  const good = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 })], overlays: [makeSticker({ id: "ok", emoji: null, shape: "heart" })] });
  const bad = {
    ...good,
    clips: [
      { ...makeClip({ id: "a", sourceDuration: 4 }), filter: "bogus", speed: 9, transitionOut: { type: "bogus", duration: 0.5 } },
      { ...makeClip({ id: "b", sourceDuration: 0.4 }), transitionOut: { type: "fade", duration: 0.5 } },        // last clip → cleared
    ],
    overlays: [
      ...good.overlays,
      { ...makeSticker({ id: "blob-emoji", emoji: "🔥" }), shape: "blob" },                                       // falls back to the emoji
      { ...makeSticker({ id: "blob-only", emoji: null }), shape: "blob" },                                       // nothing to draw → dropped
    ],
  };
  const p = migrateProject(bad);
  expect(p.schemaVersion).toBe(SCHEMA_VERSION);
  expect(p.clips[0]).toMatchObject({ filter: null, speed: 1, transitionOut: { type: "none", duration: 0 } });   // unknown type → dissolve, but the 0.4 s next clip caps it below the minimum
  expect(p.clips[1].transitionOut).toEqual({ type: "none", duration: 0 });
  expect(p.overlays.map((o) => o.id)).toEqual(["ok", "blob-emoji"]);
  expect(p.overlays[1]).toMatchObject({ kind: "sticker", emoji: "🔥", shape: null });
  expect(migrateProject(p)).toEqual(p);
  const capped = migrateProject({ ...good, clips: [makeClip({ id: "x", sourceDuration: 0.8, transitionOut: { type: "fade", duration: 1 } }), makeClip({ id: "y", sourceDuration: 4 })] });
  expect(capped.clips[0].transitionOut).toEqual({ type: "fade", duration: 0.4 });  // re-capped to half the shorter clip
});

test("v3 overlays keep kind; a text overlay without kind gets kind text", () => {
  const v3 = { ...v1, schemaVersion: 2, audioTracks: [], clips: [{ ...v1.clips[0], muted: false }], overlays: [{ id: "o", text: "x", fontId: "bangers", fontScale: 0.07, color: "#fff", background: null, outline: true, align: "center", x: 0.5, y: 0.5, scale: 1, rotation: 0, start: 0, end: 1 }] };
  expect(migrateProject(v3).overlays[0]).toMatchObject({ kind: "text" });
});

test("v4 → v5 adds the clip defaults", () => {
  const c = makeClip({ id: "a", sourceDuration: 4 }) as unknown as Record<string, unknown>;
  for (const k of ["kind", "transform", "crop", "background", "reversed"]) delete c[k];
  const p = migrateProject({ ...makeProject(), schemaVersion: 4, clips: [c] });
  expect(p.schemaVersion).toBe(SCHEMA_VERSION);
  expect(p.clips[0]).toMatchObject({ kind: "video", transform: DEFAULT_TRANSFORM, crop: FULL_CROP, background: { type: "black" }, reversed: false });
});

test("a corrupted v5 clip is repaired exactly; photos are forced to the photo rules; the pass is idempotent", () => {
  const base = makeClip({ id: "a", sourceDuration: 4 });
  const bad = makeProject({ clips: [
    { ...base, kind: "gif", transform: { ...DEFAULT_TRANSFORM, scale: 99 }, crop: { x: 0.9, y: 0, w: 0.5, h: 1 }, background: { type: "color", color: "red" }, reversed: "yes" } as unknown as Clip,
    { ...base, id: "b", background: { type: "sparkle" } } as unknown as Clip,
    { ...base, id: "c", background: { type: "color", color: "#12ABef" } },
    { ...makePhotoClip({ id: "p" }), speed: 2, trimEnd: 500, trimStart: 1, muted: false, reversed: true, sourceDuration: 3 },
    { ...makePhotoClip({ id: "q" }), trimEnd: 0.01 },
  ] });
  const out = migrateProject(bad);
  expect(out.clips[0]).toMatchObject({ kind: "video", reversed: false, background: { type: "black" } });
  expect(out.clips[0].transform.scale).toBe(5);
  expect(out.clips[0].crop.x + out.clips[0].crop.w).toBeLessThanOrEqual(1 + 1e-9);
  expect(out.clips[0].crop.w).toBeGreaterThanOrEqual(CROP_MIN);
  expect(out.clips[1].background).toEqual({ type: "black" });
  expect(out.clips[2].background).toEqual({ type: "color", color: "#12ABef" });
  expect(out.clips[3]).toMatchObject({ kind: "photo", speed: 1, muted: true, reversed: false, trimStart: 0, trimEnd: PHOTO.maxSeconds, sourceDuration: PHOTO.maxSeconds });
  expect(out.clips[4].trimEnd).toBe(PHOTO.minSeconds);
  expect(migrateProject(out)).toEqual(out);
});

test("v3 → v4 adds an empty posts list; v4 keeps valid records and drops junk", () => {
  const v3 = { ...makeProject(), schemaVersion: 3 } as Record<string, unknown>;
  delete v3.posts;
  expect(migrateProject(v3)).toMatchObject({ schemaVersion: SCHEMA_VERSION, posts: [] });
  const good = { platform: "youtube", url: "https://youtu.be/abc", postedAt: "2026-10-02T10:00:00.000Z" };
  const v4 = { ...makeProject(), posts: [good, { platform: "myspace", url: "x", postedAt: "y" }, "nope", { platform: "tiktok", url: null, postedAt: "2026-10-02T11:00:00.000Z" }] };
  expect(migrateProject(v4).posts).toEqual([good, { platform: "tiktok", url: null, postedAt: "2026-10-02T11:00:00.000Z" }]);
});

test("v5 → v6 adds the look defaults", () => {
  const c = makeClip({ id: "a", sourceDuration: 4 }) as unknown as Record<string, unknown>;
  delete c.filterIntensity; delete c.adjust;
  const v5 = { ...makeProject(), schemaVersion: 5, clips: [c] } as Record<string, unknown>;
  delete v5.effects;
  const p = migrateProject(v5);
  expect(p.schemaVersion).toBe(19);
  expect(p.clips[0]).toMatchObject({ filterIntensity: 1, adjust: DEFAULT_ADJUST });
  expect(p.effects).toEqual([]);
});

test("v6 → v7 adds animation / keyframe defaults to clips and every overlay", () => {
  const c = makeClip({ id: "a", sourceDuration: 4 }) as unknown as Record<string, unknown>;
  delete c.animation; delete c.keyframes;
  const t = makeOverlay({ id: "t" }) as unknown as Record<string, unknown>; delete t.animation; delete t.keyframes;
  const s = makeSticker({ id: "s" }) as unknown as Record<string, unknown>; delete s.animation; delete s.keyframes;
  const p = migrateProject({ ...makeProject(), schemaVersion: 6, clips: [c], overlays: [t, s] });
  expect(p.schemaVersion).toBe(19);
  expect(p.clips[0]).toMatchObject({ animation: NO_CLIP_ANIMATION, keyframes: [] });
  expect(p.overlays[0]).toMatchObject({ animation: NO_OVERLAY_ANIMATION, keyframes: [] });
  expect(p.overlays[1]).toMatchObject({ animation: NO_OVERLAY_ANIMATION, keyframes: [] });
});

test("sanity pass repairs motion fields; idempotent", () => {
  const kf = (t: number) => makeKeyframe({ t });
  const bad = makeProject({
    clips: [
      { ...makeClip({ id: "a", sourceDuration: 4 }), animation: { in: { id: "fade", duration: 9 }, out: { id: "bogus", duration: 1 }, combo: null }, keyframes: [kf(2), kf(1), kf(1.01)] } as unknown as Clip,
      { ...makeClip({ id: "b", sourceDuration: 4 }), animation: { in: { id: "fade", duration: 1 }, out: null, combo: "sway" }, keyframes: "no" } as unknown as Clip,
    ],
    overlays: [
      { ...makeOverlay({ id: "t" }), animation: { in: null, out: { id: "pop", duration: 0.01 }, loop: "bogus" }, keyframes: [{ ...kf(0), x: 5 }] } as unknown as Overlay,
      { ...makeSticker({ id: "s" }), animation: { in: null, out: null, loop: "blink" }, keyframes: [kf(0), kf(1)] },
      { ...makeOverlay({ id: "cap", kind: "caption" }), animation: { in: { id: "fade", duration: 1 }, out: null, loop: "shake" }, keyframes: [kf(0)] },
    ],
  });
  const p = migrateProject(bad);
  expect(p.clips[0].animation).toEqual({ in: { id: "fade", duration: 2 }, out: null, combo: null });
  expect(p.clips[0].keyframes.map((k) => k.t)).toEqual([1, 2]);
  expect(p.clips[1].animation).toEqual({ in: null, out: null, combo: "sway" });
  expect(p.clips[1].keyframes).toEqual([]);
  expect(p.overlays[0]).toMatchObject({ animation: { in: null, out: { id: "pop", duration: 0.1 }, loop: null }, keyframes: [{ t: 0, x: 1 }] });
  expect(p.overlays[1]).toMatchObject({ animation: { loop: "blink" } });
  expect((p.overlays[1] as { keyframes: unknown[] }).keyframes).toHaveLength(2);
  expect(p.overlays[2]).toMatchObject({ kind: "caption", animation: NO_OVERLAY_ANIMATION, keyframes: [] });
  expect(migrateProject(p)).toEqual(p);
});

test("v1 chain reaches schema 9 with look, motion and speed-curve defaults", () => {
  const p = migrateProject(v1);
  expect(p.schemaVersion).toBe(19);
  expect(p.clips[0]).toMatchObject({ animation: NO_CLIP_ANIMATION, keyframes: [] });
  expect(p.clips[0]).toMatchObject({ filterIntensity: 1, adjust: DEFAULT_ADJUST });
  expect(p).toMatchObject({ exportSettings: { fps: 30, quality: "high" }, cover: null });
  expect(p.effects).toEqual([]);
});

test("new filters and transitions are kept as valid", () => {
  const p = migrateProject(makeProject({ clips: [
    makeClip({ id: "a", sourceDuration: 4, filter: "dream", transitionOut: { type: "spin", duration: 0.5 } }),
    makeClip({ id: "b", sourceDuration: 4 }),
  ] }));
  expect(p.clips[0]).toMatchObject({ filter: "dream", transitionOut: { type: "spin", duration: 0.5 } });
});

test("an unknown transition type becomes dissolve and keeps its duration", () => {
  const p = migrateProject(makeProject({ clips: [
    { ...makeClip({ id: "a", sourceDuration: 4 }), transitionOut: { type: "bogus", duration: 0.5 } } as unknown as Clip,
    makeClip({ id: "b", sourceDuration: 4 }),
  ] }));
  expect(p.clips[0].transitionOut).toEqual({ type: "dissolve", duration: 0.5 });
});

test("sanity pass repairs look fields; idempotent", () => {
  const base = makeClip({ id: "a", sourceDuration: 4 });
  const bad = makeProject({
    clips: [
      { ...base, filterIntensity: 7, adjust: { brightness: 3, sharpen: -2, bogus: 1 } } as unknown as Clip,
      { ...base, id: "b", filterIntensity: Number.NaN, adjust: "no" } as unknown as Clip,
      { ...base, id: "c", filterIntensity: -2 },
    ],
    effects: [
      makeEffect({ id: "ok", type: "glow", start: 1, end: 3, intensity: 0.5, rect: null }),
      { ...makeEffect({ id: "unk" }), type: "laser" } as unknown as EffectItem,
      makeEffect({ id: "short", start: 2, end: 2.05 }),
      makeEffect({ id: "neg", start: -3, end: -2.9 }),
      makeEffect({ id: "inten", intensity: 7 }),
      "junk" as unknown as EffectItem,
    ],
  });
  const p = migrateProject(bad);
  expect(p.clips[0].filterIntensity).toBe(1);
  expect(p.clips[0].adjust).toEqual({ ...DEFAULT_ADJUST, brightness: 1 });
  expect(p.clips[1].filterIntensity).toBe(1);
  expect(p.clips[1].adjust).toEqual(DEFAULT_ADJUST);
  expect(p.clips[2].filterIntensity).toBe(0);
  expect(p.effects.map((e) => e.id)).toEqual(["ok", "short", "neg", "inten"]);
  expect(p.effects[0]).toEqual({ id: "ok", type: "glow", start: 1, end: 3, intensity: 0.5, rect: null });
  expect(p.effects[1]).toMatchObject({ start: 2 });
  expect(p.effects[1].end - p.effects[1].start).toBeCloseTo(0.2, 9);
  expect(p.effects[2]).toMatchObject({ start: 0 });
  expect(p.effects[2].end - p.effects[2].start).toBeGreaterThanOrEqual(0.2 - 1e-9);
  expect(p.effects[3].intensity).toBe(1);
  expect(migrateProject(p)).toEqual(p);
});

test("v7 → v8 adds speedCurve: null to every clip", () => {
  const c = makeClip({ id: "a", sourceDuration: 4, speed: 2 }) as unknown as Record<string, unknown>;
  delete c.speedCurve;
  const ph = makePhotoClip({ id: "p" }) as unknown as Record<string, unknown>;
  delete ph.speedCurve;
  const p = migrateProject({ ...makeProject(), schemaVersion: 7, clips: [c, ph] });
  expect(p.schemaVersion).toBe(19);
  expect(p.clips[0]).toMatchObject({ speedCurve: null, speed: 2 });
  expect(p.clips[1]).toMatchObject({ speedCurve: null, speed: 1 });
  expect(migrateProject(v1).clips[0].speedCurve).toBeNull();
});

test("sanity pass repairs speed curves; a curve forces speed 1; photos never have one; idempotent", () => {
  const base = makeClip({ id: "a", sourceDuration: 8 });
  const steps = [{ from: 0, speed: 2 }, { from: 4, speed: 0.5 }];
  const bad = makeProject({ clips: [
    { ...base, speed: 3, speedCurve: { id: "hero", steps } },                                                             // valid curve → speed forced to 1
    { ...base, id: "b", speed: 2, speedCurve: { id: "bogus", steps } } as unknown as Clip,                                // unknown id → null, speed kept
    { ...base, id: "c", speedCurve: { id: "bullet", steps: [{ from: 4, speed: 9 }, { from: 0, speed: 0.01 }, { from: Number.NaN, speed: 1 }, { from: 2, speed: "x" }] } } as unknown as Clip,
    { ...base, id: "d", speedCurve: { id: "montage", steps: [] } },                                                       // empty → null
    { ...base, id: "e", speedCurve: "hero" } as unknown as Clip,
    { ...makePhotoClip({ id: "p" }), speedCurve: { id: "hero", steps } },                                                 // photo → null
  ] });
  const p = migrateProject(bad);
  expect(p.clips[0]).toMatchObject({ speed: 1, speedCurve: { id: "hero", steps } });
  expect(p.clips[1]).toMatchObject({ speed: 2, speedCurve: null });
  expect(p.clips[2].speedCurve).toEqual({ id: "bullet", steps: [{ from: 0, speed: 0.25 }, { from: 4, speed: 4 }] });      // sorted, clamped, junk dropped
  expect(p.clips[2].speed).toBe(1);
  expect(p.clips[3].speedCurve).toBeNull();
  expect(p.clips[4].speedCurve).toBeNull();
  expect(p.clips[5]).toMatchObject({ kind: "photo", speed: 1, speedCurve: null });
  expect(migrateProject(p)).toEqual(p);
});

test("v8 → v9 adds style, words and highlightColor to text and captions; stickers untouched", () => {
  const t = makeOverlay({ id: "t" }) as unknown as Record<string, unknown>; delete t.style; delete t.words; delete t.highlightColor;
  const c = makeOverlay({ id: "c", kind: "caption" }) as unknown as Record<string, unknown>; delete c.style; delete c.words; delete c.highlightColor;
  const s = makeSticker({ id: "s" });
  const p = migrateProject({ ...makeProject(), schemaVersion: 8, overlays: [t, c, s] });
  expect(p.schemaVersion).toBe(19);
  expect(p.overlays[0]).toMatchObject({ style: DEFAULT_TEXT_STYLE, words: [], highlightColor: null });
  expect(p.overlays[1]).toMatchObject({ style: DEFAULT_TEXT_STYLE, words: [], highlightColor: null });
  expect(p.overlays[2]).toEqual(s);
  expect(p.overlays[2]).not.toHaveProperty("style");
  expect((p.overlays[0] as TextOverlay).style).not.toBe(DEFAULT_TEXT_STYLE);
  expect(migrateProject(v1).overlays).toEqual([]);
});

test("sanity pass repairs text style, caption words and highlight; idempotent", () => {
  const words = [{ text: "b", start: 1, end: 2 }, { text: "a", start: 0, end: 1 }];
  const bad = makeProject({
    overlays: [
      { ...makeOverlay({ id: "t" }), style: { opacity: 9, letterSpacing: "x", outlineColor: "red", shadow: { color: "bad" }, glow: 3 }, words, highlightColor: "#FF0000" } as unknown as Overlay,
      { ...makeOverlay({ id: "c1", kind: "caption", text: "a b", start: 0, end: 5 }), words, highlightColor: "#00FF00" },
      { ...makeOverlay({ id: "c2", kind: "caption", text: "a b c", start: 0, end: 5 }), words, highlightColor: "green" } as unknown as Overlay,
      { ...makeOverlay({ id: "c3", kind: "caption", text: "a b", start: 0, end: 1.5 }), words, style: "junk" } as unknown as Overlay,
      makeSticker({ id: "s" }),
    ],
  });
  const p = migrateProject(bad);
  expect(p.overlays[0]).toMatchObject({
    style: { opacity: 1, letterSpacing: 0, outlineColor: null, shadow: DEFAULT_SHADOW, glow: null }, words: [], highlightColor: null,
  });
  expect(p.overlays[1]).toMatchObject({ words: [{ text: "a", start: 0, end: 1 }, { text: "b", start: 1, end: 2 }], highlightColor: "#00FF00" });
  expect(p.overlays[2]).toMatchObject({ words: [], highlightColor: null });
  expect((p.overlays[3] as TextOverlay).style).toEqual(DEFAULT_TEXT_STYLE);
  expect((p.overlays[3] as TextOverlay).words[1]).toEqual({ text: "b", start: 1, end: 1.5 });
  expect(p.overlays[4]).not.toHaveProperty("words");
  expect(migrateProject(p)).toEqual(p);
});

test("sanity pass: an unknown fontId on a text or caption becomes montserrat; valid ids untouched", () => {
  const p = migrateProject(makeProject({
    overlays: [
      { ...makeOverlay({ id: "a" }), fontId: "comicSans" } as unknown as Overlay,
      { ...makeOverlay({ id: "b", kind: "caption", text: "x", start: 0, end: 1 }), fontId: 7 } as unknown as Overlay,
      makeOverlay({ id: "c", fontId: "dancingScript" as never }),
      makeOverlay({ id: "d", fontId: "bangers" }),
    ],
  }));
  expect(p.overlays.map((o) => (o as TextOverlay).fontId)).toEqual(["montserrat", "montserrat", "dancingScript", "bangers"]);
  expect(migrateProject(p)).toEqual(p);
});

test("a caption whose length is not a number loads with finite word times; hex colours have one checker", () => {
  const words = [{ text: "Your", start: 0, end: 0.5 }, { text: "text", start: 0.5, end: 1 }];
  for (const [start, end] of [[NaN, 2], [0, NaN], [-Infinity, Infinity], [Infinity, Infinity]]) {
    const raw = { ...makeProject({ clips: [makeClip({ id: "a", sourceDuration: 5 })] }), overlays: [{ ...makeOverlay({ id: "c", kind: "caption", words }), start, end }] };
    const out = (migrateProject(raw).overlays[0] as TextOverlay).words;
    expect(out.map((x) => x.text)).toEqual(["Your", "text"]);
    for (const x of out) { expect(Number.isFinite(x.start)).toBe(true); expect(Number.isFinite(x.end)).toBe(true); }
  }
  const source = readFileSync(join(__dirname, "../migrate.ts"), "utf8");
  expect(source).not.toContain("0-9a-fA-F");
  expect(source).toContain("isHexColor(bg.color)");
});

test("v9 → v10: the single track becomes music with no fades; clips fades 0; ducking off; no markers", () => {
  const track = makeAudioTrack({ id: "a", sourceDuration: 8 }) as unknown as Record<string, unknown>;
  delete track.kind; delete track.fadeIn; delete track.fadeOut;
  const clip = makeClip({ id: "c", sourceDuration: 5 }) as unknown as Record<string, unknown>;
  delete clip.fadeIn; delete clip.fadeOut;
  const raw = { ...makeProject(), schemaVersion: 9, clips: [clip], audioTracks: [track] } as Record<string, unknown>;
  delete raw.ducking; delete raw.beatMarkers;
  const p = migrateProject(raw);
  expect(p.schemaVersion).toBe(19);
  expect(p.audioTracks[0]).toMatchObject({ id: "a", kind: "music", fadeIn: 0, fadeOut: 0, volume: 1 });
  expect(p.clips[0]).toMatchObject({ fadeIn: 0, fadeOut: 0 });
  expect(p.ducking).toBe(false);
  expect(p.beatMarkers).toEqual([]);
  expect(migrateProject(p)).toEqual(p);
});

test("sanity pass repairs audio kinds, fades, track count, clip fades, ducking and markers; idempotent", () => {
  const tracks = Array.from({ length: 14 }, (_, i) => makeAudioTrack({ id: `a${i}`, sourceDuration: 5 }));
  tracks[0] = { ...tracks[0], kind: "podcast", fadeIn: 9, fadeOut: -2 } as never;
  tracks[1] = { ...tracks[1], kind: "sfx", fadeIn: NaN, fadeOut: "x" } as never;
  tracks[2] = { ...tracks[2], kind: "voice", fadeIn: 1.5, fadeOut: 2 };
  const photo = makePhotoClip({ id: "ph" });
  const bad = makeProject({
    clips: [{ ...makeClip({ id: "c", sourceDuration: 5 }), fadeIn: 7, fadeOut: NaN } as never, { ...photo, fadeIn: 2, fadeOut: 1 }],
    audioTracks: tracks, ducking: "yes" as never, beatMarkers: [3, 1, 1.01, NaN, -4, 2] as never,
  });
  const p = migrateProject(bad);
  expect(p.audioTracks).toHaveLength(12);
  expect(p.audioTracks.map((t) => t.id)).toEqual(tracks.slice(0, 12).map((t) => t.id));
  expect(p.audioTracks[0]).toMatchObject({ kind: "music", fadeIn: 5, fadeOut: 0 });
  expect(p.audioTracks[1]).toMatchObject({ kind: "sfx", fadeIn: 0, fadeOut: 0 });
  expect(p.audioTracks[2]).toMatchObject({ kind: "voice", fadeIn: 1.5, fadeOut: 2 });
  expect(p.clips[0]).toMatchObject({ fadeIn: 5, fadeOut: 0 });
  expect(p.clips[1]).toMatchObject({ kind: "photo", fadeIn: 0, fadeOut: 0 });
  expect(p.ducking).toBe(false);
  expect(p.beatMarkers).toEqual([1, 2, 3]);
  expect(migrateProject({ ...bad, ducking: true }).ducking).toBe(true);
  expect(migrateProject(p)).toEqual(p);
});

test("an audio track that is an array (or not an object at all) is dropped", () => {
  const good = makeAudioTrack({ id: "ok", sourceDuration: 5 });
  const p = migrateProject({ ...makeProject(), audioTracks: [[], ["x"], null, 3, "t", good] as never });
  expect(p.audioTracks.map((t) => t.id)).toEqual(["ok"]);
});

test("a v1 file reaches v18 with the audio defaults", () => {
  const p = migrateProject(v1);
  expect(p).toMatchObject({ schemaVersion: 19, ducking: false, beatMarkers: [], audioTracks: [] });
  expect(p.clips[0]).toMatchObject({ fadeIn: 0, fadeOut: 0 });
});

describe("v11 — layers, opacity, mask", () => {
  const raw = (over: Record<string, unknown> = {}) => ({ ...makeProject(), schemaVersion: 10, ...over }) as Record<string, unknown>;
  const strip = (c: Clip) => { const { opacity: _o, mask: _m, ...rest } = c; return rest; };

  test("v10 gets opacity 1, mask none and no layers", () => {
    const p = migrateProject(raw({ clips: [strip(makeClip({ id: "a", sourceDuration: 5 }))], layers: undefined }));
    expect(p.schemaVersion).toBe(19);
    expect(p.layers).toEqual([]);
    expect(p.clips[0]).toMatchObject({ opacity: 1, mask: "none" });
  });

  test("opacity is clamped (non-finite → 1) and an unknown mask becomes none", () => {
    const c = (id: string, opacity: unknown, mask: unknown) => ({ ...makeClip({ id, sourceDuration: 5 }), opacity, mask });
    const p = migrateProject(raw({ clips: [c("a", 4, "circle"), c("b", -1, "star"), c("c", NaN, 7), c("d", "x", "rounded")] }));
    expect(p.clips.map((x) => [x.opacity, x.mask])).toEqual([[1, "circle"], [0, "none"], [1, "none"], [1, "rounded"]]);
  });

  test("layers go through the clip repairs, a finite start >= 0 and no transition", () => {
    const l = { ...makeLayer({ id: "l1", sourceDuration: 5, start: -2 }), speed: 99, opacity: 3, mask: "x", transitionOut: { type: "fade", duration: 1 } };
    const l2 = { ...makeLayer({ id: "l2", sourceDuration: 5 }), start: NaN };
    const l3 = { ...makeLayer({ id: "l3", sourceDuration: 5 }), start: 4 };
    const p = migrateProject(raw({ layers: [l, l2, l3] }));
    expect(p.layers[0]).toMatchObject({ id: "l1", start: 0, speed: 1, opacity: 1, mask: "none", transitionOut: { type: "none", duration: 0 } });
    expect(p.layers[1].start).toBe(0);
    expect(p.layers[2]).toMatchObject({ start: 4, transform: DEFAULT_TRANSFORM });
  });

  test("layers with a duplicate id (of a layer or a main clip) are dropped, junk entries too, and at most 8 stay", () => {
    const clips = [makeClip({ id: "c", sourceDuration: 5 })];
    const layers = [makeLayer({ id: "a", sourceDuration: 5 }), makeLayer({ id: "a", sourceDuration: 5 }), makeLayer({ id: "c", sourceDuration: 5 }), null, 4, [], "s"];
    expect(migrateProject(raw({ clips, layers })).layers.map((l) => l.id)).toEqual(["a"]);
    const many = Array.from({ length: 12 }, (_, i) => makeLayer({ id: `l${i}`, sourceDuration: 5 }));
    expect(migrateProject(raw({ layers: many })).layers.map((l) => l.id)).toEqual(many.slice(0, 8).map((l) => l.id));
  });

  test("three overlapping video layers are NOT dropped by the sanity pass", () => {
    const layers = [0, 1, 2].map((i) => makeLayer({ id: `l${i}`, sourceDuration: 5, start: 0 }));
    expect(migrateProject(raw({ layers })).layers).toHaveLength(3);
  });

  test("a photo layer is forced to the photo rules", () => {
    const ph = { ...makePhotoClip({ id: "p" }), start: 1, speed: 3, reversed: true };
    expect(migrateProject(raw({ layers: [ph] })).layers[0]).toMatchObject({ kind: "photo", speed: 1, reversed: false, muted: true, start: 1 });
  });

  test("is idempotent", () => {
    const once = migrateProject(raw({ layers: [{ ...makeLayer({ id: "l", sourceDuration: 5, start: 2 }), opacity: 0.4, mask: "circle" }] }));
    expect(migrateProject(JSON.parse(JSON.stringify(once)))).toEqual(once);
  });

  test("a v1 file reaches v12 with no layers", () => {
    expect(migrateProject(v1).layers).toEqual([]);
  });
});

describe("v11 to v12 (blend, green screen, region effects)", () => {
  const raw = (over: Record<string, unknown> = {}) => ({ ...makeProject(), schemaVersion: 11, ...over }) as Record<string, unknown>;
  const strip = (c: unknown) => { const o = { ...(c as Record<string, unknown>) }; delete o.blend; delete o.chroma; return o; };
  const key = { color: "#00FF00", strength: 0.4 };

  test("adds the defaults to clips, layers and effects", () => {
    const eff = { id: "e", type: "shake", start: 0, end: 2, intensity: 0.5 };
    const p = migrateProject(raw({ clips: [strip(makeClip({ id: "c", sourceDuration: 5 }))], layers: [strip(makeLayer({ id: "l", sourceDuration: 5 }))], effects: [eff] }));
    expect(p.schemaVersion).toBe(19);
    expect(p.clips[0]).toMatchObject({ blend: "normal", chroma: null });
    expect(p.layers[0]).toMatchObject({ blend: "normal", chroma: null });
    expect(p.effects[0].rect).toBeNull();
  });

  test("a layer keeps its blend and key; an unknown blend becomes normal", () => {
    const layers = [{ ...makeLayer({ id: "a", sourceDuration: 5 }), blend: "screen", chroma: key }, { ...makeLayer({ id: "b", sourceDuration: 5 }), blend: "dodge" }];
    const p = migrateProject(raw({ layers }));
    expect(p.layers[0]).toMatchObject({ blend: "screen", chroma: key });
    expect(p.layers[1].blend).toBe("normal");
  });

  test("a main clip is forced to normal but keeps its green screen", () => {
    const p = migrateProject(raw({ clips: [{ ...makeClip({ id: "c", sourceDuration: 5 }), blend: "multiply", chroma: key }] }));
    expect(p.clips[0]).toMatchObject({ blend: "normal", chroma: key });
  });

  test("bad chroma colour becomes null; strength is clamped", () => {
    const layers = [{ ...makeLayer({ id: "a", sourceDuration: 5 }), chroma: { color: "green", strength: 1 } },
      { ...makeLayer({ id: "b", sourceDuration: 5 }), chroma: { color: "#0000FF", strength: 9 } }];
    const p = migrateProject(raw({ layers }));
    expect(p.layers[0].chroma).toBeNull();
    expect(p.layers[1].chroma).toEqual({ color: "#0000FF", strength: 1 });
  });

  test("effects: a region without a rect gets the default; a rect on another type is removed; a rect is clamped", () => {
    const base = { start: 0, end: 2, intensity: 0.5 };
    const effects = [
      { id: "a", type: "blurBox", ...base },
      { id: "b", type: "shake", ...base, rect: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } },
      { id: "c", type: "mosaicBox", ...base, rect: { x: 0.9, y: 0.9, w: 0.5, h: 0.01 } },
      { id: "d", type: "blurBox", ...base, rect: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 } },
    ];
    const p = migrateProject(raw({ effects }));
    expect(p.effects[0].rect).toEqual({ x: 0.3, y: 0.4, w: 0.4, h: 0.2 });
    expect(p.effects[1].rect).toBeNull();
    expect(p.effects[2].rect).toMatchObject({ w: 0.5, h: 0.05 });
    expect(p.effects[2].rect!.x).toBeCloseTo(0.5, 12);
    expect(p.effects[2].rect!.y).toBeCloseTo(0.9, 12);
    expect(p.effects[3].rect).toEqual({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 });
  });

  test("is idempotent", () => {
    const once = migrateProject(raw({
      layers: [{ ...makeLayer({ id: "a", sourceDuration: 5 }), blend: "overlay", chroma: key }],
      effects: [{ id: "a", type: "blurBox", start: 0, end: 2, intensity: 0.5 }],
    }));
    expect(migrateProject(JSON.parse(JSON.stringify(once)))).toEqual(once);
  });

  test("a v1 file reaches v18 with defaults", () => {
    expect(migrateProject(v1).clips[0]).toMatchObject({ blend: "normal", chroma: null });
  });
});

test("v12 → v13 adds export settings and no cover; the sanity pass repairs both; idempotent", () => {
  const clips = [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 6, speed: 2 })];   // 4 + 6 / 2 = 7 s
  const v12 = { ...makeProject({ clips }), schemaVersion: 12 } as Record<string, unknown>;
  delete v12.exportSettings; delete v12.cover;
  expect(migrateProject(v12)).toMatchObject({ schemaVersion: 19, exportSettings: { fps: 30, quality: "high" }, cover: null });

  const bad = migrateProject({ ...makeProject({ clips }), exportSettings: { fps: 25, quality: "small" }, cover: { time: 99, title: "  " + "t".repeat(50) } });
  expect(bad.exportSettings).toEqual({ fps: 30, quality: "small" });
  expect(bad.cover).toEqual({ time: 7, title: "t".repeat(40) });
  expect(migrateProject(JSON.parse(JSON.stringify(bad)))).toEqual(bad);

  expect(migrateProject({ ...makeProject({ clips }), cover: { time: NaN, title: "x" } }).cover).toBeNull();
  expect(migrateProject({ ...makeProject({ clips }), cover: "first" }).cover).toBeNull();
  expect(migrateProject({ ...makeProject(), cover: { time: 3, title: "x" } }).cover).toEqual({ time: 0, title: "x" });   // no clips → 0
});

test("v13 → v14 keeps the aspect ratio; the sanity pass turns an unknown one into 9:16; idempotent", () => {
  const clips = [makeClip({ id: "a", sourceDuration: 4, width: 1920, height: 1080 })];
  for (const id of ["9:16", "1:1", "16:9"] as const) {
    const v13 = { ...makeProject({ clips, aspectRatio: id }), schemaVersion: 13 };
    expect(migrateProject(v13)).toMatchObject({ schemaVersion: 19, aspectRatio: id });
  }
  for (const id of ["auto", "3:2", "2:3", "4:3", "3:4", "21:9"] as const) {
    const p = migrateProject(makeProject({ clips, aspectRatio: id }));
    expect(p.aspectRatio).toBe(id);
    expect(migrateProject(JSON.parse(JSON.stringify(p)))).toEqual(p);
  }
  for (const bad of ["4:5", "", "Auto", 16 / 9, null, undefined, { w: 9, h: 16 }]) {
    expect(migrateProject({ ...makeProject({ clips }), aspectRatio: bad }).aspectRatio).toBe("9:16");
  }
  expect(SCHEMA_VERSION).toBe(19);
});

test("PROOF v14 → v15: the migration only ADDS the two box defaults to texts and captions — every stored value stays, stickers are untouched", () => {
  const now = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 8 })], overlays: [
    makeOverlay({ id: "t1", text: "Plain", start: 0, end: 3 }),
    makeOverlay({ id: "t2", text: "Styled", start: 1, end: 4, fontId: "anton", color: "#FFE14D", outline: true, background: { color: "#112233", opacity: 0.4 }, rotation: 12, scale: 1.4,
      animation: { in: { id: "pop", duration: 0.4 }, out: null, loop: "pulse" },
      keyframes: [makeKeyframe({ t: 0, x: 0.2, y: 0.3 }), makeKeyframe({ t: 1, x: 0.6, y: 0.7, scale: 2 })],
      style: { ...DEFAULT_TEXT_STYLE, opacity: 0.8, letterSpacing: 0.1, lineSpacing: 1.5, outlineColor: "#FF2D7A", outlineWidth: 2.2,
        shadow: { color: "#000000", opacity: 0.6, distance: 0.06, blur: 0.1 }, glow: { color: "#FFFFFF", size: 0.25 } } }),
    makeOverlay({ id: "c1", kind: "caption", text: "Hello there", start: 2, end: 4, outline: false, background: { color: "#000000", opacity: 0.6 },
      words: [{ text: "Hello", start: 0, end: 1 }, { text: "there", start: 1, end: 2 }], highlightColor: "#FFE14D" }),
    makeSticker({ id: "s1", emoji: "🔥", start: 0, end: 2 }),
    makeSticker({ id: "s2", emoji: null, shape: "heart", color: "#C8102E", start: 0, end: 2 }),
  ] });
  expect(migrateProject(now)).toEqual(now);                       // the fixture is a clean project of the current version
  // The same project as schema 14 stored it: no box fields, the old number.
  const v14 = JSON.parse(JSON.stringify(now)) as { schemaVersion: number; overlays: { kind: string; style?: Record<string, unknown> }[] };
  v14.schemaVersion = 14;
  for (const o of v14.overlays) if (o.style) { delete o.style.boxPadding; delete o.style.boxCorner; }
  const frozen = JSON.stringify(v14);
  const p = migrateProject(v14);
  expect(JSON.stringify(v14)).toBe(frozen);                       // the stored object is not mutated
  expect(p).toEqual(now);                                         // nothing but the number and the two defaults differs from the file
  expect(p.schemaVersion).toBe(19);
  p.overlays.forEach((o, i) => {
    if (o.kind === "sticker") { expect(o).toEqual(v14.overlays[i]); expect(o).not.toHaveProperty("style"); return; }
    const { boxPadding, boxCorner, ...stored } = o.style;
    expect(stored).toEqual(v14.overlays[i].style);                // the seven v14 fields, value for value
    expect([boxPadding, boxCorner]).toEqual([0.25, "rounded"]);
  });
  expect(migrateProject(p)).toEqual(p);
});

test("sanity pass: a bad box padding or corner is repaired, on texts and on captions", () => {
  const bad = makeProject({ overlays: [
    { ...makeOverlay({ id: "t" }), style: { ...DEFAULT_TEXT_STYLE, boxPadding: 7, boxCorner: "pill" } } as unknown as Overlay,
    { ...makeOverlay({ id: "c", kind: "caption", text: "x", start: 0, end: 1 }), style: { ...DEFAULT_TEXT_STYLE, boxPadding: "wide", boxCorner: "square" } } as unknown as Overlay,
  ] });
  const p = migrateProject(bad);
  expect((p.overlays[0] as TextOverlay).style).toMatchObject({ boxPadding: 0.6, boxCorner: "rounded" });
  expect((p.overlays[1] as TextOverlay).style).toMatchObject({ boxPadding: 0.25, boxCorner: "square" });
  expect(migrateProject(p)).toEqual(p);
});

test("the thirteen new shapes are known shapes: a sticker with one loads as it is; an unknown shape still falls back or is dropped", () => {
  const fresh = ["arrowCurved", "arrowDouble", "bubbleRound", "bubbleSquare", "bubbleThought", "badgeSeal", "badgeRibbon", "banner", "sparkle", "burst", "frameRounded", "ring", "brackets"] as const;
  const p = makeProject({ overlays: [...fresh.map((shape) => makeSticker({ id: shape, emoji: null, shape })), { ...makeSticker({ id: "x", emoji: null }), shape: "blob" } as unknown as Overlay] });
  const loaded = migrateProject(p);
  expect(loaded.overlays.map((o) => (o as { shape: string | null }).shape)).toEqual([...fresh]);
  expect(migrateProject(loaded)).toEqual(loaded);
});

test("PROOF v15 → v16: the migration changes the number and nothing else — every filter, transition and effect a v15 project could hold is kept as stored", () => {
  // One clip per old filter (strengths differ), each cut with an old transition; one effect per old effect type.
  const oldFilters = FILTER_IDS.slice(0, 20), oldTransitions = TRANSITION_TYPES.slice(1, 11), oldEffects = EFFECT_IDS.slice(0, 12);
  const clips = oldFilters.map((f, i) => makeClip({ id: `c${i}`, sourceDuration: 4, filter: f === "none" ? null : f, filterIntensity: (i + 1) / 20,
    transitionOut: i < oldFilters.length - 1 ? { type: oldTransitions[i % oldTransitions.length], duration: 0.5 } : { type: "none", duration: 0 } }));
  const effects = oldEffects.map((type, i) => makeEffect({ id: `e${i}`, type, start: i, end: i + 1.5, intensity: 0.1 + i * 0.07 }));
  const now = makeProject({ clips, effects });
  expect(migrateProject(now)).toEqual(now);                       // the fixture is a clean project of the current version
  const v15 = JSON.parse(JSON.stringify(now)) as { schemaVersion: number };
  v15.schemaVersion = 15;
  const frozen = JSON.stringify(v15);
  const p = migrateProject(v15);
  expect(JSON.stringify(v15)).toBe(frozen);                       // the stored object is not mutated
  expect({ ...p, schemaVersion: 15 }).toEqual(v15);               // nothing but the number differs from the file
  expect(p.schemaVersion).toBe(19);
  expect(migrateProject(p)).toEqual(p);
});

test("the new transition and effect ids survive the sanity pass; an id nobody knows is still repaired", () => {
  const p = migrateProject(makeProject({
    clips: [makeClip({ id: "a", sourceDuration: 4, transitionOut: { type: "wipeClock", duration: 0.6 } }), makeClip({ id: "b", sourceDuration: 4, transitionOut: { type: "flashWhite", duration: 0.4 } }),
      { ...makeClip({ id: "c", sourceDuration: 4 }), transitionOut: { type: "swirl", duration: 0.5 } } as unknown as Clip, makeClip({ id: "d", sourceDuration: 4 })],
    effects: [makeEffect({ id: "e1", type: "heartbeat" }), makeEffect({ id: "e2", type: "strobe" }), { ...makeEffect({ id: "e3" }), type: "sparkle" } as unknown as EffectItem],
  }));
  expect(p.clips.map((c) => c.transitionOut)).toEqual([{ type: "wipeClock", duration: 0.6 }, { type: "flashWhite", duration: 0.4 }, { type: "dissolve", duration: 0.5 }, { type: "none", duration: 0 }]);
  expect(p.effects.map((e) => e.type)).toEqual(["heartbeat", "strobe"]);
});

test("PROOF v16 → v17: the migration changes the number and nothing else — photos, Combos, edges, keyframes, layers, crops and masks are kept as stored, and no clip gains a field", () => {
  // One photo per Combo (the four zoom / pan ones are what the Motion tool later shows as its own), one with In / Out, one with pins, a video with a Combo.
  const combos = ANIM_COMBO_IDS.map((combo, i) => makePhotoClip({ id: `p${i}`, seconds: 2 + i, animation: { in: null, out: null, combo } }));
  const edged = makePhotoClip({ id: "pe", animation: { in: { id: "fade", duration: 0.5 }, out: { id: "zoomOut", duration: 0.4 }, combo: null } });
  const pinned = makePhotoClip({ id: "pk", seconds: 4, keyframes: [makeKeyframe({ t: 0 }), makeKeyframe({ t: 3, scale: 1.4, x: 0.1 })] });
  const video = makeClip({ id: "v", sourceDuration: 5, animation: { in: null, out: null, combo: "sway" } });
  // Layers placed the way a collage would place them, made by hand in v16.
  const layers: LayerClip[] = [
    { ...makePhotoClip({ id: "l1", seconds: 3, transform: { scale: 0.5, x: -0.25, y: 0, rotation: 0, flipH: false, flipV: false }, crop: { x: 0.25, y: 0, w: 0.5, h: 1 }, mask: "rounded" }), start: 1 },
    makeLayer({ id: "l2", sourceDuration: 4, start: 2, mask: "circle", blend: "screen" }),
  ];
  const now = makeProject({ clips: [...combos, edged, pinned, video], layers });
  expect(migrateProject(now)).toEqual(now);                       // the fixture is a clean v17 project
  const v16 = JSON.parse(JSON.stringify(now)) as { schemaVersion: number };
  v16.schemaVersion = 16;
  const frozen = JSON.stringify(v16);
  const p = migrateProject(v16);
  expect(JSON.stringify(v16)).toBe(frozen);                       // the stored object is not mutated
  expect({ ...p, schemaVersion: 16 }).toEqual(v16);               // nothing but the number differs from the file
  expect(p.schemaVersion).toBe(19);
  // `toEqual` does not see a key that holds undefined: check that the keys themselves are absent.
  for (const c of [...p.clips, ...p.layers]) { expect("motion" in c).toBe(false); expect("collage" in c).toBe(false); }
  expect(migrateProject(p)).toEqual(p);
});

test("the sanity pass keeps a usable Motion and collage tag, and removes one that cannot be used", () => {
  const tag = { group: "g", layout: "grid4", cell: 3, border: 0.02, corner: 1, aspect: 0.5625 };
  const p = migrateProject(makeProject({
    clips: [
      { ...makePhotoClip({ id: "ok" }), motion: { id: "panUp", strength: 0.8 } },
      { ...makePhotoClip({ id: "wild" }), motion: { id: "panUp", strength: 7 } },
      { ...makePhotoClip({ id: "unknown" }), motion: { id: "spiral", strength: 0.5 } } as unknown as Clip,
      { ...makeClip({ id: "video", sourceDuration: 4 }), motion: { id: "zoomIn", strength: 0.5 } },
      { ...makePhotoClip({ id: "combo", animation: { in: null, out: null, combo: "sway" } }), motion: { id: "zoomIn", strength: 0.5 } },
      { ...makePhotoClip({ id: "main" }), collage: tag } as unknown as Clip,
    ],
    layers: [
      { ...makePhotoClip({ id: "cell" }), start: 0, collage: tag } as unknown as LayerClip,
      { ...makePhotoClip({ id: "bad" }), start: 0, collage: { ...tag, cell: 4 } } as unknown as LayerClip,
      { ...makePhotoClip({ id: "junk" }), start: 0, collage: { ...tag, layout: "spiral" } } as unknown as LayerClip,
    ],
  }));
  const clip = (id: string) => [...p.clips, ...p.layers].find((c) => c.id === id)!;
  expect(clip("ok").motion).toEqual({ id: "panUp", strength: 0.8 });
  expect(clip("wild").motion).toEqual({ id: "panUp", strength: 1 });
  for (const id of ["unknown", "video", "combo"]) expect("motion" in clip(id)).toBe(false);
  expect(clip("cell").collage).toEqual(tag);
  for (const id of ["main", "bad", "junk"]) expect("collage" in clip(id)).toBe(false);
  expect(migrateProject(p)).toEqual(p);
});

test("PROOF v17 → v18: the migration changes the number and nothing else — music, voice-overs, sound effects, trims, fades, ducking, beats and muted clips are kept as stored, and no track gains a field", () => {
  const now = makeProject({
    clips: [makeClip({ id: "a", sourceDuration: 8, muted: true, volume: 1.4, fadeIn: 0.5 }), makeClip({ id: "b", sourceDuration: 6, fadeOut: 1 })],
    layers: [makeLayer({ id: "L", sourceDuration: 4, start: 2, volume: 0.5 })],
    audioTracks: [
      makeAudioTrack({ id: "m1", sourceDuration: 30, trimStart: 2.5, trimEnd: 10, start: 0, volume: 1.6, fadeIn: 1, fadeOut: 2 }),
      makeAudioTrack({ id: "m2", sourceDuration: 30, trimStart: 10, trimEnd: 21.125, start: 7.5, fadeOut: 2 }),          // the second piece of a split
      makeAudioTrack({ id: "v1", sourceDuration: 6, kind: "voice", start: 3, title: "Voice-over" }),
      makeAudioTrack({ id: "s1", sourceDuration: 1, kind: "sfx", start: 4.25, trimEnd: 0.4, volume: 0 }),
    ],
    ducking: true, beatMarkers: [1, 2.5, 9.75],
  });
  expect(migrateProject(now)).toEqual(now);                       // the fixture is a clean v18 project
  const v17 = JSON.parse(JSON.stringify(now)) as { schemaVersion: number };
  v17.schemaVersion = 17;
  const frozen = JSON.stringify(v17);
  const p = migrateProject(v17);
  expect(JSON.stringify(v17)).toBe(frozen);                       // the stored object is not mutated
  expect({ ...p, schemaVersion: 17 }).toEqual(v17);               // nothing but the number differs from the file
  expect(p.schemaVersion).toBe(19);
  // `toEqual` does not see a key that holds undefined: check that the key itself is absent.
  for (const t of p.audioTracks) expect("sound" in t).toBe(false);
  expect(migrateProject(p)).toEqual(p);
});

test("the sanity pass keeps a usable sound setting and removes one that cannot be used", () => {
  const withSound = (id: string, sound: unknown) => ({ ...makeAudioTrack({ id, sourceDuration: 5 }), sound }) as unknown as AudioTrack;
  const p = migrateProject(makeProject({ audioTracks: [
    withSound("ok", { voice: "deep", strength: 0.8, pitch: 2, eq: "warm", level: true }),
    withSound("wild", { voice: "echo", strength: 7, pitch: 99, eq: null, level: false }),
    withSound("unknown", { voice: "alien", strength: 0.5, pitch: 0, eq: "loud", level: false }),
    withSound("neutral", { voice: null, strength: 0.5, pitch: 0, eq: null, level: false }),
    withSound("junk", "deep"),
    withSound("nothing", null),
  ] }));
  const track = (id: string) => p.audioTracks.find((t) => t.id === id)!;
  expect(track("ok").sound).toEqual({ voice: "deep", strength: 0.8, pitch: 2, eq: "warm", level: true });
  expect(track("wild").sound).toEqual({ voice: "echo", strength: 1, pitch: 12, eq: null, level: false });
  for (const id of ["unknown", "neutral", "junk", "nothing"]) expect("sound" in track(id)).toBe(false);
  expect(migrateProject(p)).toEqual(p);
});

test("PROOF v18 → v19: the migration changes the number and nothing else — sound settings, a stepped speed curve, music, a split piece, ducking and beats are kept as stored, and no setting gains a noise key", () => {
  const base = makeProject({
    clips: [makeClip({ id: "a", sourceDuration: 8 }), makeClip({ id: "b", sourceDuration: 6, muted: true })],
    audioTracks: [
      { ...makeAudioTrack({ id: "v1", sourceDuration: 6, kind: "voice", start: 3, title: "Voice-over" }), sound: { voice: "deep", strength: 0.8, pitch: -3, eq: null, level: false } },
      { ...makeAudioTrack({ id: "s1", sourceDuration: 4, kind: "sfx", start: 1.5, title: "Clip sound" }), sound: { voice: null, strength: 0.5, pitch: 0, eq: "warm", level: true } },
      makeAudioTrack({ id: "m1", sourceDuration: 30, trimStart: 2.5, trimEnd: 10, volume: 1.6, fadeIn: 1, fadeOut: 2 }),
      makeAudioTrack({ id: "m2", sourceDuration: 30, trimStart: 10, trimEnd: 21.125, start: 7.5 }),
    ] as AudioTrack[],
    ducking: true, beatMarkers: [1, 2.5, 9.75],
  });
  const now = setClipSpeedCurve(base, "a", "hero");                 // today's stepped preset: eight steps
  expect(now.clips[0].speedCurve?.steps).toHaveLength(8);
  expect(migrateProject(now)).toEqual(now);                         // the fixture is a clean v19 project
  const v18 = JSON.parse(JSON.stringify(now)) as { schemaVersion: number };
  v18.schemaVersion = 18;
  const frozen = JSON.stringify(v18);
  const p = migrateProject(v18);
  expect(JSON.stringify(v18)).toBe(frozen);                         // the stored object is not mutated
  expect({ ...p, schemaVersion: 18 }).toEqual(v18);                 // nothing but the number differs from the file
  expect(p.schemaVersion).toBe(19);
  for (const t of p.audioTracks) if (t.sound) expect("noise" in t.sound).toBe(false);
  expect(p.clips[0].speedCurve).toEqual({ id: "hero", steps: [1, 2, 3, 0.5, 0.5, 3, 2, 1].map((speed, i) => ({ from: i, speed })) });
  expect(migrateProject(p)).toEqual(p);
});

test("the sanity pass keeps a usable noise strength and removes one that cannot be used", () => {
  const withSound = (id: string, sound: unknown) => ({ ...makeAudioTrack({ id, sourceDuration: 5 }), sound }) as unknown as AudioTrack;
  const p = migrateProject(makeProject({ audioTracks: [
    withSound("ok", { voice: null, strength: 0.5, pitch: 0, eq: null, level: false, noise: 0.75 }),
    withSound("wild", { voice: "echo", strength: 0.5, pitch: 0, eq: null, level: false, noise: 9 }),
    withSound("junk", { voice: "echo", strength: 0.5, pitch: 0, eq: null, level: false, noise: "loud" }),
    withSound("only-junk", { voice: null, strength: 0.5, pitch: 0, eq: null, level: false, noise: null }),
  ] }));
  const track = (id: string) => p.audioTracks.find((t) => t.id === id)!;
  expect(track("ok").sound).toEqual({ voice: null, strength: 0.5, pitch: 0, eq: null, level: false, noise: 0.75 });
  expect(track("wild").sound?.noise).toBe(1);
  expect("noise" in track("junk").sound!).toBe(false);
  expect("sound" in track("only-junk")).toBe(false);
  expect(migrateProject(p)).toEqual(p);
});
