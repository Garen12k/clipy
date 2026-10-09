jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { FILTERS } from "@/src/editor/effects";
import { setClipSpeedCurve } from "@/src/editor/model/ops";
import { makeClip, makePhotoClip, makeProject, type Clip } from "@/src/editor/model/types";
import { MAX_PPS, MIN_PPS } from "@/src/editor/store";
import { formatDuration } from "@/src/lib/format";
import { CLIP_AREA_HEIGHT, STRIP_HEIGHT } from "../timelineLayout";
import { BADGE, BAR, BAR_GLYPH, BEAT_BAND, CLIP_TOP, CUT, RULER, badgeRoom, barParts, clipBadges, clipMarks, cutMarks, rulerMarks, rulerSteps, rulerZoom } from "../timelineMarks";

const GLYPHS: Record<string, number> = require("@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json");

describe("how the clip area is divided", () => {
  test("the ruler and the beat ticks live in the room above the clips; the clips and the area are as high as they were", () => {
    expect(CLIP_AREA_HEIGHT).toBe(120);
    expect(STRIP_HEIGHT).toBe(64);
    expect(CLIP_TOP).toBe(28);                                    // the clips stay centred: 28 above, 28 below
    expect(RULER.height).toBe(18);
    expect(BEAT_BAND).toEqual({ top: 18, height: 10 });           // the ticks keep their 10 pt, now right above the clips
    expect(BEAT_BAND.top + BEAT_BAND.height).toBe(CLIP_TOP);
  });
});

describe("the ruler: its steps", () => {
  test("labels every 2 seconds; every second when zoomed far in; coarser when zoomed out", () => {
    expect(rulerSteps(60, 30).label).toBe(2);
    expect(rulerSteps(24, 30).label).toBe(2);
    expect(rulerSteps(20, 30).label).toBe(5);
    expect(rulerSteps(119, 30).label).toBe(2);
    expect(rulerSteps(120, 30).label).toBe(1);
    expect(rulerSteps(200, 30).label).toBe(1);
  });
  test("ticks every half second where they fit", () => {
    expect(rulerSteps(20, 30).tick).toBe(0.5);                    // 10 pt apart
    expect(rulerSteps(60, 30).tick).toBe(0.5);
    expect(rulerSteps(200, 30).tick).toBe(0.5);
    expect(rulerSteps(10, 30)).toEqual({ label: 5, tick: 1 });    // below the zoom range of the app: 5 pt would be too close
  });
  test("labels never overlap and ticks never crowd, across the whole zoom range and for long projects", () => {
    for (const pps of [MIN_PPS, 20, 33, 60, 119, 120, 200, MAX_PPS]) for (const duration of [0, 0.4, 7, 61, 600, 3600, 20000]) {
      const { label, tick } = rulerSteps(pps, duration);
      const marks = rulerMarks(pps, duration);
      expect(label * pps).toBeGreaterThanOrEqual(RULER.labelGap);
      expect(tick * pps).toBeGreaterThanOrEqual(RULER.tickGap);
      for (let i = 1; i < marks.labels.length; i++) expect(marks.labels[i].x - marks.labels[i - 1].x).toBeGreaterThanOrEqual(RULER.labelGap - 1e-6);
      expect(Math.abs(label / tick - Math.round(label / tick))).toBeLessThan(1e-9);     // every label stands on a tick
      expect(marks.labels.length).toBeLessThanOrEqual(RULER.maxLabels + 1);
      expect(marks.ticks.length).toBeLessThanOrEqual(RULER.maxTicks + 1);
    }
  });
  test("a very long project gets a coarser ruler rather than thousands of marks", () => {
    expect(RULER).toMatchObject({ maxLabels: 120, maxTicks: 240 });
    expect(rulerSteps(60, 60)).toEqual({ label: 2, tick: 0.5 });       // a minute: as fine as ever
    expect(rulerSteps(60, 120)).toEqual({ label: 2, tick: 0.5 });      // two minutes: 240 half-second ticks, the cap exactly
    expect(rulerSteps(60, 121)).toEqual({ label: 2, tick: 1 });
    expect(rulerSteps(200, 600)).toEqual({ label: 5, tick: 5 });
    expect(rulerSteps(200, 3600)).toEqual({ label: 30, tick: 15 });
    expect(rulerMarks(200, 3600).ticks).toHaveLength(241);
    expect(rulerMarks(200, 3600).labels).toHaveLength(121);
  });
  test("a coarser ruler is a coarser STEP: the marks stay evenly spaced from zero to the end, none dropped here and there", () => {
    for (const pps of [MIN_PPS, 33, 60, 120, MAX_PPS]) for (const duration of [7, 61, 121, 600, 3600, 20000]) {
      const { label, tick } = rulerSteps(pps, duration);
      const m = rulerMarks(pps, duration);
      m.ticks.forEach((t, i) => expect(t.t).toBeCloseTo(i * tick, 6));
      m.labels.forEach((l, i) => expect(l.t).toBeCloseTo(i * label, 6));
      expect(m.ticks[m.ticks.length - 1].t).toBeGreaterThan(duration - tick - 1e-6);
      expect(m.labels[m.labels.length - 1].t).toBeGreaterThan(duration - label - 1e-6);
    }
  });
  test("during a pinch the ruler keeps the zoom it was built at until the zoom has moved a step away; with no pinch it is always the zoom", () => {
    expect(RULER.stretch).toBe(1.25);
    expect(rulerZoom(60, 61, false)).toBe(61);
    expect(rulerZoom(60, 200, false)).toBe(200);
    expect(rulerZoom(60, 61, true)).toBe(60);
    expect(rulerZoom(60, 75, true)).toBe(60);                          // 1.25 times: still stretched
    expect(rulerZoom(60, 75.1, true)).toBe(75.1);                      // past the step: built again
    expect(rulerZoom(60, 48, true)).toBe(60);
    expect(rulerZoom(60, 47.9, true)).toBe(47.9);
    expect(rulerZoom(NaN, 60, true)).toBe(60);
    expect(rulerZoom(0, 60, true)).toBe(60);
    // A stretched mark is where a fresh one would be: x(built) × zoom / built = the time × the zoom.
    for (const [built, pps] of [[60, 70], [60, 50], [120, 149], [20, 16.5]]) for (const t of [0, 2, 6.5, 59]) expect((t * built) * (pps / built)).toBeCloseTo(t * pps, 9);
  });
  test("numbers that are not numbers give a harmless ruler", () => {
    expect(rulerMarks(60, NaN)).toEqual({ labels: [{ t: 0, x: 0, text: "0:00" }], ticks: [{ t: 0, x: 0, major: true }] });
    expect(() => rulerMarks(NaN, 10)).not.toThrow();
  });
});

