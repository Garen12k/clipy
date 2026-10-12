import { EXPORT_FPS, EXPORT_QUALITIES, type ExportSettings } from "@/src/editor/model/types";
import { QUALITY_LABELS, RESOLUTIONS, type Resolution } from "../estimate";
import { fpsLabel, pickedPreset, PRESET_IDS, PRESETS, presetLabel, presetLine, presetsShown, presetValues, type PresetId } from "../presets";

const high: ExportSettings = { fps: 30, quality: "high" };

test("the three presets, in order, each with a one-word sentence-style name, an outline icon and a hint", () => {
  expect(PRESET_IDS).toEqual(["social", "message", "best"]);
  expect(PRESET_IDS.map((id) => PRESETS[id].label)).toEqual(["Social", "Message", "Best"]);
  expect(PRESET_IDS.map((id) => PRESETS[id].hint)).toEqual([
    "For TikTok, Reels, Shorts and X", "A small file for WhatsApp, email and chat", "The highest quality this project can export",
  ]);
  for (const id of PRESET_IDS) expect(PRESETS[id].icon).toMatch(/-outline$/);
  expect(new Set(PRESET_IDS.map((id) => PRESETS[id].icon)).size).toBe(3);
});

test("what each preset sets", () => {
  expect(presetValues("social", false)).toEqual({ res: 1080, fps: 30, quality: "high" });
  expect(presetValues("social", true)).toEqual({ res: 1080, fps: 30, quality: "high" });   // Social never follows the source
  expect(presetValues("message", false)).toEqual({ res: 720, fps: 30, quality: "small" });
  expect(presetValues("message", true)).toEqual({ res: 720, fps: 30, quality: "small" });
});

test("Best follows what the project can export: 4K only with a 4K source, else 1080p", () => {
  expect(presetValues("best", true)).toEqual({ res: 2160, fps: 30, quality: "high" });
  expect(presetValues("best", false)).toEqual({ res: 1080, fps: 30, quality: "high" });
});

test("every value a preset sets is one the controls offer", () => {
  for (const has4K of [true, false]) for (const id of PRESET_IDS) {
    const v = presetValues(id, has4K);
    expect(RESOLUTIONS.map((r) => r.value)).toContain(v.res);
    expect(EXPORT_FPS).toContain(v.fps);
    expect(EXPORT_QUALITIES).toContain(v.quality);
    if (!has4K) expect(v.res).not.toBe(2160);
  }
});

test("without 4K the row is TWO tiles: Best would be Social again, so it is not shown", () => {
  expect(presetsShown(true)).toEqual(["social", "message", "best"]);
  expect(presetsShown(false)).toEqual(["social", "message"]);
  expect(presetValues("best", false)).toEqual(presetValues("social", false));               // the reason
});

test("the tiles shown never share their values, so two can never be picked", () => {
  for (const has4K of [true, false]) {
    const lines = presetsShown(has4K).map((id) => JSON.stringify(presetValues(id, has4K)));
    expect(new Set(lines).size).toBe(lines.length);
  }
});

test("picked is derived: exactly the preset whose three values are the current ones", () => {
  expect(pickedPreset(1080, high, false)).toBe("social");
  expect(pickedPreset(1080, high, true)).toBe("social");
  expect(pickedPreset(720, { fps: 30, quality: "small" }, true)).toBe("message");
  expect(pickedPreset(2160, high, true)).toBe("best");
});

test("a manual change that matches no preset un-picks", () => {
  expect(pickedPreset(1080, { fps: 60, quality: "high" }, true)).toBeNull();
  expect(pickedPreset(1080, { fps: 30, quality: "small" }, true)).toBeNull();
  expect(pickedPreset(720, high, false)).toBeNull();
  expect(pickedPreset(2160, { fps: 24, quality: "high" }, true)).toBeNull();
});

test("for every combination of the controls at most one shown tile is picked, and it is one that is shown", () => {
  for (const has4K of [true, false]) for (const r of RESOLUTIONS) for (const fps of EXPORT_FPS) for (const quality of EXPORT_QUALITIES) {
    const shown = presetsShown(has4K);
    const matching = shown.filter((id) => { const v = presetValues(id, has4K); return v.res === r.value && v.fps === fps && v.quality === quality; });
    expect(matching.length).toBeLessThanOrEqual(1);
    expect(pickedPreset(r.value, { fps, quality }, has4K)).toBe(matching[0] ?? null);
  }
});

test("the line and the spoken label are written from the real values through the label tables", () => {
  expect(fpsLabel(30)).toBe("30 fps");
  const res = (r: Resolution) => RESOLUTIONS.find((x) => x.value === r)!.label;
  for (const has4K of [true, false]) for (const id of PRESET_IDS as readonly PresetId[]) {
    const v = presetValues(id, has4K);
    expect(presetLine(v)).toBe(`${res(v.res)} · ${v.fps} · ${QUALITY_LABELS[v.quality]}`);
    expect(presetLabel(id, has4K)).toBe(`${PRESETS[id].label}, ${res(v.res)}, ${v.fps} fps, ${QUALITY_LABELS[v.quality]}`);
  }
  expect(presetLine(presetValues("social", false))).toBe("1080p · 30 · High");
  expect(presetLine(presetValues("message", false))).toBe("720p · 30 · Smaller file");
  expect(presetLine(presetValues("best", true))).toBe("4K · 30 · High");
});
