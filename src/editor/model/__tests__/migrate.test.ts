import { migrateProject } from "../migrate";
import { makeClip, makeProject, SCHEMA_VERSION } from "../types";

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

test("v2 passes through unchanged (idempotent)", () => {
  const p = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 })] });
  expect(migrateProject(p)).toEqual(p);
});

test("rejects newer versions and malformed files with readable errors", () => {
  expect(() => migrateProject({ ...v1, schemaVersion: 3 })).toThrow(/newer version of Clipy/);
  expect(() => migrateProject({ schemaVersion: 1 })).toThrow(/missing required fields/);
  expect(() => migrateProject("nope")).toThrow(/missing required fields/);
});
