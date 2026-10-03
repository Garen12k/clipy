jest.mock("@/src/lib/id", () => ({ newId: jest.fn(() => "new-id") }));
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { DEFAULT_ADJUST, EFFECT_LIMITS, makeClip, makeEffect, makeProject } from "../types";
import {
  addEffect, applyTemplate, deleteEffect, duplicateClip, duplicateEffect, insertFreezeFrame, moveEffect, replaceClipMedia, resetClipAdjust,
  setAdjustForAllClips, setClipAdjust, setClipFilterIntensity, setFilterForAllClips, splitClipAt, updateEffect,
} from "../ops";
import { TEMPLATES } from "../../templates";

const a = makeClip({ id: "a", sourceDuration: 4 });
const b = makeClip({ id: "b", sourceDuration: 6 });
const p = makeProject({ clips: [a, b] });   // 10 s

describe("filter strength", () => {
  test("setClipFilterIntensity clamps 0-1", () => {
    expect(setClipFilterIntensity(p, "a", 0.4).clips[0].filterIntensity).toBe(0.4);
    expect(setClipFilterIntensity(p, "a", -3).clips[0].filterIntensity).toBe(0);
    const half = setClipFilterIntensity(p, "a", 0.5);
    expect(setClipFilterIntensity(half, "a", 9).clips[0].filterIntensity).toBe(1);
  });
  test("identity on no change / unknown clip", () => {
    expect(setClipFilterIntensity(p, "a", 1)).toBe(p);
    expect(setClipFilterIntensity(p, "nope", 0.2)).toBe(p);
  });
  test("setFilterForAllClips copies strength when given, keeps own when omitted", () => {
    const own = setClipFilterIntensity(p, "a", 0.3);
    const kept = setFilterForAllClips(own, "mono");
    expect(kept.clips.map((c) => c.filterIntensity)).toEqual([0.3, 1]);
    const all = setFilterForAllClips(own, "mono", 0.6);
    expect(all.clips.map((c) => [c.filter, c.filterIntensity])).toEqual([["mono", 0.6], ["mono", 0.6]]);
    expect(setFilterForAllClips(all, "mono", 0.6)).toBe(all);
    expect(setFilterForAllClips(all, "mono")).toBe(all);
  });
});

describe("adjust", () => {
  test("setClipAdjust clamps per key", () => {
    const n = setClipAdjust(p, "a", { brightness: 5, sharpen: -1, fade: 0.5 });
    expect(n.clips[0].adjust).toEqual({ ...DEFAULT_ADJUST, brightness: 1, sharpen: 0, fade: 0.5 });
  });
  test("setClipAdjust identity cases", () => {
    expect(setClipAdjust(p, "a", {})).toBe(p);
    expect(setClipAdjust(p, "a", { brightness: 0 })).toBe(p);
    expect(setClipAdjust(p, "nope", { brightness: 0.5 })).toBe(p);
  });
  test("resetClipAdjust", () => {
    const n = setClipAdjust(p, "a", { contrast: 0.5 });
    expect(resetClipAdjust(n, "a").clips[0].adjust).toEqual(DEFAULT_ADJUST);
    expect(resetClipAdjust(p, "a")).toBe(p);
    expect(resetClipAdjust(p, "nope")).toBe(p);
  });
  test("setAdjustForAllClips gives each clip a fresh copy", () => {
    const adj = { ...DEFAULT_ADJUST, tint: 0.4 };
    const n = setAdjustForAllClips(p, adj);
    expect(n.clips[0].adjust).toEqual(adj);
    expect(n.clips[0].adjust).not.toBe(adj);
    expect(n.clips[0].adjust).not.toBe(n.clips[1].adjust);
    expect(setAdjustForAllClips(n, adj)).toBe(n);
  });
});

