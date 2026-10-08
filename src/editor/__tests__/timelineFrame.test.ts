import { makeAudioTrack, makeClip, makeEffect, makeLayer, makeOverlay, makeProject } from "@/src/editor/model/types";
import { MULTI_BAR_HEIGHT } from "../components/MultiSelectBar";
import { STRIP } from "@/src/ui/ToolStrip";
import { barIds, barRow, CLIP_AREA_HEIGHT, LANE_GAP, LANE_HEIGHT, laneLift, laneModel, rowScrollTarget, rowsThumb, timelineFrame, visibleLaneRows } from "../timelineLayout";

const LANE = LANE_HEIGHT + LANE_GAP;
/** The smallest and the largest iPhone the app runs on (points): SE 375 × 667, Pro Max 440 × 956. */
const SMALL = 667, LARGE = 956;
/** A project with `n` rows under the clips: `n` layers (one row each). */
const withRows = (n: number) => makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })], layers: Array.from({ length: n }, (_, i) => makeLayer({ id: `l${i}`, sourceDuration: 4 })) });

describe("how many rows show under the clips", () => {
  test("two and a half on the smallest iPhone, one more for every 80 points of screen; always a whole number and a half", () => {
    expect(visibleLaneRows(SMALL)).toBe(2.5);
    expect([568, 667, 746, 747, 812, 844, 852, 874, 932, LARGE].map(visibleLaneRows)).toEqual([2.5, 2.5, 2.5, 3.5, 3.5, 4.5, 4.5, 4.5, 5.5, 5.5]);
    for (const h of [0, NaN, -5, Infinity]) expect(visibleLaneRows(h)).toBe(2.5);
  });
});

describe("the timeline's height: its rows up to a cap, then the rows scroll", () => {
  test.each([
    // rows, height on the smallest, height on the largest
    [0, 120, 120], [1, 152, 152], [2, 184, 184], [3, 200, 216], [4, 200, 248], [5, 200, 280],
    [6, 200, 296], [7, 200, 296], [8, 200, 296], [9, 200, 296], [10, 200, 296], [11, 200, 296], [12, 200, 296],
  ])("%i rows: %i on the smallest screen, %i on the largest", (rows, small, large) => {
    const model = laneModel(withRows(rows));
    expect(model.height).toBe(CLIP_AREA_HEIGHT + rows * LANE);                       // the model still counts every row
    expect(timelineFrame(model, SMALL).height).toBe(small);
    expect(timelineFrame(model, LARGE).height).toBe(large);
  });

  test("a small project is exactly as before: the frame is the model's own height and nothing scrolls", () => {
    for (const h of [SMALL, LARGE]) for (let rows = 0; rows <= Math.floor(visibleLaneRows(h)); rows++) {
      const model = laneModel(withRows(rows));
      expect(timelineFrame(model, h)).toEqual({ height: model.height, viewport: model.lanesHeight, content: model.lanesHeight, scrolls: false });
    }
  });

  test("past the cap the height stops, the clip area keeps its place and the last row shown is cut in half", () => {
    const f = timelineFrame(laneModel(withRows(12)), SMALL);
    expect(f).toEqual({ height: CLIP_AREA_HEIGHT + 2.5 * LANE, viewport: 2.5 * LANE, content: 12 * LANE, scrolls: true });
    // The height never depends on the row count again: the preview keeps its size however many layers are added.
    for (let rows = 3; rows <= 40; rows++) expect(timelineFrame(laneModel(withRows(rows)), SMALL).height).toBe(200);
  });

  test("no project: the clip area", () => {
    expect(timelineFrame(laneModel(null), SMALL)).toEqual({ height: CLIP_AREA_HEIGHT, viewport: 0, content: 0, scrolls: false });
  });

  test("a tool strip never rises over more than is shown: the smallest cap is taller than either bar's rise, so laneLift is unchanged", () => {
    const cap = visibleLaneRows(0) * LANE;
    expect(cap).toBeGreaterThanOrEqual(STRIP.lift);
    expect(cap).toBeGreaterThanOrEqual(STRIP.height - MULTI_BAR_HEIGHT);
    const model = laneModel(withRows(12));
    expect(laneLift(model, STRIP.lift)).toBeLessThanOrEqual(timelineFrame(model, SMALL).viewport);
  });
});

