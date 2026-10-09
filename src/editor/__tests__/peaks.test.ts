import { assemblePeaks, decodePeaks, encodePeaks, PEAKS, peaksFileName, peaksPlan, segmentMarks, segmentPath, segmentPathOf, WAVE, waveSegments, type Peaks, type PeaksCall } from "../model/peaks";

const outline = (duration: number, values: number[]): Peaks => {
  const levels = Uint8Array.from(values.map((v) => Math.round(v * 255)));
  return { duration, levels, top: Math.max(0, ...levels) };
};
const answer = (c: PeaksCall, value: (i: number) => number = () => 0.5) => ({ from: c.from, to: c.to, peaks: Array.from({ length: c.count }, (_, i) => value(i)) });

describe("the request plan for a file", () => {
  test.each([
    [3, 1, 150], [40, 1, 2000], [180, 5, 9000], [240, 6, 12000], [2400, 12, 24000],
  ])("%d s → %d call(s), %d slices in all", (duration, calls, total) => {
    const plan = peaksPlan(duration);
    expect(plan).toHaveLength(calls);
    expect(plan.reduce((n, c) => n + c.count, 0)).toBe(total);
  });
  test("a three-minute song: five calls of 36 s and 1800 values each", () => {
    expect(peaksPlan(180)).toEqual([0, 1, 2, 3, 4].map((i) => ({ from: i * 36, to: (i + 1) * 36, count: 1800 })));
  });
  test("the stretches are consecutive, cover the whole file, and no call asks for fewer than 16 or more than 2000", () => {
    for (const d of [0.05, 0.2, 1, 3, 39.99, 40, 40.01, 61.7, 180, 240, 479, 480, 481, 2400, 14400, 100000]) {
      const plan = peaksPlan(d);
      expect(plan.length).toBeLessThanOrEqual(PEAKS.calls);
      expect(plan[0].from).toBe(0);
      expect(plan[plan.length - 1].to).toBe(d);
      plan.forEach((c, i) => {
        expect(c.count).toBeGreaterThanOrEqual(PEAKS.fewest);
        expect(c.count).toBeLessThanOrEqual(PEAKS.perCall);
        expect(c.to).toBeGreaterThan(c.from);
        if (i > 0) expect(c.from).toBe(plan[i - 1].to);
      });
    }
  });
  test("every slice of a plan is the same length (the density is one number for the file)", () => {
    for (const d of [61.7, 180, 2400]) {
      const plan = peaksPlan(d), total = plan.reduce((n, c) => n + c.count, 0);
      for (const c of plan) expect((c.to - c.from) / c.count).toBeCloseTo(d / total, 9);
    }
  });
  test("up to eight minutes the density is 50 a second; a longer file gets 24 000 slices", () => {
    expect(peaksPlan(480).reduce((n, c) => n + c.count, 0)).toBe(24000);
    expect(peaksPlan(4800).reduce((n, c) => n + c.count, 0)).toBe(24000);
  });
  test("a length that is not known: one call, to the end of the file", () => {
    for (const d of [0, -3, NaN, Infinity, undefined as unknown as number]) expect(peaksPlan(d)).toEqual([{ from: 0, to: 0, count: 2000 }]);
  });
});

