import { migrateProject } from "../migrate";
import { clampExportSettings, DEFAULT_RESOLUTION, EXPORT_RESOLUTIONS, exportResolution, makeClip, makeProject, SCHEMA_VERSION, type Resolution } from "../types";
import { useEditorStore } from "../../store";
import { BITRATE_MBPS, RESOLUTIONS } from "@/src/export/estimate";

const clips = () => [makeClip({ id: "a", sourceDuration: 30 })];

test("the three resolutions: the model's list, the screen's options and the bitrate table name exactly the same values", () => {
  expect(EXPORT_RESOLUTIONS).toEqual([720, 1080, 2160]);
  expect(DEFAULT_RESOLUTION).toBe(1080);
  expect(RESOLUTIONS.map((r) => r.value)).toEqual([...EXPORT_RESOLUTIONS]);
  expect(Object.keys(BITRATE_MBPS).map(Number)).toEqual([...EXPORT_RESOLUTIONS]);
});

test("clampExportSettings keeps 720 and 2160, and DROPS the default 1080: absent means 1080", () => {
  expect(clampExportSettings({ fps: 30, quality: "small", resolution: 720 })).toEqual({ fps: 30, quality: "small", resolution: 720 });
  expect(clampExportSettings({ fps: 60, quality: "high", resolution: 2160 })).toEqual({ fps: 60, quality: "high", resolution: 2160 });
  const at1080 = clampExportSettings({ fps: 30, quality: "high", resolution: 1080 });
  expect(at1080).toEqual({ fps: 30, quality: "high" });
  expect("resolution" in at1080).toBe(false);                                         // not `resolution: undefined`
});

test("clampExportSettings drops every resolution the app does not offer — the key is absent, never null / undefined", () => {
  for (const junk of [0, 480, 1440, 4320, 720.5, -720, NaN, Infinity, "720", "4K", null, undefined, true, [720], { value: 720 }]) {
    const c = clampExportSettings({ fps: 24, quality: "small", resolution: junk });
    expect(c).toEqual({ fps: 24, quality: "small" });
    expect(Object.keys(c)).toEqual(["fps", "quality"]);
  }
  expect(Object.keys(clampExportSettings(null))).toEqual(["fps", "quality"]);
});

test("exportResolution reads it: the stored one, else 1080", () => {
  expect(exportResolution({ fps: 30, quality: "high" })).toBe(1080);
  expect(exportResolution({ fps: 30, quality: "high", resolution: 720 })).toBe(720);
  expect(exportResolution({ fps: 30, quality: "high", resolution: 2160 })).toBe(2160);
  expect(exportResolution({ fps: 30, quality: "high", resolution: 999 as Resolution })).toBe(1080);
});

test("a new project stores no resolution key, and a document from before the key loads exactly as it is — same schema number", () => {
  const p = makeProject({ id: "old", clips: clips(), exportSettings: { fps: 24, quality: "small" } });
  expect(Object.keys(makeProject().exportSettings)).toEqual(["fps", "quality"]);
  const stored = JSON.stringify(p);
  const loaded = migrateProject(JSON.parse(stored));
  expect(loaded.schemaVersion).toBe(SCHEMA_VERSION);
  expect(SCHEMA_VERSION).toBe(21);                                                    // no bump for an optional key
  expect(JSON.stringify(loaded.exportSettings)).toBe('{"fps":24,"quality":"small"}');
  expect(JSON.stringify(loaded)).toBe(stored);
});

test("a stored resolution survives loading; a damaged one is dropped and the rest is kept", () => {
  const saved = migrateProject(JSON.parse(JSON.stringify(makeProject({ clips: clips(), exportSettings: { fps: 30, quality: "small", resolution: 720 } }))));
  expect(JSON.stringify(saved.exportSettings)).toBe('{"fps":30,"quality":"small","resolution":720}');
  const bad = migrateProject({ ...makeProject({ clips: clips() }), exportSettings: { fps: 60, quality: "small", resolution: 1440 } });
  expect(bad.exportSettings).toEqual({ fps: 60, quality: "small" });
  const dflt = migrateProject({ ...makeProject({ clips: clips() }), exportSettings: { fps: 60, quality: "small", resolution: 1080 } });
  expect(Object.keys(dflt.exportSettings)).toEqual(["fps", "quality"]);
});

describe("the store", () => {
  const st = () => useEditorStore.getState();
  beforeEach(() => st().setProject(makeProject({ id: "s", clips: clips() })));

  test("setExportSettings writes a resolution alone (no undo step), and going back to 1080 removes the key", () => {
    st().setExportSettings({ fps: 30, quality: "high", resolution: 720 });
    expect(st().project?.exportSettings).toEqual({ fps: 30, quality: "high", resolution: 720 });
    expect(st().past).toHaveLength(0);
    expect(st().dirty).toBe(true);
    st().setExportSettings({ fps: 30, quality: "high", resolution: 1080 });
    expect(Object.keys(st().project!.exportSettings)).toEqual(["fps", "quality"]);
  });

  test("the same resolution again writes nothing", () => {
    st().setExportSettings({ fps: 30, quality: "high", resolution: 2160 });
    const p = st().project;
    st().setExportSettings({ fps: 30, quality: "high", resolution: 2160 });
    expect(st().project).toBe(p);
    const fresh = makeProject({ id: "t", clips: clips() });
    st().setProject(fresh);
    st().setExportSettings({ fps: 30, quality: "high", resolution: 1080 });               // the default = what is stored (absent)
    expect(st().project).toBe(fresh);
    expect(st().dirty).toBe(false);
  });

  test("a stored resolution is not undoable, like the other two", () => {
    st().apply((x) => ({ ...x, name: "Renamed" }));
    st().setExportSettings({ fps: 30, quality: "high", resolution: 720 });
    st().undo();
    expect(st().project?.exportSettings).toEqual({ fps: 30, quality: "high", resolution: 720 });
  });
});
