import { curveSteps } from "@/src/editor/model/timeline";
import { makeClip } from "@/src/editor/model/types";
import { makeAudioTrack, makeEffect, makeLayer, makeOverlay, makeProject, makeSticker } from "@/src/editor/model/types";
import { audioLaneKinds, CLIP_AREA_HEIGHT, indexFromDrop, LANE_GAP, LANE_HEIGHT, laneLift, laneModel, type LaneModel, laneTop, layerRowTops, overlayRows, ROW_SLOP, rowOffset, stripWidth, thumbInterval, thumbTimes } from "../timelineLayout";

const LANE = LANE_HEIGHT + LANE_GAP;

const c = makeClip({ id: "a", sourceDuration: 10, trimStart: 2, trimEnd: 6 }); // 4 s

test("stripWidth scales with zoom", () => {
  expect(stripWidth(c, 50)).toBe(200);
});

test("thumbInterval is one thumb per 64px, floored at 0.5s", () => {
  expect(thumbInterval(64)).toBe(1);       // 64px / 64pps = 1s
  expect(thumbInterval(640)).toBe(0.5);    // 64px / 640pps = 0.1s, capped at 0.5
  expect(thumbInterval(8)).toBe(8);        // 64px / 8pps = 8s
});

test("thumbTimes samples the trimmed range at one thumb per 64px, min 0.5 s apart, always ≥ 1", () => {
  expect(thumbTimes(c, 64)).toEqual([2, 3, 4, 5]);          // 1 s per thumb
  expect(thumbTimes(c, 640)).toEqual([2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5]); // capped at 0.5 s
  expect(thumbTimes(c, 8)).toEqual([2]);                    // 8 s per thumb > duration → one
});

test("thumbTimes steps through source time faster for sped-up clips", () => {
  const fast = makeClip({ id: "f", sourceDuration: 10, trimStart: 2, trimEnd: 6, speed: 2 }); // 2 s on screen
  expect(thumbTimes(fast, 64)).toEqual([2, 4]); // one thumb per output second → every 2 s of source
});

test("indexFromDrop picks the slot whose centre is nearest the drag centre", () => {
  const starts = [0, 100, 300];       // px
  const widths = [100, 200, 100];
  expect(indexFromDrop(starts, widths, 50)).toBe(0);
  expect(indexFromDrop(starts, widths, 250)).toBe(1);
  expect(indexFromDrop(starts, widths, 390)).toBe(2);
  expect(indexFromDrop(starts, widths, 9999)).toBe(2);
});

test("lanes sit under the clip strip", () => {
  expect(LANE_HEIGHT).toBe(28);
  expect(LANE_GAP).toBe(4);
  expect(CLIP_AREA_HEIGHT).toBe(120);
  expect(laneTop(0)).toBe(CLIP_AREA_HEIGHT);
  expect(laneTop(1)).toBe(CLIP_AREA_HEIGHT + LANE);
  expect(laneTop(2)).toBe(CLIP_AREA_HEIGHT + 2 * LANE);
});

test("audioLaneKinds: the kinds in use, always in the order music, voice, sfx", () => {
  const t = (id: string, kind: "music" | "voice" | "sfx") => makeAudioTrack({ id, kind, sourceDuration: 5 });
  expect(audioLaneKinds(makeProject())).toEqual([]);
  expect(audioLaneKinds(makeProject({ audioTracks: [t("a", "voice"), t("b", "voice")] }))).toEqual(["voice"]);
  expect(audioLaneKinds(makeProject({ audioTracks: [t("a", "sfx"), t("b", "music")] }))).toEqual(["music", "sfx"]);
  expect(audioLaneKinds(makeProject({ audioTracks: [t("a", "sfx"), t("b", "voice"), t("c", "music"), t("d", "sfx")] }))).toEqual(["music", "voice", "sfx"]);
});

const clips = [makeClip({ id: "a", sourceDuration: 10 })];
const track = (id: string, kind: "music" | "voice" | "sfx") => makeAudioTrack({ id, kind, sourceDuration: 5 });
const ids = (m: LaneModel) => m.lanes.map((l) => l.id);

test("laneModel: no project, an empty project and a project with clips only have no lanes — the timeline is the clip area", () => {
  for (const m of [laneModel(null), laneModel(makeProject()), laneModel(makeProject({ clips }))]) {
    expect(m).toEqual({ lanes: [], lanesHeight: 0, height: CLIP_AREA_HEIGHT });
  }
});