describe("the answers as one outline", () => {
  test("the calls' values in order, as bytes, with the file's length and its loudest", () => {
    const plan = peaksPlan(180);
    const p = assemblePeaks(plan, plan.map((c, k) => answer(c, (i) => (k === 2 && i === 7 ? 1 : k / 10))))!;
    expect(p.duration).toBe(180);
    expect(p.levels).toHaveLength(9000);
    expect(p.levels[0]).toBe(0);
    expect(p.levels[1800]).toBe(Math.round(0.1 * 255));
    expect(p.levels[3607]).toBe(255);
    expect(p.levels[8999]).toBe(Math.round(0.4 * 255));
    expect(p.top).toBe(255);
  });
  test("a value that is not a number, or outside 0 … 1, is silence or full — never out of range", () => {
    const plan = peaksPlan(1);
    const p = assemblePeaks(plan, [answer(plan[0], (i) => [NaN, -2, 7, Infinity, 0.5][i % 5])])!;
    expect(Array.from(p.levels.slice(0, 5))).toEqual([0, 0, 255, 0, 128]);
  });
  test("a file shorter than the project believes ends in silence: no slice is moved", () => {
    const plan = peaksPlan(10);   // 500 slices of 20 ms
    const p = assemblePeaks(plan, [{ from: 0, to: 8, peaks: Array.from({ length: 500 }, () => 1) }])!;
    expect(p.levels[0]).toBe(255);
    expect(p.levels[399]).toBe(255);   // 7.98 … 8 s
    expect(p.levels[400]).toBe(0);     // past the file's end
    expect(p.levels[499]).toBe(0);
  });
  test("a length that was not known is the one the phone read", () => {
    const p = assemblePeaks(peaksPlan(0), [{ from: 0, to: 12.5, peaks: Array.from({ length: 2000 }, () => 0.2) }])!;
    expect(p.duration).toBe(12.5);
    expect(p.levels).toHaveLength(2000);
  });
  test("answers that are not the plan's give no outline", () => {
    const plan = peaksPlan(180);
    expect(assemblePeaks(plan, [])).toBeNull();
    expect(assemblePeaks(plan, plan.slice(1).map((c) => answer(c)))).toBeNull();
    expect(assemblePeaks(plan, plan.map((c, i) => (i === 3 ? { from: c.from, to: c.to, peaks: [] } : answer(c))))).toBeNull();
    expect(assemblePeaks(plan, plan.map((c, i) => (i === 3 ? (null as never) : answer(c))))).toBeNull();
    expect(assemblePeaks(peaksPlan(0), [{ from: 0, to: 0, peaks: [1, 1] }])).toBeNull();
    expect(assemblePeaks([], [])).toBeNull();
  });
});

describe("the cache file", () => {
  const uri = "file:///doc/projects/p1/media/My Song (1).m4a";
  const p = outline(3, [0, 0.25, 0.5, 1, 0.1, 0.9]);
  test("its name is the source's own, made safe, with the version", () => {
    expect(peaksFileName(uri)).toBe("My_Song__1_-p1.json");
  });
  test("round trip", () => {
    const back = decodePeaks(encodePeaks(uri, p), uri, 3)!;
    expect(back.duration).toBe(3);
    expect(Array.from(back.levels)).toEqual(Array.from(p.levels));
    expect(back.top).toBe(255);
  });
  test("a three-minute song is about 18 KB, the longest outline under 50 KB", () => {
    expect(encodePeaks(uri, { duration: 180, levels: new Uint8Array(9000), top: 0 }).length).toBeLessThan(18200);
    expect(encodePeaks(uri, { duration: 2400, levels: new Uint8Array(24000), top: 0 }).length).toBeLessThan(50000);
  });
  test("a length the project does not know is not checked; one within 50 ms is the same file", () => {
    expect(decodePeaks(encodePeaks(uri, p), uri, 0)).not.toBeNull();
    expect(decodePeaks(encodePeaks(uri, p), uri, 3.04)).not.toBeNull();
  });
  test("corrupt or foreign text is ignored, never thrown at", () => {
    const good = JSON.parse(encodePeaks(uri, p)) as Record<string, unknown>;
    const bad: unknown[] = [
      "", "{", "null", "[]", "42", "\"text\"", undefined, null, 7, {},
      JSON.stringify({ ...good, clipyPeaks: 2 }),
      JSON.stringify({ ...good, clipyPeaks: undefined }),
      JSON.stringify({ ...good, name: "other-p1.json" }),
      JSON.stringify({ ...good, duration: 0 }), JSON.stringify({ ...good, duration: "3" }), JSON.stringify({ ...good, duration: null }),
      JSON.stringify({ ...good, count: 5 }), JSON.stringify({ ...good, count: 6.5 }), JSON.stringify({ ...good, count: 0, hex: "" }),
      JSON.stringify({ ...good, hex: "00zz80ff1ae6" }), JSON.stringify({ ...good, hex: 12 }), JSON.stringify({ ...good, hex: "0040" }),
      JSON.stringify({ ...good, count: 24001, hex: "0".repeat(48002) }),
      JSON.stringify({ version: 21, clips: [], audioTracks: [] }),   // a project document
    ];
    for (const text of bad) expect(decodePeaks(text, uri, 3)).toBeNull();
    expect(decodePeaks(encodePeaks(uri, p), "file:///x/other.m4a", 3)).toBeNull();   // another file's
    expect(decodePeaks(encodePeaks(uri, p), uri, 9)).toBeNull();                      // another length: not this file
  });
});

