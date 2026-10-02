import { migrateProject } from "../migrate";
import { FILTER_IDS, makeClip, makeProject, makeSticker, SCHEMA_VERSION } from "../types";

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
  const v2 = { ...v1, schemaVersion: 2, overlays: [], audioTracks: [], clips: [{ ...v1.clips[0], muted: false, speed: 7, filter: "sepia", transitionOut: { type: "wipe", duration: 2 } }] };
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
      { ...makeClip({ id: "a", sourceDuration: 4 }), filter: "sepia", speed: 9, transitionOut: { type: "spin", duration: 0.5 } },
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
  expect(p.clips[0]).toMatchObject({ filter: null, speed: 1, transitionOut: { type: "none", duration: 0 } });
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

test("v3 → v4 adds an empty posts list; v4 keeps valid records and drops junk", () => {
  const v3 = { ...makeProject(), schemaVersion: 3 } as Record<string, unknown>;
  delete v3.posts;
  expect(migrateProject(v3)).toMatchObject({ schemaVersion: 4, posts: [] });
  const good = { platform: "youtube", url: "https://youtu.be/abc", postedAt: "2026-10-02T10:00:00.000Z" };
  const v4 = { ...makeProject(), posts: [good, { platform: "myspace", url: "x", postedAt: "y" }, "nope", { platform: "tiktok", url: null, postedAt: "2026-10-02T11:00:00.000Z" }] };
  expect(migrateProject(v4).posts).toEqual([good, { platform: "tiktok", url: null, postedAt: "2026-10-02T11:00:00.000Z" }]);
});
