jest.mock("@/src/lib/id", () => ({ newId: jest.fn(() => "new-id") }));
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { DEFAULT_ADJUST, EFFECT_END_SLACK, EFFECT_LIMITS, makeClip, makeEffect, makeProject } from "../types";
import { migrateProject } from "../migrate";
import {
  addEffect, applyTemplate, deleteClip, deleteEffect, duplicateClip, duplicateEffect, fitEffects, insertFreezeFrame, moveEffect, replaceClipMedia, resetClipAdjust,
  setAdjustForAllClips, setClipAdjust, setClipFilterIntensity, setFilterForAllClips, setClipSpeed, splitClipAt, trimClip, updateEffect,
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
    expect(n.effects).toEqual([{ id: "e1", type: "glitch", start: 3, end: 5, intensity: EFFECT_LIMITS.defaultIntensity, rect: null }]);
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

describe("effects stranded past the project's end are dropped by clip ops", () => {
  // a = 0–4 s, b = 4–10 s
  const fx = [makeEffect({ id: "in", start: 1, end: 3 }), makeEffect({ id: "edge", start: 3.5, end: 9 }), makeEffect({ id: "late", start: 6, end: 8 })];
  const base = { ...p, effects: fx };
  const ids = (x: { effects: { id: string }[] }) => x.effects.map((e) => e.id);

  test("deleting a clip drops effects that start at or after the new end; the rest are untouched", () => {
    const n = deleteClip(base, "b");   // 4 s
    expect(ids(n)).toEqual(["in", "edge"]);
    expect(n.effects[0]).toBe(fx[0]);
    expect(n.effects[1]).toBe(fx[1]);   // end 9 still runs past the end: left alone
  });
  test("trimming drops them too", () => {
    expect(ids(trimClip(base, "b", 0, 1))).toEqual(["in", "edge"]);   // 5 s
    expect(ids(trimClip(base, "a", 0, 1))).toEqual(["in", "edge", "late"]);   // 7 s: late (6) still inside
  });
  test("a speed change drops them too", () => {
    const fast = setClipSpeed(setClipSpeed(base, "a", 2), "b", 2);   // 5 s
    expect(ids(fast)).toEqual(["in", "edge"]);
    expect(ids(setClipSpeed(base, "b", 0.5))).toEqual(["in", "edge", "late"]);   // longer: nothing dropped
  });
  test("an effect starting within 0.05 s of the end counts as past it", () => {
    const near = { ...p, effects: [makeEffect({ id: "x", start: 3.96, end: 6 }), makeEffect({ id: "y", start: 3.94, end: 6 })] };
    expect(ids(deleteClip(near, "b"))).toEqual(["y"]);
  });
  test("deleting every clip drops every effect", () => {
    expect(deleteClip(deleteClip(base, "a"), "b").effects).toEqual([]);
  });
  test("the same effects array is kept when nothing is dropped", () => {
    expect(setClipAdjust(base, "a", { brightness: 0.2 }).effects).toBe(fx);
    expect(trimClip(base, "a", 0, 3.5).effects).toBe(fx);
    expect(duplicateClip(base, "a").effects).toBe(fx);
  });
  test("effect ops themselves never drop anything", () => {
    const straddle = { ...p, effects: [makeEffect({ id: "e", start: 11, end: 12 })] };
    expect(updateEffect(straddle, "e", { intensity: 0.2 }).effects).toHaveLength(1);
  });
});

describe("final review", () => {
  test("fitEffects drops effects starting within the slack of the given total; same array when none do", () => {
    const fx = [makeEffect({ id: "x", start: 1, end: 3 }), makeEffect({ id: "y", start: 8, end: 10 })];
    expect(EFFECT_END_SLACK).toBe(0.05);
    expect(fitEffects(fx, 10)).toBe(fx);
    expect(fitEffects(fx, 8.04).map((e) => e.id)).toEqual(["x"]);
    expect(fitEffects(fx, 8.06)).toBe(fx);
    expect(fitEffects(fx, 0)).toEqual([]);
  });

  test("slider values are rounded to 2 decimals, so a slider back at centre is exactly 0", () => {
    const moved = setClipAdjust(p, "a", { brightness: 0.5, tint: 0.3349 });
    expect(moved.clips[0].adjust.tint).toBe(0.33);
    const back = setClipAdjust(moved, "a", { brightness: -2e-8 });
    expect(Object.is(back.clips[0].adjust.brightness, 0)).toBe(true);
    expect(setClipAdjust(p, "a", { contrast: -2e-8 })).toBe(p);
    expect(setClipAdjust(p, "a", { contrast: 1e-7 })).toBe(p);
    expect(setClipAdjust(p, "a", { saturation: -0.3351 }).clips[0].adjust.saturation).toBe(-0.34);
  });
  test("filter strength is rounded to 2 decimals", () => {
    expect(setClipFilterIntensity(p, "a", 0.3349).clips[0].filterIntensity).toBe(0.33);
    expect(Object.is(setClipFilterIntensity(p, "a", -2e-8).clips[0].filterIntensity, 0)).toBe(true);
    expect(setClipFilterIntensity(p, "a", 0.999999)).toBe(p);
  });
  test("effect intensity is rounded to 2 decimals", () => {
    const base = { ...p, effects: [makeEffect({ id: "e", start: 2, end: 5, intensity: 0.5 })] };
    expect(updateEffect(base, "e", { intensity: 0.3349 }).effects[0].intensity).toBe(0.33);
    expect(Object.is(updateEffect(base, "e", { intensity: 2e-8 }).effects[0].intensity, 0)).toBe(true);
    expect(updateEffect(base, "e", { intensity: 0.5000001 })).toBe(base);
  });

  describe("a yielding edge leaves at least minDuration exactly, so save and reload is byte-stable", () => {
    // The loader leaves the saved numbers exactly as they are (toEqual compares numbers exactly; key order is the factory's).
    const stable = (x: typeof p) => expect(migrateProject(JSON.parse(JSON.stringify(x))).effects).toEqual(x.effects);
    test.each([[10, 9.95], [10, 9.9], [7.3, 7.25], [5.1, 5.1], [0.7, 0.65], [3.33, 3.2]])("end %d, start dragged to %d", (end, to) => {
      const base = { ...p, effects: [makeEffect({ id: "e", start: Math.max(0, end - 2), end })] };
      const n = updateEffect(base, "e", { start: to });
      const e = n.effects[0];
      expect(e.end).toBe(end);
      expect(e.end - e.start).toBeGreaterThanOrEqual(EFFECT_LIMITS.minDuration);
      expect(e.start).toBeCloseTo(end - EFFECT_LIMITS.minDuration, 6);
      stable(n);
    });
    test.each([[9.7, 9.75],[0.1, 0.15], [7.3, 7.3], [3.33, 3.4], [5.9, 5.9]])("start %d, end dragged to %d", (start, to) => {
      const base = { ...p, effects: [makeEffect({ id: "e", start, end: Math.min(10, start + 2) })] };
      const n = updateEffect(base, "e", { end: to });
      const e = n.effects[0];
      expect(e.start).toBe(start);
      expect(e.end - e.start).toBeGreaterThanOrEqual(EFFECT_LIMITS.minDuration);
      expect(e.end).toBeCloseTo(start + EFFECT_LIMITS.minDuration, 6);
      stable(n);
    });
    test("both edges given and too close: the start gives way, exactly", () => {
      const base = { ...p, effects: [makeEffect({ id: "e", start: 2, end: 5 })] };
      const e = updateEffect(base, "e", { start: 9.95, end: 10 }).effects[0];
      expect(e.end).toBe(10);
      expect(e.end - e.start).toBeGreaterThanOrEqual(EFFECT_LIMITS.minDuration);
    });
  });
});
