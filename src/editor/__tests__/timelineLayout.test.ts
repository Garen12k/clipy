import { curveSteps } from "@/src/editor/model/timeline";
import { makeClip } from "@/src/editor/model/types";
import { makeAudioTrack, makeEffect, makeLayer, makeOverlay, makeProject, makeSticker } from "@/src/editor/model/types";
import { audioLaneKinds, CLIP_AREA_HEIGHT, indexFromDrop, LANE_GAP, LANE_HEIGHT, laneLift, laneModel, type LaneModel, laneTop, layerRowTops, stripWidth, thumbInterval, thumbTimes } from "../timelineLayout";

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
