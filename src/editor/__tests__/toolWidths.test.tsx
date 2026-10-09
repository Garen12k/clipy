import { render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@/src/editor/components/thumbnails", () => ({ getThumb: jest.fn(async () => "file:///thumb.jpg") }));
jest.mock("@/src/projects/prefs", () => ({ prefs: { getRecentEmoji: jest.fn(async () => []), pushRecentEmoji: jest.fn(async () => {}) } }));
jest.mock("@react-native-community/slider", () => { const { View } = require("react-native"); return ({ testID }: { testID?: string }) => <View testID={testID} />; });
import { Dimensions } from "react-native";
import { makeClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { panelBodyWidth } from "@/src/ui/ToolPanel";
import { toolWidth } from "@/src/ui/ToolStrip";
import { coverScale } from "../components/CoverSheet";
import { FilterSheet } from "../components/FilterSheet";
import { emojiCellWidth, StickerSheet } from "../components/StickerSheet";

/** The three iPhone widths, and 320 (a phone with Display Zoom on). */
const WIDTHS = [375, 393, 430] as const;
const window = Dimensions.get("window");
const setWidth = (width: number) => Dimensions.set({ window: { ...window, width } });

beforeEach(() => { useEditorStore.getState().reset(); useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 })] })); });
afterEach(() => { Dimensions.set({ window }); });

type Inst = ReturnType<typeof screen.getByTestId>;
const findScroll = (n: Inst): Inst | null => { if (n.props.contentOffset !== undefined) return n; for (const c of n.children) { if (typeof c === "string") continue; const f = findScroll(c as Inst); if (f) return f; } return null; };

test.each(WIDTHS)("Filter at %i pt: with the last filter chosen the row opens at its very end — the end of the CARD, 16 pt past where a window-wide row would stop", async (w) => {
  setWidth(w);
  useEditorStore.getState().apply((p) => ({ ...p, clips: p.clips.map((c) => ({ ...c, filter: "drama" as const })) }));
  await render(<FilterSheet clipId="a" visible onClose={() => {}} />);
  const content = 32 * 52 + 31 * 8 + 2 * theme.space.gutter;
  expect(findScroll(screen.getByTestId("strip-tiles"))!.props.contentOffset.x).toBe(content - toolWidth(w));
  expect(content - toolWidth(w)).toBe(content - w + 16);
});

test("the emoji grid lays out by the body's real width: eight cells share it in whole points and never run past the card", async () => {
  expect([320, ...WIDTHS].map((w) => emojiCellWidth(panelBodyWidth(w)))).toEqual([34, 40, 43, 47]);
  for (const w of [320, ...WIDTHS]) {
    expect(8 * emojiCellWidth(panelBodyWidth(w))).toBeLessThanOrEqual(panelBodyWidth(w));
    expect(panelBodyWidth(w) - 8 * emojiCellWidth(panelBodyWidth(w))).toBeLessThan(8);     // and the row is full: less than a point a cell is left
    expect(emojiCellWidth(panelBodyWidth(w))).toBeGreaterThanOrEqual(32);                  // room for a 24-pt emoji
  }
  for (const w of [320, 375, 430]) {
    setWidth(w);
    const view = await render(<StickerSheet visible onClose={() => {}} onAdded={() => {}} />);
    const cell = (await screen.findAllByLabelText(/^Emoji /))[0];
    expect(cell).toHaveStyle({ width: emojiCellWidth(panelBodyWidth(w)), height: 36 });
    await view.unmount();
  }
});

test("the cover frame fits the body's real width, and is the size it was: a wide cover is as wide as the body, a tall one keeps its 240 pt", () => {
  for (const w of WIDTHS) {
    const body = panelBodyWidth(w);
    expect(body).toBe(w - 48);                                          // what the panel allowed the frame before the card, to the point
    expect(coverScale(body, 9 / 16)).toBe(1);                           // 135 × 240
    expect(coverScale(body, 1)).toBe(1);                                // 240 × 240
    expect(240 * (16 / 9) * coverScale(body, 16 / 9)).toBeCloseTo(Math.min(body, 240 * (16 / 9)), 6);
    expect(240 * (21 / 9) * coverScale(body, 21 / 9)).toBeCloseTo(body, 6);   // the widest ratio: exactly the body
  }
});