test("laneModel: a lane exists only while it holds something — text, captions and stickers share one; one per audio kind in use; effects; layers", () => {
  expect(ids(laneModel(makeProject({ clips, overlays: [makeOverlay({ id: "o", text: "Hi", start: 0, end: 1 })] })))).toEqual(["overlays"]);
  expect(ids(laneModel(makeProject({ clips, overlays: [makeSticker({ id: "s", start: 0, end: 1 })] })))).toEqual(["overlays"]);
  expect(ids(laneModel(makeProject({ clips, overlays: [makeOverlay({ id: "o", text: "Hi", start: 0, end: 1 }), makeSticker({ id: "s", start: 0, end: 1 })] })))).toEqual(["overlays"]);
  expect(ids(laneModel(makeProject({ clips, audioTracks: [track("a", "voice"), track("b", "voice")] })))).toEqual(["voice"]);
  expect(ids(laneModel(makeProject({ clips, audioTracks: [track("a", "sfx"), track("b", "music")] })))).toEqual(["music", "sfx"]);
  expect(ids(laneModel(makeProject({ clips, effects: [makeEffect({ id: "e", start: 0, end: 1 })] })))).toEqual(["effects"]);
  expect(ids(laneModel(makeProject({ clips, layers: [makeLayer({ id: "l", sourceDuration: 4 })] })))).toEqual(["layers"]);
});

const layersOf = (n: number) => Array.from({ length: n }, (_, i) => makeLayer({ id: `l${i + 1}`, sourceDuration: 4, start: i }));
const hi = makeOverlay({ id: "o", text: "Hi", start: 0, end: 1 });
const fx = makeEffect({ id: "e", start: 0, end: 1 });

test("laneModel: the order is music, voice, sfx, one row per layer, text / stickers, effects; each lane's index and top follow from the rows above it", () => {
  const full = makeProject({ clips, layers: [makeLayer({ id: "l", sourceDuration: 4 })], overlays: [hi],
    audioTracks: [track("a", "sfx"), track("b", "voice"), track("c", "music"), track("d", "sfx")], effects: [fx] });
  const m = laneModel(full);
  expect(ids(m)).toEqual(["music", "voice", "sfx", "layers", "overlays", "effects"]);
  m.lanes.forEach((l, i) => { expect(l.index).toBe(i); expect(l.top).toBe(laneTop(i)); expect(l.rows).toBe(1); });
  expect(m.lanesHeight).toBe(6 * LANE);
  expect(m.height).toBe(CLIP_AREA_HEIGHT + 6 * LANE);
  // Without the text lane and the layers the lanes below move up.
  const some = laneModel({ ...full, overlays: [], layers: [] });
  expect(some.lanes).toEqual([{ id: "music", index: 0, top: laneTop(0), rows: 1 }, { id: "voice", index: 1, top: laneTop(1), rows: 1 }, { id: "sfx", index: 2, top: laneTop(2), rows: 1 }, { id: "effects", index: 3, top: laneTop(3), rows: 1 }]);
  expect(some.height).toBe(CLIP_AREA_HEIGHT + 4 * LANE);
});

test("laneModel: music only is one lane right under the clips", () => {
  const m = laneModel(makeProject({ clips, audioTracks: [track("m", "music")] }));
  expect(m.lanes).toEqual([{ id: "music", index: 0, top: CLIP_AREA_HEIGHT, rows: 1 }]);
  expect(layerRowTops(m)).toEqual([]);
  expect(m.lanesHeight).toBe(LANE);
  expect(m.height).toBe(CLIP_AREA_HEIGHT + LANE);
});

test.each([1, 3, 8])("laneModel: %i layer(s) alone give one layers lane of that many rows, each row a lane high, in the order of project.layers", (n) => {
  const m = laneModel(makeProject({ clips, layers: layersOf(n) }));
  expect(m.lanes).toEqual([{ id: "layers", index: 0, top: CLIP_AREA_HEIGHT, rows: n }]);
  expect(layerRowTops(m)).toEqual(Array.from({ length: n }, (_, i) => CLIP_AREA_HEIGHT + i * LANE));
  expect(m.lanesHeight).toBe(n * LANE);
  expect(m.height).toBe(CLIP_AREA_HEIGHT + n * LANE);
});

test("laneModel: layers that never overlap in time still get a row each", () => {
  const apart = [makeLayer({ id: "x", sourceDuration: 2, start: 0 }), makeLayer({ id: "y", sourceDuration: 2, start: 5 })];
  expect(layerRowTops(laneModel(makeProject({ clips, layers: apart })))).toEqual([laneTop(0), laneTop(1)]);
});

