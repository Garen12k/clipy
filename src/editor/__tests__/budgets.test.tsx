import { theme } from "@/src/theme/theme";
import { PANEL, panelHeight } from "@/src/ui/ToolPanel";
import { BAR_HEIGHT, STRIP } from "@/src/ui/ToolStrip";
import { MULTI_BAR_HEIGHT } from "../components/MultiSelectBar";
import { LANE_GAP, LANE_HEIGHT, TIMELINE_HEIGHT } from "../timelineLayout";

const TOP_BAR = theme.size.row, TRANSPORT = theme.size.row;
/** The preview slot with the timeline showing: what the screen leaves after the top padding, the two rows, the timeline and the bottom area. */
const preview = (h: number, top: number, bottom: number, area: number) => h - (top + theme.space.sm) - TOP_BAR - TRANSPORT - TIMELINE_HEIGHT - area - Math.max(bottom, theme.space.sm);
/** … and with the timeline collapsed (a panel, or a strip with the keyboard). */
const previewOver = (h: number, top: number, tool: number, pad: number) => h - (top + theme.space.sm) - TOP_BAR - TRANSPORT - tool - pad;
/** One line of the 11-pt label. */
const LABEL = Math.ceil(theme.type.micro * 1.25);

test("a strip rises over exactly two lanes, so its top edge sits on a lane's top edge", () => {
  expect(STRIP.lift).toBe(2 * (LANE_HEIGHT + LANE_GAP));
  expect(STRIP.height).toBe(BAR_HEIGHT + STRIP.lift);
  expect(MULTI_BAR_HEIGHT).toBe(104);
  expect(STRIP.height - MULTI_BAR_HEIGHT).toBe(50);
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
  expect(preview(667, 20, 0, BAR_HEIGHT)).toBe(229);            // was 233 with the 86-pt bar
  expect(preview(852, 59, 34, BAR_HEIGHT)).toBe(349);           // was 353
  expect(preview(667, 20, 0, STRIP.height - STRIP.lift)).toBe(preview(667, 20, 0, BAR_HEIGHT));     // a strip takes its extra height from the timeline, not the preview
  expect(previewOver(667, 20, panelHeight("regular", 667), 8)).toBe(228);
  expect(previewOver(667, 20, panelHeight("compact", 667), 8)).toBe(295);
  expect(previewOver(667, 20, panelHeight("regular", 667, true), 260)).toBe(135);
  expect(previewOver(852, 59, panelHeight("regular", 852), 34)).toBe(263);
  expect(previewOver(852, 59, panelHeight("compact", 852), 34)).toBe(415);
  expect(previewOver(852, 59, panelHeight("regular", 852, true), 336)).toBe(166);
  expect(previewOver(667, 20, STRIP.height, 260)).toBe(129);    // Trim with the keyboard: was 133
  expect(previewOver(852, 59, STRIP.height, 336)).toBe(199);    // was 203
});