describe("the ruler: its marks", () => {
  test("every mark is at its time times the zoom (the mapping the clips use) and labels read as the time readout does", () => {
    const m = rulerMarks(60, 7);
    expect(m.labels).toEqual([0, 2, 4, 6].map((t) => ({ t, x: t * 60, text: formatDuration(t) })));
    expect(m.labels.map((l) => l.text)).toEqual(["0:00", "0:02", "0:04", "0:06"]);
    expect(m.ticks.map((t) => t.t)).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7]);
    expect(m.ticks.filter((t) => t.major).map((t) => t.t)).toEqual([0, 2, 4, 6]);
    for (const t of m.ticks) expect(t.x).toBe(t.t * 60);
  });
  test("past a minute the labels keep the form of the readout; the ruler ends with the project", () => {
    const m = rulerMarks(20, 131);
    expect(m.labels.slice(-3).map((l) => l.text)).toEqual(["2:00", "2:05", "2:10"]);
    expect(Math.max(...m.ticks.map((t) => t.t))).toBe(131);
  });
});

describe("the badges of a clip", () => {
  const clip = (over: Partial<Clip> = {}) => makeClip({ id: "a", sourceDuration: 8, ...over });
  const texts = (c: Clip, width: number, selected = false) => clipBadges(c, width, selected).map((b) => b.text);
  test("the name of the filter as the Filter strip shows it, the speed as the Speed strip formats it, Reversed in words", () => {
    expect(clipMarks(clip({ filter: "warm" }))).toEqual([{ id: "filter", text: FILTERS.warm.label }]);
    expect(clipMarks(clip({ speed: 1.5 }))).toEqual([{ id: "speed", text: "1.5×" }]);
    expect(clipMarks(clip({ speed: 0.25 }))).toEqual([{ id: "speed", text: "0.25×" }]);
    expect(clipMarks(clip({ reversed: true }))).toEqual([{ id: "reversed", text: "Reversed" }]);
    expect(clipMarks(clip())).toEqual([]);
    expect(clipMarks(makePhotoClip({ id: "p" }))).toEqual([{ id: "photo", text: "Photo" }]);
  });
  test("a speed curve takes the slot of the speed with its own name, as before", () => {
    const curved = setClipSpeedCurve(makeProject({ clips: [clip()] }), "a", "jumpCut").clips[0];
    expect(clipMarks(curved)).toEqual([{ id: "speed", text: "Jump cut" }]);
  });
  test("under 100 pt a clip shows none; from 100 pt, what fits", () => {
    const c = clip({ filter: "warm" });
    expect(texts(c, 99)).toEqual([]);
    expect(texts(c, 100)).toEqual(["Warm"]);
    expect(BADGE.minClip).toBe(100);
  });
  test("two at most: the rest collapse into a count", () => {
    expect(texts(clip({ filter: "warm", speed: 2, reversed: true }), 300)).toEqual(["Warm", "2×", "+1"]);
    expect(texts(clip({ filter: "warm", speed: 2 }), 300)).toEqual(["Warm", "2×"]);
  });
  test("a badge that does not fit is left out whole: nothing is cut off, nothing passes the edge of the clip", () => {
    const c = clip({ filter: "warm", reversed: true });
    const fits = (width: number, selected: boolean) => {
      const shown = clipBadges(c, width, selected);
      const used = shown.reduce((sum, b, i) => sum + Math.ceil(b.text.length * BADGE.char) + BADGE.pad + (i ? BADGE.gap : 0), 0);
      expect(used).toBeLessThanOrEqual(Math.max(0, badgeRoom(width, selected)));
      return shown.map((b) => b.text);
    };
    expect(fits(100, false)).toEqual(["Warm", "+1"]);
    expect(fits(140, false)).toEqual(["Warm", "Reversed"]);
    for (let w = 100; w <= 400; w += 7) { fits(w, false); fits(w, true); }
  });
  test("the badges of a selected clip stay between its trim handle and its Move grip: none until there is room", () => {
    const c = clip({ filter: "warm" });
    expect(badgeRoom(200, true)).toBe(200 / 2 - 14 - 8 - 20);
    expect(texts(c, 150, true)).toEqual([]);                      // 33 pt of room: "Warm" needs 34
    expect(texts(c, 160, true)).toEqual(["Warm"]);
    expect(texts(clip({ reversed: true }), 220, true)).toEqual(["Reversed"]);
  });
});