test("laneModel: music + voice + 2 layers + text + effects — the songs under the clips, then a row per layer, then text, then effects", () => {
  const m = laneModel(makeProject({ clips, audioTracks: [track("v", "voice"), track("m", "music")], layers: layersOf(2), overlays: [hi], effects: [fx] }));
  expect(m.lanes).toEqual([
    { id: "music", index: 0, top: 120, rows: 1 },
    { id: "voice", index: 1, top: 152, rows: 1 },
    { id: "layers", index: 2, top: 184, rows: 2 },
    { id: "overlays", index: 4, top: 248, rows: 1 },
    { id: "effects", index: 5, top: 280, rows: 1 },
  ]);
  expect(layerRowTops(m)).toEqual([184, 216]);
  expect(m.lanesHeight).toBe(6 * LANE);
  expect(m.height).toBe(312);
});

test("laneLift stays bounded by the strip's rise however many layer rows there are", () => {
  const eight = laneModel(makeProject({ clips, layers: layersOf(8), audioTracks: [track("m", "music")], overlays: [hi] }));
  expect(eight.lanesHeight).toBe(10 * LANE);
  expect(laneLift(eight, 2 * LANE)).toBe(2 * LANE);
  expect(laneLift(eight, 50)).toBe(50);
  expect(eight.height - laneLift(eight, 2 * LANE)).toBeGreaterThanOrEqual(CLIP_AREA_HEIGHT);
  // One layer alone is one row: the rise is capped by it.
  expect(laneLift(laneModel(makeProject({ clips, layers: layersOf(1) })), 2 * LANE)).toBe(LANE);
});

test("laneModel: the three everyday lanes (text, one sound, effects) give the height the timeline always had", () => {
  const m = laneModel(makeProject({ clips, overlays: [makeOverlay({ id: "o", text: "Hi", start: 0, end: 1 })], audioTracks: [track("m", "music")], effects: [makeEffect({ id: "e", start: 0, end: 1 })] }));
  expect(m.height).toBe(CLIP_AREA_HEIGHT + 3 * LANE);
  expect(m.height).toBe(216);
});

test("laneLift: a bar that grows rises over the lanes shown and never over the clip area", () => {
  const none = laneModel(makeProject({ clips }));
  const one = laneModel(makeProject({ clips, effects: [makeEffect({ id: "e", start: 0, end: 1 })] }));
  const two = laneModel(makeProject({ clips, effects: [makeEffect({ id: "e", start: 0, end: 1 })], audioTracks: [track("m", "music")] }));
  const three = laneModel(makeProject({ clips, effects: [makeEffect({ id: "e", start: 0, end: 1 })], audioTracks: [track("m", "music"), track("v", "voice")] }));
  expect(laneLift(none, 2 * LANE)).toBe(0);
  expect(laneLift(one, 2 * LANE)).toBe(LANE);
  expect(laneLift(two, 2 * LANE)).toBe(2 * LANE);
  expect(laneLift(three, 2 * LANE)).toBe(2 * LANE);
  expect(laneLift(one, 50)).toBe(LANE);
  expect(laneLift(two, 50)).toBe(50);
});

test("thumbTimes on a curved clip: the source time under each output-second mark", () => {
  // hero on 0–8: 1, 2, 3, 0.5, 0.5, 3, 2, 1 → 7.667 s on screen; marks at 0 … 7 s.
  const hero = { ...makeClip({ id: "h", sourceDuration: 8 }), speedCurve: { id: "hero" as const, steps: curveSteps("hero", 0, 8) } };
  expect(thumbTimes(hero, 64)).toEqual([0, 1, 3.083, 3.583, 4.083, 4.583, 5.5, 7.333]);
  expect(stripWidth(hero, 60)).toBeCloseTo(460, 6);
});