describe("a segment's marks", () => {
  // 10 s, 500 slices: silence, except 2 … 3 s at half and one slice at 6 s at full.
  const p = outline(10, Array.from({ length: 500 }, (_, i) => (i === 300 ? 1 : i >= 100 && i < 150 ? 0.5 : 0)));
  test("one mark every 3 pt: a hundred a segment, each the loudest slice of its own stretch of the file", () => {
    const marks = segmentMarks(p, 60, 0);   // 300 pt = 5 s; a mark is 50 ms = 2.5 slices
    expect(marks).toHaveLength(100);
    expect(marks[39]).toBe(0);                                   // 1.95 … 2.00 s
    expect(marks[40]).toBeCloseTo(Math.pow(128 / 255, 1.5), 6);  // 2.00 … 2.05 s
    expect(marks[59]).toBeGreaterThan(0);
    expect(marks[60]).toBe(0);
    const next = segmentMarks(p, 60, 1);    // 5 … 10 s
    expect(next).toHaveLength(100);
    expect(next.indexOf(1)).toBe(20);       // 6.00 s
    expect(next.filter((v) => v > 0)).toHaveLength(1);
  });
  test("at the largest zoom a mark is one slice (a slice is wider than a mark): nothing is skipped", () => {
    const marks = segmentMarks(p, 200, 4);  // 1200 … 1500 pt = 6 … 7.5 s; 6.00 s is its first mark(s)
    expect(marks[0]).toBe(1);
    expect(marks.slice(2).every((v) => v === 0)).toBe(true);
  });
  test("only the marks that begin before the file ends; none past it", () => {
    expect(segmentMarks(p, 60, 2)).toEqual([]);
    expect(segmentMarks(outline(5.5, Array.from({ length: 275 }, () => 1)), 60, 1)).toHaveLength(10);
  });
  test("values stay 0 … 1 whatever the outline holds", () => {
    const odd: Peaks = { duration: 4, levels: Uint8Array.from([255, 255, 3, 0]), top: 2 };   // a `top` that is not the largest
    for (const v of segmentMarks(odd, 60, 0)) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
  });
  test("a quiet file is drawn against its own loudest, a silent one stays flat", () => {
    expect(Math.max(...segmentMarks(outline(2, Array.from({ length: 100 }, (_, i) => (i === 10 ? 0.2 : 0.05))), 60, 0))).toBe(1);
    expect(Math.max(...segmentMarks(outline(2, Array.from({ length: 100 }, () => 0)), 60, 0))).toBe(0);
    expect(Math.max(...segmentMarks(outline(2, Array.from({ length: 100 }, () => 0.01)), 60, 0))).toBeLessThan(0.2);
  });
  test("NaN, nothing or an empty outline → no marks, never a throw", () => {
    const empty: Peaks = { duration: 3, levels: new Uint8Array(0), top: 0 };
    for (const [q, zoom, index] of [[null, 60, 0], [undefined, 60, 0], [empty, 60, 0], [p, NaN, 0], [p, 0, 0], [p, -5, 0], [p, 60, -1], [p, 60, 0.5], [p, 60, NaN],
      [{ ...p, duration: NaN }, 60, 0], [{ ...p, duration: 0 }, 60, 0], [{ duration: 3 } as Peaks, 60, 0]] as [Peaks | null | undefined, number, number][]) {
      expect(segmentMarks(q, zoom, index)).toEqual([]);
    }
    expect(segmentMarks({ ...p, top: NaN }, 60, 0)).toHaveLength(100);
  });
  test("a longer stretch of the file never has fewer marks than a shorter one at the same zoom", () => {
    const count = (duration: number, zoom: number) => {
      const q = outline(duration, Array.from({ length: Math.round(duration * 50) }, () => 0.5));
      let n = 0;
      for (let i = 0; ; i++) { const m = segmentMarks(q, zoom, i).length; if (!m) break; n += m; }
      return n;
    };
    for (const zoom of [20, 60, 133, 200]) {
      let before = 0;
      for (const d of [0.4, 1, 3.3, 7, 12.01, 30]) { const n = count(d, zoom); expect(n).toBeGreaterThanOrEqual(before); expect(n).toBe(Math.ceil((d * zoom) / WAVE.pitch - 1e-9)); before = n; }
    }
  });
});

