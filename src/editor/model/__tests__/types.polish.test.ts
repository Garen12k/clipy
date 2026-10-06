import { clampCover, clampCoverTitle, clampExportSettings, COVER_LIMITS, DEFAULT_EXPORT_SETTINGS, EXPORT_FPS, EXPORT_QUALITIES, makeProject, SCHEMA_VERSION } from "../types";

test("schema is v15 and a new project has the polish defaults", () => {
  expect(SCHEMA_VERSION).toBe(15);
  expect(EXPORT_FPS).toEqual([24, 30, 60]);
  expect(EXPORT_QUALITIES).toEqual(["high", "small"]);
  expect(COVER_LIMITS.titleMax).toBe(40);
  const p = makeProject();
  expect(p).toMatchObject({ schemaVersion: 15, exportSettings: { fps: 30, quality: "high" }, cover: null });
  expect(p.exportSettings).not.toBe(DEFAULT_EXPORT_SETTINGS);   // its own object
});

test("clampExportSettings keeps known values and repairs the rest", () => {
  expect(clampExportSettings({ fps: 60, quality: "small" })).toEqual({ fps: 60, quality: "small" });
  expect(clampExportSettings({ fps: 24, quality: "ultra", extra: 1 })).toEqual({ fps: 24, quality: "high" });
  expect(clampExportSettings({ fps: 25, quality: "small" })).toEqual({ fps: 30, quality: "small" });
  expect(clampExportSettings({ fps: "60" })).toEqual({ fps: 30, quality: "high" });
  for (const junk of [null, undefined, 7, "x", []]) expect(clampExportSettings(junk)).toEqual({ fps: 30, quality: "high" });
});

test("clampCoverTitle trims, cuts to 40 whole characters and never ends with a space", () => {
  expect(clampCoverTitle("  Beach day  ")).toBe("Beach day");
  expect(clampCoverTitle("a".repeat(45))).toBe("a".repeat(40));
  // 39 letters + a space + "z" = 41 characters: the cut keeps 39 letters + the space, the second trim drops the space.
  expect(clampCoverTitle("b".repeat(39) + " z")).toBe("b".repeat(39));
  // An emoji is one character (two UTF-16 units): 41 waves → 40 waves, none cut in half.
  expect(Array.from(clampCoverTitle("🌊".repeat(41)))).toHaveLength(40);
  for (const junk of [42, null, undefined, {}]) expect(clampCoverTitle(junk)).toBe("");
});

test("clampCover: a finite time inside the project, a clean title, or null", () => {
  expect(clampCover({ time: 2.5, title: " Hi " }, 7)).toEqual({ time: 2.5, title: "Hi" });
  expect(clampCover({ time: 99, title: "" }, 7)).toEqual({ time: 7, title: "" });
  expect(clampCover({ time: -1, title: "x" }, 7)).toEqual({ time: 0, title: "x" });
  expect(clampCover({ time: 1.23456, title: "x" }, 7)).toEqual({ time: 1.235, title: "x" });   // 1234.56 ms → 1235 ms
  expect(clampCover({ time: 3, title: 5 }, 7)).toEqual({ time: 3, title: "" });
  expect(clampCover({ time: 3, title: "x" }, 0)).toEqual({ time: 0, title: "x" });              // empty project
  for (const junk of [null, undefined, "first", 3, [], { title: "x" }, { time: NaN, title: "x" }, { time: Infinity, title: "x" }, { time: "3", title: "x" }])
    expect(clampCover(junk, 7)).toBeNull();
});

test("clampCover is idempotent, also when rounding lands past the end", () => {
  // 6.99996 rounds to 7.000, which is past a 6.9999 s project → clamped to its last whole millisecond, 6.999; a second pass gives the same.
  const once = clampCover({ time: 6.99996, title: "b".repeat(39) + " z" }, 6.9999);
  expect(once).toEqual({ time: 6.999, title: "b".repeat(39) });
  expect(clampCover(once, 6.9999)).toEqual(once);
});

test("clampCover: the upper bound is the project's last whole millisecond, so one pass is final", () => {
  // A 7.0004 s project: the old bound (7.0004) gave 7.0004 first and 7 on the next pass.
  const once = clampCover({ time: 99, title: "x" }, 7.0004);
  expect(once).toEqual({ time: 7, title: "x" });
  expect(clampCover(once, 7.0004)).toEqual(once);
  expect(clampCover({ time: 7.0004, title: "x" }, 7.0004)).toEqual(once);
  expect(clampCover({ time: 99, title: "x" }, 7)).toEqual({ time: 7, title: "x" });   // a whole-millisecond length is its own bound
  for (const total of [NaN, -3, Infinity]) expect(clampCover({ time: 3, title: "x" }, total)).toEqual({ time: 0, title: "x" });
});