describe("overlayRows: which row of the text / stickers lane a bar sits in", () => {
  const bar = (id: string, start: number, end: number) => ({ id, start, end });

  test("no bars need no row; one bar, or bars that share no time, need one", () => {
    expect(overlayRows([])).toEqual({ rows: 0, rowOf: {} });
    expect(overlayRows([bar("a", 0, 2)])).toEqual({ rows: 1, rowOf: { a: 0 } });
    expect(overlayRows([bar("a", 0, 2), bar("b", 3, 4), bar("c", 6, 9)])).toEqual({ rows: 1, rowOf: { a: 0, b: 0, c: 0 } });
  });

  test("the owner's case: a text 0 – 3 s and a sticker 2 – 5 s are two rows, the text on top", () => {
    const hiText = makeOverlay({ id: "hi", text: "Hi", start: 0, end: 3 }), emoji = makeSticker({ id: "emoji", start: 2, end: 5 });
    expect(overlayRows([hiText, emoji])).toEqual({ rows: 2, rowOf: { hi: 0, emoji: 1 } });
    // By start time, not by array order: the sticker added first changes nothing.
    expect(overlayRows([emoji, hiText])).toEqual({ rows: 2, rowOf: { hi: 0, emoji: 1 } });
  });

  test("three that all share a moment are three rows", () => {
    expect(overlayRows([bar("a", 0, 5), bar("b", 1, 6), bar("c", 2, 7)])).toEqual({ rows: 3, rowOf: { a: 0, b: 1, c: 2 } });
  });

  test("a chain — A over B, B over C, A clear of C — is two rows, A and C sharing", () => {
    expect(overlayRows([bar("A", 0, 3), bar("B", 2, 6), bar("C", 5, 8)])).toEqual({ rows: 2, rowOf: { A: 0, B: 1, C: 0 } });
    expect(overlayRows([bar("C", 5, 8), bar("B", 2, 6), bar("A", 0, 3)])).toEqual({ rows: 2, rowOf: { A: 0, B: 1, C: 0 } });
  });

  test("forty back-to-back captions stay one row, and a title over all of them is one more — never a row per bar", () => {
    const captions = Array.from({ length: 40 }, (_, i) => bar(`c${i}`, i * 1.5, (i + 1) * 1.5));
    const packed = overlayRows(captions);
    expect(packed.rows).toBe(1);
    expect(Object.values(packed.rowOf)).toEqual(Array(40).fill(0));
    // Sums of fractions that do not land exactly (0.1 + 0.2 is not 0.3) still only touch.
    expect(overlayRows([bar("a", 0, 0.1 + 0.2), bar("b", 0.3, 1)]).rows).toBe(1);
    const titled = overlayRows([...captions, bar("title", 0, 60)]);
    expect(titled.rows).toBe(2);
    expect(titled.rowOf.title).toBe(1);   // same start as c0, later in the array
    expect(titled.rowOf.c0).toBe(0);
    expect(titled.rowOf.c39).toBe(0);
  });

  test("touching ends share a row; a real overlap, however short, does not", () => {
    expect(overlayRows([bar("a", 0, 2), bar("b", 2, 4)])).toEqual({ rows: 1, rowOf: { a: 0, b: 0 } });
    expect(overlayRows([bar("a", 0, 2), bar("b", 1.9995, 4)]).rows).toBe(1);   // within a millisecond: the same place
    expect(overlayRows([bar("a", 0, 2), bar("b", 1.99, 4)])).toEqual({ rows: 2, rowOf: { a: 0, b: 1 } });
  });

  test("the same start: the earlier in the array is the upper row", () => {
    expect(overlayRows([bar("x", 1, 4), bar("y", 1, 4), bar("z", 1, 2)])).toEqual({ rows: 3, rowOf: { x: 0, y: 1, z: 2 } });
    expect(overlayRows([bar("z", 1, 2), bar("y", 1, 4), bar("x", 1, 4)])).toEqual({ rows: 3, rowOf: { z: 0, y: 1, x: 2 } });
  });

  test("the same project always gives the same rows, and the input is not reordered", () => {
    const list = [bar("b", 2, 6), bar("a", 0, 3), bar("c", 5, 8), bar("d", 5.5, 6)];
    const copy = list.map((o) => ({ ...o }));
    const first = overlayRows(list);
    expect(overlayRows(list)).toEqual(first);
    expect(list).toEqual(copy);
    expect(first).toEqual({ rows: 3, rowOf: { a: 0, b: 1, c: 0, d: 2 } });
  });

  test("a bar dragged across another changes rows once at each place, never back and forth", () => {
    // s (3 s long) is dragged left over t (2 – 5), a hundredth of a second per step.
    const rows: number[] = [];
    for (let start = 6; start >= -2; start = Number((start - 0.01).toFixed(2))) rows.push(overlayRows([bar("t", 2, 5), bar("s", start, start + 3)]).rowOf.s);
    // clear of t (row 0) → over it, starting later (row 1) → over it, starting first (row 0, t moves down) → clear again (row 0)
    expect(rows.filter((r, i) => i > 0 && r !== rows[i - 1])).toEqual([1, 0]);
    expect(rows[0]).toBe(0);
    expect(rows[rows.length - 1]).toBe(0);
    // An end trimmed away from the next bar: one change, when they stop sharing time.
    const trimmed: number[] = [];
    for (let end = 5; end >= 0.5; end = Number((end - 0.01).toFixed(2))) trimmed.push(overlayRows([bar("a", 0, end), bar("b", 2, 6)]).rowOf.b);
    expect(trimmed.filter((r, i) => i > 0 && r !== trimmed[i - 1])).toEqual([0]);
  });

  test("total: zero-length, reversed and not-a-number ranges give every bar a row and never throw", () => {
    expect(overlayRows([bar("z", 2, 2)])).toEqual({ rows: 1, rowOf: { z: 0 } });
    // Reversed 5 → 1 is 1 – 5: it shares time with 0 – 3.
    expect(overlayRows([bar("a", 0, 3), bar("r", 5, 1)])).toEqual({ rows: 2, rowOf: { a: 0, r: 1 } });
    const odd = overlayRows([bar("n", NaN, NaN), bar("m", NaN, 4), bar("i", 0, Infinity), bar("j", -Infinity, 2), bar("k", 9, NaN)]);
    expect(Object.keys(odd.rowOf).sort()).toEqual(["i", "j", "k", "m", "n"]);
    for (const row of Object.values(odd.rowOf)) { expect(Number.isInteger(row)).toBe(true); expect(row).toBeGreaterThanOrEqual(0); expect(row).toBeLessThan(odd.rows); }
    expect(odd.rows).toBeLessThanOrEqual(5);
  });
});