describe("which row a bar is in", () => {
  const project = makeProject({
    clips: [makeClip({ id: "a", sourceDuration: 10 })],
    audioTracks: [makeAudioTrack({ id: "m", sourceDuration: 5 }), makeAudioTrack({ id: "v", kind: "voice", sourceDuration: 2 }), makeAudioTrack({ id: "m2", sourceDuration: 5, start: 5 })],
    layers: [makeLayer({ id: "l0", sourceDuration: 4 }), makeLayer({ id: "l1", sourceDuration: 4 })],
    overlays: [makeOverlay({ id: "t0", text: "a", start: 0, end: 2 }), makeOverlay({ id: "t1", text: "b", start: 1, end: 3 }), makeOverlay({ id: "t2", text: "c", start: 2, end: 4 })],
    effects: [makeEffect({ id: "e0" })],
  });

  test("rows count from the first one under the clips, in the lane order", () => {
    // music 0, voice 1, layers 2–3, texts 4–5 (t0 and t2 share a row), effects 6
    expect(["m", "m2", "v", "l0", "l1", "t0", "t1", "t2", "e0"].map((id) => barRow(project, id))).toEqual([0, 0, 1, 2, 3, 4, 5, 4, 6]);
    expect(laneModel(project).lanesHeight).toBe(7 * LANE);
  });

  test("a main clip, an unknown id and no project are in no row", () => {
    expect(barRow(project, "a")).toBeNull();
    expect(barRow(project, "nope")).toBeNull();
    expect(barRow(null, "m")).toBeNull();
  });

  test("barIds lists every bar under the clips (never the main clips)", () => {
    expect(barIds(project)).toEqual(["m", "v", "m2", "l0", "l1", "t0", "t1", "t2", "e0"]);
    expect(barIds(null)).toEqual([]);
  });
});

describe("bringing a row into view", () => {
  const viewport = 2.5 * LANE, content = 12 * LANE;   // 80 of 384
  const to = (y: number, row: number | null) => rowScrollTarget({ y, viewport, content, row });

  test("a row that is wholly shown does not move the rows", () => {
    expect(to(0, 0)).toBe(0);
    expect(to(0, 1)).toBe(0);
    expect(to(40, 2)).toBe(40);      // row 2 = 64…96, shown 40…120
  });

  test("a row below comes up just far enough to show whole; a row above comes down to the top", () => {
    expect(to(0, 2)).toBe(3 * LANE - viewport);          // 16: the half row becomes a whole one
    expect(to(0, 11)).toBe(content - viewport);          // the last row: the end
    expect(to(200, 3)).toBe(3 * LANE);
    expect(to(200, 0)).toBe(0);
  });

  test("no row: only kept inside what there is (rows were removed under the scroll position)", () => {
    expect(to(100, null)).toBe(100);
    expect(rowScrollTarget({ y: 300, viewport, content: 4 * LANE, row: null })).toBe(4 * LANE - viewport);
    expect(rowScrollTarget({ y: 300, viewport: 2 * LANE, content: 2 * LANE, row: null })).toBe(0);      // everything fits again
    expect(rowScrollTarget({ y: 50, viewport: 2 * LANE, content: 2 * LANE, row: 1 })).toBe(0);
    expect(to(-20, null)).toBe(0);
    expect(to(NaN, null)).toBe(0);
  });
});

describe("the thumb that says there are more rows", () => {
  const viewport = 80, content = 384;
  test("nothing when every row shows", () => {
    expect(rowsThumb({ y: 0, viewport: 64, content: 64 })).toBeNull();
    expect(rowsThumb({ y: 0, viewport: 0, content: 0 })).toBeNull();
  });
  test("as long as the share of rows shown (never under 12), from the top of the rows to their bottom", () => {
    const top = rowsThumb({ y: 0, viewport, content })!, end = rowsThumb({ y: content - viewport, viewport, content })!;
    expect(top.height).toBeCloseTo(80 * 80 / 384);
    expect(top.top).toBe(0);
    expect(end.top + end.height).toBeCloseTo(viewport);
    expect(rowsThumb({ y: 152, viewport, content })!.top).toBeCloseTo((viewport - top.height) / 2);
    expect(rowsThumb({ y: 0, viewport, content: 4000 })!.height).toBe(12);
    // A position past either end (a bounce, a stale offset) keeps the thumb inside its track.
    expect(rowsThumb({ y: -30, viewport, content })!.top).toBe(0);
    expect(rowsThumb({ y: 9999, viewport, content })!.top + top.height).toBeCloseTo(viewport);
  });
});