describe("the markers on the cuts", () => {
  const three = (over: Partial<Clip>[] = [{}, {}, {}]) => makeProject({ clips: [
    makeClip({ id: "a", sourceDuration: 4, ...over[0] }), makeClip({ id: "b", sourceDuration: 2, ...over[1] }), makeClip({ id: "c", sourceDuration: 3, ...over[2] }),
  ] });
  test("one on every cut between two clips, on the cut: a diamond where it has a transition, a plus where it has none", () => {
    const p = three([{ transitionOut: { type: "fade", duration: 0.5 } }, {}, { transitionOut: { type: "fade", duration: 0.5 } }]);
    expect(cutMarks(p, 50, null, false)).toEqual([
      { index: 0, x: 200, width: CUT.targetWidth, has: true },
      { index: 1, x: 300, width: CUT.targetWidth, has: false },
    ]);                                                           // nothing after the last clip, whatever it stores
  });
  test("at the two cuts of the selected clip the marker stands outward, beside the trim handle: its target begins past the cut", () => {
    const marks = cutMarks(three(), 50, "b", false);
    expect(marks.map((m) => m.x)).toEqual([200 - CUT.shift, 300 + CUT.shift]);
    const [before, after] = marks;
    expect(before.x + before.width / 2).toBeLessThanOrEqual(200 - 2);   // wholly in the clip before the selected one
    expect(after.x - after.width / 2).toBeGreaterThanOrEqual(300 + 2);  // wholly in the clip after it
    expect(cutMarks(three(), 50, "a", false).map((m) => m.x)).toEqual([200 + CUT.shift, 300]);
  });
  test("the target is the 24-pt column of the disc, 44 high: 12 pt into each neighbour, no more", () => {
    expect(CUT).toMatchObject({ disc: 22, targetWidth: 24, targetHeight: 44, shift: 14, shiftedWidth: 24 });
    expect(CUT.targetWidth).toBeGreaterThanOrEqual(CUT.disc);
  });
  test("no marker on a cut with a clip narrower than 68 pt beside it", () => {
    expect(cutMarks(three(), 33, null, false).map((m) => m.index)).toEqual([]);       // b is 66 pt: both its cuts lose the marker
    expect(cutMarks(three(), 34, null, false).map((m) => m.index)).toEqual([0, 1]);   // 68 pt: back
    expect(cutMarks(three(), 33, "a", false)).toEqual([]);
    expect(CUT.minClip).toBe(68);
  });
  /** The widest stretch of clip `i` (full height) that no marker's target covers. */
  const free = (p: ReturnType<typeof three>, pps: number, selected: string | null, i: number) => {
    const widths = p.clips.map((c) => (c.trimEnd - c.trimStart) * pps);
    const from = widths.slice(0, i).reduce((a, b) => a + b, 0), to = from + widths[i];
    const taken = cutMarks(p, pps, selected, false).map((m) => [Math.max(from, m.x - m.width / 2), Math.min(to, m.x + m.width / 2)]).filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
    let at = from, best = 0;
    for (const [a, b] of taken) { best = Math.max(best, a - at); at = Math.max(at, b); }
    return Math.max(best, to - at);
  };
  test("a clip with a marker on both its cuts keeps a 44-pt column of its own to be selected by — exactly 44 at 68 pt", () => {
    expect(free(three(), 34, null, 1)).toBe(68 - 2 * 12);
    expect(68 - 2 * 12).toBe(44);
    for (let pps = 20; pps <= 200; pps += 1) for (const i of [0, 1, 2]) {
      const width = (three().clips[i].trimEnd - three().clips[i].trimStart) * pps;
      expect(free(three(), pps, null, i)).toBeGreaterThanOrEqual(Math.min(width, 44));
    }
  });
  test("beside the selected clip: the outward marker stands only in a neighbour wide enough to keep its 44 pt (82), else that cut has none", () => {
    expect(CUT.besideSelected).toBe(CUT.shift + CUT.shiftedWidth / 2 + CUT.targetWidth / 2 + 44);
    expect(CUT.besideSelected).toBe(82);
    // a selected, b is 68 pt: the marker would stand 2–26 pt into b and leave it 30 — so it is not shown; b's other cut keeps its own.
    expect(cutMarks(three(), 34, "a", false)).toEqual([{ index: 1, x: 204, width: CUT.targetWidth, has: false }]);
    expect(free(three(), 34, "a", 1)).toBe(68 - 12);
    // b is 82 pt: the marker is back, and b keeps exactly 44.
    expect(cutMarks(three(), 41, "a", false).map((m) => m.index)).toEqual([0, 1]);
    expect(free(three(), 41, "a", 1)).toBe(44);
    // b selected at the smallest marker zoom: a (136) and c (102) are wide enough for both outward markers.
    expect(cutMarks(three(), 34, "b", false).map((m) => m.x)).toEqual([136 - CUT.shift, 204 + CUT.shift]);
    // Whatever is selected, at any zoom, a neighbour that is not selected keeps 44 pt (or all of itself, with no marker on it).
    for (let pps = 20; pps <= 200; pps += 1) for (const sel of ["a", "b", "c"]) for (const i of [0, 1, 2]) {
      const p = three();
      if (p.clips[i].id === sel) continue;
      const width = (p.clips[i].trimEnd - p.clips[i].trimStart) * pps;
      expect(`${pps} ${sel} ${i}: ${free(p, pps, sel, i) >= Math.min(width, 44) - 1e-9}`).toBe(`${pps} ${sel} ${i}: true`);
    }
  });
  test("the outward marker still starts 2 pt past the cut — past the trim handle as laid out (it ends 2 pt outside its clip)", () => {
    for (const pps of [34, 50, 120, 200]) for (const m of cutMarks(three(), pps, "b", false)) {
      const cut = m.index === 0 ? 4 * pps : 6 * pps, way = m.index === 0 ? -1 : 1;
      const near = m.x - way * (m.width / 2);                       // the target's edge nearest the selected clip
      expect((near - cut) * way).toBe(2);
    }
  });
  test("none in multi-select, none for one clip or an empty project", () => {
    expect(cutMarks(three(), 50, null, true)).toEqual([]);
    expect(cutMarks(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 })] }), 50, null, false)).toEqual([]);
    expect(cutMarks(makeProject(), 50, null, false)).toEqual([]);
  });
});

describe("the glyph and the label of a bar", () => {
  test("the label hides first, then the glyph", () => {
    expect(barParts(200)).toEqual({ glyph: true, label: true });
    expect(barParts(BAR.labelMin)).toEqual({ glyph: true, label: true });
    expect(barParts(BAR.labelMin - 1)).toEqual({ glyph: true, label: false });
    expect(barParts(BAR.glyphMin)).toEqual({ glyph: true, label: false });
    expect(barParts(BAR.glyphMin - 1)).toEqual({ glyph: false, label: false });
    expect(BAR.glyphMin).toBe(2 * BAR.pad + BAR.glyph);           // exactly the glyph between the two handles
  });
  test("one outline glyph per kind of bar, all different, all real", () => {
    expect(BAR_GLYPH).toEqual({ text: "text-outline", caption: "chatbox-ellipses-outline", sticker: "happy-outline", music: "musical-notes-outline",
      voice: "mic-outline", sfx: "volume-high-outline", layer: "layers-outline", effect: "flash-outline" });
    expect(new Set(Object.values(BAR_GLYPH)).size).toBe(8);
    for (const name of Object.values(BAR_GLYPH)) { expect(name).toMatch(/-outline$/); expect(GLYPHS[name]).toBeDefined(); }
  });
});