describe("addEffect", () => {
  test("default range from the playhead, default intensity, appended", () => {
    const n = addEffect(p, "glitch", 3, "e1");
    expect(n.effects).toEqual([{ id: "e1", type: "glitch", start: 3, end: 5, intensity: EFFECT_LIMITS.defaultIntensity }]);
    const m = addEffect(n, "blur", 0, "e2");
    expect(m.effects.map((e) => e.id)).toEqual(["e1", "e2"]);
  });
  test("clamps to the project end, shifting start back to keep minDuration", () => {
    expect(addEffect(p, "vhs", 9, "e").effects[0]).toMatchObject({ start: 9, end: 10 });
    const near = addEffect(p, "vhs", 9.95, "e").effects[0];
    expect(near.end).toBe(10);
    expect(near.end - near.start).toBeCloseTo(EFFECT_LIMITS.minDuration, 6);
    expect(addEffect(p, "vhs", 99, "e").effects[0].end).toBe(10);
    expect(addEffect(p, "vhs", -4, "e").effects[0].start).toBe(0);
  });
  test("unchanged for no clips or a project shorter than minDuration", () => {
    const empty = makeProject({ clips: [] });
    expect(addEffect(empty, "flash", 0, "e")).toBe(empty);
    const tiny = makeProject({ clips: [makeClip({ id: "t", sourceDuration: 0.1 })] });
    expect(addEffect(tiny, "flash", 0, "e")).toBe(tiny);
  });
  test("generates an id when none is given", () => {
    expect(addEffect(p, "glow", 0).effects[0].id).toBe("new-id");
  });
});

describe("updateEffect", () => {
  const base = { ...p, effects: [makeEffect({ id: "e", type: "shake", start: 2, end: 5, intensity: 0.5 })] };
  test("intensity clamps 0-1", () => {
    expect(updateEffect(base, "e", { intensity: 3 }).effects[0].intensity).toBe(1);
    expect(updateEffect(base, "e", { intensity: -1 }).effects[0].intensity).toBe(0);
  });
  test("start edge yields", () => {
    const n = updateEffect(base, "e", { start: 4.95 }).effects[0];
    expect(n.end).toBe(5);
    expect(n.start).toBeCloseTo(5 - EFFECT_LIMITS.minDuration, 6);
    expect(updateEffect(base, "e", { start: -2 }).effects[0].start).toBe(0);
    expect(updateEffect(base, "e", { start: 3 }).effects[0]).toMatchObject({ start: 3, end: 5 });
  });
  test("end edge yields", () => {
    const n = updateEffect(base, "e", { end: 2.05 }).effects[0];
    expect(n.start).toBe(2);
    expect(n.end).toBeCloseTo(2 + EFFECT_LIMITS.minDuration, 6);
    expect(updateEffect(base, "e", { end: 99 }).effects[0].end).toBe(10);
  });
  test("identity cases", () => {
    expect(updateEffect(base, "e", {})).toBe(base);
    expect(updateEffect(base, "e", { start: 2, end: 5, intensity: 0.5 })).toBe(base);
    expect(updateEffect(base, "nope", { start: 1 })).toBe(base);
  });
});

describe("moveEffect / deleteEffect / duplicateEffect", () => {
  const base = { ...p, effects: [makeEffect({ id: "e", start: 2, end: 5 })] };
  test("moveEffect keeps length and clamps inside the project", () => {
    expect(moveEffect(base, "e", 4).effects[0]).toMatchObject({ start: 4, end: 7 });
    expect(moveEffect(base, "e", -3).effects[0]).toMatchObject({ start: 0, end: 3 });
    expect(moveEffect(base, "e", 50).effects[0]).toMatchObject({ start: 7, end: 10 });
    expect(moveEffect(base, "e", 2)).toBe(base);
    expect(moveEffect(base, "nope", 1)).toBe(base);
  });
  test("deleteEffect", () => {
    expect(deleteEffect(base, "e").effects).toEqual([]);
    expect(deleteEffect(base, "nope")).toBe(base);
  });
  test("duplicateEffect goes right after the original when it fits", () => {
    const n = duplicateEffect(base, "e");
    expect(n.effects).toHaveLength(2);
    expect(n.effects[1]).toMatchObject({ id: "new-id", type: base.effects[0].type, start: 5, end: 8, intensity: base.effects[0].intensity });
    expect(n.effects[1]).not.toBe(n.effects[0]);
  });
  test("duplicateEffect keeps the same range when it does not fit", () => {
    const late = { ...p, effects: [makeEffect({ id: "e", start: 7, end: 10 })] };
    expect(duplicateEffect(late, "e").effects[1]).toMatchObject({ start: 7, end: 10 });
    expect(duplicateEffect(late, "nope")).toBe(late);
  });
});