describe("a segment's path", () => {
  test("upright lines mirrored about the middle, one every 3 pt, the first centred 1 pt in; silence is a thin line", () => {
    expect(segmentPath([0, 1, 0.5], 24)).toBe("M1 11.5V12.5M4 0V24M7 6V18");
  });
  test("nothing to draw, a height that is not one, a mark that is not a number", () => {
    expect(segmentPath([], 24)).toBe("");
    expect(segmentPath([1], 0)).toBe("");
    expect(segmentPath([1], NaN)).toBe("");
    expect(segmentPath([NaN, 9, -1], 24)).toBe("M1 11.5V12.5M4 0V24M7 11.5V12.5");
  });
  test("a path is built once for an outline, a zoom and a segment; another zoom forgets the old ones", () => {
    const p = outline(10, Array.from({ length: 500 }, (_, i) => (i % 7) / 7));
    const a = segmentPathOf(p, 60, 1, 24);
    expect(a).toBe(segmentPath(segmentMarks(p, 60, 1), 24));
    const spy = jest.spyOn(Math, "pow");
    expect(segmentPathOf(p, 60, 1, 24)).toBe(a);
    expect(spy).not.toHaveBeenCalled();
    expect(segmentPathOf(p, 120, 1, 24)).toBe(segmentPath(segmentMarks(p, 120, 1), 24));
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("which segments a bar draws", () => {
  const base = { playhead: 0, start: 0, trimStart: 0, trimEnd: 180, duration: 180, zoom: 60, pps: 60, half: 195 };
  test("only what is on screen or 300 pt beside it: a three-minute song is a few segments, not thirty-six", () => {
    expect(waveSegments(base)).toEqual({ first: 0, last: 1 });                       // 0 … 495 pt
    expect(waveSegments({ ...base, playhead: 90 })).toEqual({ first: 16, last: 19 });   // 4905 … 5895 pt
    expect(waveSegments({ ...base, playhead: 180 })).toEqual({ first: 34, last: 35 });
  });
  test("the bar's own stretch of the file: a trimmed, moved bar shows the file's segments under it", () => {
    // The bar starts at 10 s on the timeline and plays the file from 60 s: at the playhead (12 s) the file is at 62 s.
    expect(waveSegments({ ...base, start: 10, trimStart: 60, trimEnd: 70, playhead: 12 })).toEqual({ first: 12, last: 13 });   // 60 … 70 s = 3600 … 4200 pt
    expect(waveSegments({ ...base, start: 10, trimStart: 61, trimEnd: 65, playhead: 12 })).toEqual({ first: 12, last: 12 });
  });
  test("nothing for a bar far off screen, and nothing past the end of the file", () => {
    expect(waveSegments({ ...base, playhead: 400 })).toBeNull();
    expect(waveSegments({ ...base, start: 100, playhead: 0 })).toBeNull();
    expect(waveSegments({ ...base, trimEnd: 400, duration: 12, playhead: 12 })).toEqual({ first: 0, last: 2 });
  });
  test("during a pinch the segments are the ones of the zoom they were built at; the screen's reach is the zoom's of now", () => {
    expect(waveSegments({ ...base, playhead: 90, zoom: 60, pps: 50 })).toEqual({ first: 16, last: 19 });   // 90 ± 9.9 s → 4806 … 5994 pt at 60
    expect(waveSegments({ ...base, playhead: 90, zoom: 60, pps: 75 })).toEqual({ first: 16, last: 19 });   // 90 ± 6.6 s → 5004 … 5796
  });
  test("never more than eight, the ones around the playhead", () => {
    const wide = waveSegments({ ...base, playhead: 90, half: 4000 })!;
    expect(wide.last - wide.first + 1).toBe(WAVE.most);
    expect(wide.first).toBeLessThanOrEqual(18);
    expect(wide.last).toBeGreaterThanOrEqual(18);
    const atStart = waveSegments({ ...base, playhead: 0, half: 4000 })!;
    expect(atStart).toEqual({ first: 0, last: 7 });
    const atEnd = waveSegments({ ...base, playhead: 180, half: 4000 })!;
    expect(atEnd).toEqual({ first: 28, last: 35 });
  });
  test("a number that is not one → nothing, never a throw", () => {
    for (const k of ["playhead", "start", "trimStart", "trimEnd", "duration", "zoom", "pps", "half"] as const) expect(waveSegments({ ...base, [k]: NaN })).toBeNull();
    expect(waveSegments({ ...base, zoom: 0 })).toBeNull();
    expect(waveSegments({ ...base, trimStart: 5, trimEnd: 5 })).toBeNull();
  });
});
