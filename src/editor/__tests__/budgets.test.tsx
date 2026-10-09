import { fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-05T10:00:00.000Z" }));
jest.mock("expo-video", () => {
  const { View } = require("react-native");
  const { useState } = require("react");
  const make = () => ({ playing: false, loop: false, muted: false, volume: 1, currentTime: 0, playbackRate: 1, timeUpdateEventInterval: 0, audioMixingMode: "auto", preservesPitch: true,
    play: jest.fn(), pause: jest.fn(), replaceAsync: jest.fn(async () => {}), addListener: jest.fn(() => ({ remove: () => {} })) });
  return { useVideoPlayer: (_source: unknown, setup?: (p: unknown) => void) => useState(() => { const p = make(); setup?.(p); return p; })[0], VideoView: View };
});
import { theme } from "@/src/theme/theme";
import { PANEL, panelHeight } from "@/src/ui/ToolPanel";
import { BAR_HEIGHT, STRIP } from "@/src/ui/ToolStrip";
import { makeAudioTrack, makeClip, makeEffect, makeOverlay, makeProject, type Project } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { MULTI_BAR_HEIGHT } from "../components/MultiSelectBar";
import { PreviewPlayer } from "../components/PreviewPlayer";
import { CLIP_AREA_HEIGHT, LANE_GAP, LANE_HEIGHT, laneLift, laneModel } from "../timelineLayout";

const TOP_BAR = theme.size.row, TRANSPORT = theme.size.row;
const LANE = LANE_HEIGHT + LANE_GAP;
const clips = [makeClip({ id: "a", sourceDuration: 10 })];
/** The three projects the numbers are stated for: clips only; a text and one sound; a text, one sound and an effect. */
const CLIPS_ONLY = makeProject({ clips });
const TWO_LANES = makeProject({ clips, overlays: [makeOverlay({ id: "o", text: "Hi", start: 0, end: 1 })], audioTracks: [makeAudioTrack({ id: "m", sourceDuration: 5 })] });
const THREE_LANES = { ...TWO_LANES, effects: [makeEffect({ id: "e", start: 0, end: 1 })] };
/**
 * The preview slot with the timeline showing: what the screen leaves after the top padding, the two rows, the timeline and the bottom
 * area. `area` is the bottom area's own height; `rise` is how much taller than the bar a strip is — it rises over the lanes shown, and
 * what the lanes cannot give comes out of the preview.
 */
const preview = (p: Project, h: number, top: number, bottom: number, area: number, rise = 0) => {
  const m = laneModel(p);
  return h - (top + theme.space.sm) - TOP_BAR - TRANSPORT - m.height - (area - laneLift(m, rise)) - Math.max(bottom, theme.space.sm);
};
/** The 9:16 frame in a slot: as high as the slot less the padding around it (the width never limits a tall frame on a phone). */
const FRAME_PAD = theme.space.xs;
const frame = (slot: number, w: number) => {
  const h = Math.min(slot - 2 * FRAME_PAD, ((w - 2 * FRAME_PAD) * 16) / 9);
  return { w: Math.round((h * 9) / 16), h };
};
/** … and with the timeline collapsed (a panel, or a strip with the keyboard). */
const previewOver = (h: number, top: number, tool: number, pad: number) => h - (top + theme.space.sm) - TOP_BAR - TRANSPORT - tool - pad;
/** One line of the 11-pt label. */
const LABEL = Math.ceil(theme.type.micro * 1.25);

test("a strip rises over exactly two lanes, so its top edge sits on a lane's top edge", () => {
  expect(STRIP.lift).toBe(2 * (LANE_HEIGHT + LANE_GAP));
  expect(STRIP.height).toBe(BAR_HEIGHT + STRIP.lift);
  // Multi-select's bar is the toolbar's height now (its count moved into the row), so a strip rises by the same two lanes there.
  expect(MULTI_BAR_HEIGHT).toBe(BAR_HEIGHT);
  expect(STRIP.height - MULTI_BAR_HEIGHT).toBe(STRIP.lift);
});

test("a strip only ever covers lanes: with fewer than two it rises over what there is and the preview gives the rest", () => {
  expect(laneLift(laneModel(CLIPS_ONLY), STRIP.lift)).toBe(0);
  expect(laneLift(laneModel({ ...CLIPS_ONLY, effects: THREE_LANES.effects }), STRIP.lift)).toBe(LANE);
  expect(laneLift(laneModel(TWO_LANES), STRIP.lift)).toBe(STRIP.lift);
  expect(laneLift(laneModel(THREE_LANES), STRIP.lift)).toBe(STRIP.lift);
  // Whatever the lanes, the strip's top edge is never above the bottom of the clip area.
  for (const p of [CLIPS_ONLY, { ...CLIPS_ONLY, effects: THREE_LANES.effects }, TWO_LANES, THREE_LANES]) {
    const m = laneModel(p);
    expect(m.height - laneLift(m, STRIP.lift)).toBeGreaterThanOrEqual(CLIP_AREA_HEIGHT);
    expect(m.height - laneLift(m, STRIP.height - MULTI_BAR_HEIGHT)).toBeGreaterThanOrEqual(CLIP_AREA_HEIGHT);
  }
});

test("the preview with lanes on demand, on two phones: slot heights and the 9:16 frame", () => {
  const small = (p: Project, strip = false) => preview(p, 667, 20, 0, strip ? STRIP.height : BAR_HEIGHT, strip ? STRIP.lift : 0);
  const big = (p: Project, strip = false) => preview(p, 852, 59, 34, strip ? STRIP.height : BAR_HEIGHT, strip ? STRIP.lift : 0);
  // Clips only: no lanes. A strip then has nothing to rise over and the preview gives up its whole extra height while it is open.
  expect([small(CLIPS_ONLY), big(CLIPS_ONLY)]).toEqual([325, 445]);
  expect([small(CLIPS_ONLY, true), big(CLIPS_ONLY, true)]).toEqual([325 - STRIP.lift, 445 - STRIP.lift]);
  // A text and one sound: two lanes, which a strip covers exactly — the preview does not move.
  expect([small(TWO_LANES), big(TWO_LANES)]).toEqual([325 - 2 * LANE, 445 - 2 * LANE]);
  expect([small(TWO_LANES, true), big(TWO_LANES, true)]).toEqual([small(TWO_LANES), big(TWO_LANES)]);
  // All three everyday lanes: the slot the editor always had.
  expect([small(THREE_LANES), big(THREE_LANES)]).toEqual([229, 349]);
  expect([small(THREE_LANES, true), big(THREE_LANES, true)]).toEqual([229, 349]);
  // The frame (9:16) with 4 pt around it.
  expect(frame(big(CLIPS_ONLY), 393)).toEqual({ w: 246, h: 437 });
  expect(frame(big(TWO_LANES), 393)).toEqual({ w: 210, h: 373 });
  expect(frame(big(THREE_LANES), 393)).toEqual({ w: 192, h: 341 });
  expect(frame(small(CLIPS_ONLY), 375)).toEqual({ w: 178, h: 317 });
  expect(frame(small(TWO_LANES), 375)).toEqual({ w: 142, h: 253 });
  expect(frame(small(THREE_LANES), 375)).toEqual({ w: 124, h: 221 });
});

test("the frame's margin in the preview is the smallest step of the scale: the rendered frame in a measured slot", async () => {
  expect(FRAME_PAD).toBe(4);
  useEditorStore.getState().reset();
  useEditorStore.getState().setProject(CLIPS_ONLY);
  await render(<PreviewPlayer />);
  const slot = screen.getByLabelText("Preview").parent!;
  const big = (p: Project) => preview(p, 852, 59, 34, BAR_HEIGHT);
  for (const p of [CLIPS_ONLY, TWO_LANES, THREE_LANES]) {
    // 9:16 on a 393-wide phone: the slot's height limits the frame, which then stands FRAME_PAD from the slot's top and bottom.
    await fireEvent(slot, "layout", { nativeEvent: { layout: { width: 393, height: big(p) } } });
    const { width, height } = screen.getByLabelText("Preview").props.style as { width: number; height: number };
    expect((big(p) - height) / 2).toBe(FRAME_PAD);
    expect({ w: Math.round(width), h: height }).toEqual(frame(big(p), 393));
    expect(width / height).toBeCloseTo(9 / 16, 3);
  }
  // A frame the slot's width limits (16:9) stands FRAME_PAD from its sides instead.
  useEditorStore.getState().setProject(makeProject({ clips, aspectRatio: "16:9" }));
  await render(<PreviewPlayer />);
  await fireEvent(screen.getByLabelText("Preview").parent!, "layout", { nativeEvent: { layout: { width: 393, height: 445 } } });
  const wide = screen.getByLabelText("Preview").props.style as { width: number; height: number };
  expect((393 - wide.width) / 2).toBe(FRAME_PAD);
  expect(wide.width / wide.height).toBeCloseTo(16 / 9, 3);
});

test("what has to fit, fits: a tool button in the bar and in a strip's row, three slider rows, the header's targets, a panel's header", () => {
  const column = theme.space.xs + theme.size.toolBox + theme.space.xs + LABEL + theme.space.xs;
  expect(column).toBeLessThanOrEqual(STRIP.tiles);
  expect(column).toBeLessThanOrEqual(BAR_HEIGHT - 1);
  expect(theme.size.chip).toBeLessThanOrEqual(STRIP.tiles);
  expect(3 * STRIP.slider).toBeLessThanOrEqual(STRIP.tiles + STRIP.slider);          // Volume + fade in + fade out
  expect(STRIP.header).toBe(theme.size.header);
  expect(PANEL.header).toBe(theme.size.header);
  expect(PANEL.lead).toBe(theme.size.header);
  expect(theme.size.header).toBeGreaterThanOrEqual(theme.size.touch);
  expect(theme.size.iconButton).toBeLessThanOrEqual(theme.size.row - theme.space.sm);   // the top bar: 48 with 8 under the buttons
});

test("the preview on two phones: the bar costs 4 pt, a strip does not resize it, panels are unchanged", () => {
  // 375 × 667 (insets 20 / 0, keyboard 260) and 393 × 852 (insets 59 / 34, keyboard 336).
  // With the three everyday lanes (text, one sound, effects) the timeline is as high as it always was.
  expect(preview(THREE_LANES, 667, 20, 0, BAR_HEIGHT)).toBe(229);            // was 233 with the 86-pt bar
  expect(preview(THREE_LANES, 852, 59, 34, BAR_HEIGHT)).toBe(349);           // was 353
  expect(preview(THREE_LANES, 667, 20, 0, STRIP.height, STRIP.lift)).toBe(preview(THREE_LANES, 667, 20, 0, BAR_HEIGHT));     // a strip takes its extra height from the timeline's lanes, not the preview
  expect(previewOver(667, 20, panelHeight("regular", 667), 8)).toBe(228);
  expect(previewOver(667, 20, panelHeight("compact", 667), 8)).toBe(295);
  expect(previewOver(667, 20, panelHeight("regular", 667, true), 260)).toBe(135);
  expect(previewOver(852, 59, panelHeight("regular", 852), 34)).toBe(263);
  expect(previewOver(852, 59, panelHeight("compact", 852), 34)).toBe(415);
  expect(previewOver(852, 59, panelHeight("regular", 852, true), 336)).toBe(166);
  expect(previewOver(667, 20, STRIP.height, 260)).toBe(129);    // Trim with the keyboard: was 133
  expect(previewOver(852, 59, STRIP.height, 336)).toBe(199);    // was 203
});