test("laneModel: the text / stickers lane is as many rows as its bars need, and what is under it moves down by a row each", () => {
  const hiText = makeOverlay({ id: "hi", text: "Hi", start: 0, end: 3 }), emoji = makeSticker({ id: "emoji", start: 2, end: 5 });
  const music = track("m", "music");
  const one = laneModel(makeProject({ clips, audioTracks: [music], overlays: [hiText], effects: [fx] }));
  const two = laneModel(makeProject({ clips, audioTracks: [music], overlays: [hiText, emoji], effects: [fx] }));
  expect(one.lanes).toEqual([{ id: "music", index: 0, top: 120, rows: 1 }, { id: "overlays", index: 1, top: 152, rows: 1 }, { id: "effects", index: 2, top: 184, rows: 1 }]);
  expect(two.lanes).toEqual([{ id: "music", index: 0, top: 120, rows: 1 }, { id: "overlays", index: 1, top: 152, rows: 2 }, { id: "effects", index: 3, top: 216, rows: 1 }]);
  // One more row costs exactly a row: LANE_HEIGHT + LANE_GAP = 32 pt of timeline, which the preview gives.
  expect(two.height - one.height).toBe(LANE_HEIGHT + LANE_GAP);
  expect(two.lanesHeight - one.lanesHeight).toBe(32);
  // Apart in time they share the row again.
  const apart = laneModel(makeProject({ clips, audioTracks: [music], overlays: [hiText, { ...emoji, start: 3, end: 5 }], effects: [fx] }));
  expect(apart).toEqual(one);
  // Forty captions and a sticker over one of them: two rows, not forty-one.
  const captions = Array.from({ length: 40 }, (_, i) => makeOverlay({ id: `c${i}`, text: "c", start: i, end: i + 1 }));
  const sticker = makeSticker({ id: "s", start: 4.2, end: 4.8 });
  const many = laneModel(makeProject({ clips, overlays: [...captions, sticker] }));
  expect(many.lanes).toEqual([{ id: "overlays", index: 0, top: CLIP_AREA_HEIGHT, rows: 2 }]);
  expect(many.lanes[0].rows).toBe(overlayRows([...captions, sticker]).rows);
  expect(many.height).toBe(CLIP_AREA_HEIGHT + 2 * LANE);
  // The strips' lift follows the same model.
  expect(laneLift(laneModel(makeProject({ clips, overlays: [hiText] })), 2 * LANE)).toBe(LANE);
  expect(laneLift(laneModel(makeProject({ clips, overlays: [hiText, emoji] })), 2 * LANE)).toBe(2 * LANE);
});

test("rowOffset: a row's top inside its own lane; ROW_SLOP: half the gap between two rows", () => {
  expect([0, 1, 2].map(rowOffset)).toEqual([0, 32, 64]);
  expect(laneTop(3) - laneTop(1)).toBe(rowOffset(2));
  expect(ROW_SLOP).toBe(2);
  expect(ROW_SLOP * 2).toBeLessThanOrEqual(LANE_GAP);
});