describe("clip ops keep strength and deep-copy adjust", () => {
  const look = setClipAdjust(setClipFilterIntensity(p, "a", 0.4), "a", { contrast: 0.5 });
  test("duplicateClip", () => {
    const n = duplicateClip(look, "a");
    expect(n.clips[1].filterIntensity).toBe(0.4);
    expect(n.clips[1].adjust).toEqual(n.clips[0].adjust);
    expect(n.clips[1].adjust).not.toBe(n.clips[0].adjust);
  });
  test("splitClipAt", () => {
    const n = splitClipAt(look, 2);
    expect(n.clips).toHaveLength(3);
    expect(n.clips[1].filterIntensity).toBe(0.4);
    expect(n.clips[1].adjust).toEqual(n.clips[0].adjust);
    expect(n.clips[1].adjust).not.toBe(n.clips[0].adjust);
  });
  test("insertFreezeFrame copies both", () => {
    const n = insertFreezeFrame(look, 2, { id: "f", sourceUri: "file:///f.jpg", width: 10, height: 10 });
    const still = n.clips[1];
    expect(still.kind).toBe("photo");
    expect(still.filterIntensity).toBe(0.4);
    expect(still.adjust).toEqual(look.clips[0].adjust);
    expect(still.adjust).not.toBe(n.clips[0].adjust);
    expect(still.adjust).not.toBe(n.clips[2].adjust);
  });
  test("replaceClipMedia keeps strength and adjust", () => {
    const n = replaceClipMedia(look, "a", { sourceUri: "file:///x.mp4", sourceDuration: 8, width: 10, height: 10, kind: "video" });
    expect(n.clips[0].filterIntensity).toBe(0.4);
    expect(n.clips[0].adjust.contrast).toBe(0.5);
  });
  test("applyTemplate sets filterIntensity 1 when it sets a filter", () => {
    const t = Object.values(TEMPLATES).find((x) => x.filter && x.filter !== "none");
    expect(t).toBeDefined();
    const dim = setClipFilterIntensity(p, "a", 0.2);
    expect(applyTemplate(dim, t!, "clip", "a").clips[0].filterIntensity).toBe(1);
    expect(applyTemplate(dim, t!, "project", null).clips.map((c) => c.filterIntensity)).toEqual([1, 1]);
  });
});

describe("fix round 1", () => {
  test("none template keeps the clip's filter strength", () => {
    const dim = setClipFilterIntensity(p, "a", 0.4);
    expect(TEMPLATES.clean.filter).toBe("none");
    expect(applyTemplate(dim, TEMPLATES.clean, "clip", "a").clips[0].filterIntensity).toBe(0.4);
    expect(applyTemplate(dim, TEMPLATES.clean, "project", null).clips[0].filterIntensity).toBe(0.4);
  });
  test("non-finite input leaves the project unchanged", () => {
    const withE = { ...p, effects: [makeEffect({ id: "e", start: 2, end: 5 })] };
    expect(setClipFilterIntensity(p, "a", NaN)).toBe(p);
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(addEffect(p, "glitch", bad, "x")).toBe(p);
      expect(updateEffect(withE, "e", { start: bad })).toBe(withE);
      expect(updateEffect(withE, "e", { end: bad })).toBe(withE);
      expect(updateEffect(withE, "e", { intensity: bad })).toBe(withE);
      expect(moveEffect(withE, "e", bad)).toBe(withE);
    }
  });
  test("addEffect shift-back keeps at least minDuration exactly", () => {
    for (const at of [9.8, 9.9, 9.95, 10]) {
      const e = addEffect(p, "vhs", at, "e").effects[0];
      expect(e.end - e.start).toBeGreaterThanOrEqual(EFFECT_LIMITS.minDuration);
    }
  });
  test("intensity-only patch leaves the range alone, even past the project end", () => {
    const straddle = { ...p, effects: [makeEffect({ id: "e", start: 9, end: 12, intensity: 0.5 })] };
    const n = updateEffect(straddle, "e", { intensity: 0.9 });
    expect(n.effects[0]).toMatchObject({ start: 9, end: 12, intensity: 0.9 });
  });
});
