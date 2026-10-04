import { readFileSync } from "fs";
import { join } from "path";
import { migrateProject } from "../migrate";
import { CROP_MIN, DEFAULT_ADJUST, DEFAULT_SHADOW, DEFAULT_TEXT_STYLE, DEFAULT_TRANSFORM, FILTER_IDS, FULL_CROP, makeAudioTrack, makeClip, makeEffect, makeKeyframe, makeOverlay, makePhotoClip, makeProject, makeSticker, NO_CLIP_ANIMATION, NO_OVERLAY_ANIMATION, PHOTO, SCHEMA_VERSION, type Clip, type EffectItem, type Overlay, type TextOverlay } from "../types";

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
  expect(p.schemaVersion).toBe(10);
  expect(p.clips[0]).toMatchObject({ filterIntensity: 1, adjust: DEFAULT_ADJUST });
  expect(p.effects).toEqual([]);
});

test("v6 → v7 adds animation / keyframe defaults to clips and every overlay", () => {
  const c = makeClip({ id: "a", sourceDuration: 4 }) as unknown as Record<string, unknown>;
  delete c.animation; delete c.keyframes;
  const t = makeOverlay({ id: "t" }) as unknown as Record<string, unknown>; delete t.animation; delete t.keyframes;
  const s = makeSticker({ id: "s" }) as unknown as Record<string, unknown>; delete s.animation; delete s.keyframes;
  const p = migrateProject({ ...makeProject(), schemaVersion: 6, clips: [c], overlays: [t, s] });
  expect(p.schemaVersion).toBe(10);
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
  expect(p.schemaVersion).toBe(10);
  expect(p.clips[0]).toMatchObject({ animation: NO_CLIP_ANIMATION, keyframes: [] });
  expect(p.clips[0]).toMatchObject({ filterIntensity: 1, adjust: DEFAULT_ADJUST });
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
      makeEffect({ id: "ok", type: "glow", start: 1, end: 3, intensity: 0.5 }),
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
  expect(p.effects[0]).toEqual({ id: "ok", type: "glow", start: 1, end: 3, intensity: 0.5 });
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
  expect(p.schemaVersion).toBe(10);
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
  expect(p.schemaVersion).toBe(10);
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
  expect(p.schemaVersion).toBe(10);
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

test("a v1 file reaches v10 with the audio defaults", () => {
  const p = migrateProject(v1);
  expect(p).toMatchObject({ schemaVersion: 10, ducking: false, beatMarkers: [], audioTracks: [] });
  expect(p.clips[0]).toMatchObject({ fadeIn: 0, fadeOut: 0 });
});
