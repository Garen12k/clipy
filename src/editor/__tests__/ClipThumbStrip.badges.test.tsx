import { StyleSheet } from "react-native";
import { render, screen, within } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { FILTERS } from "@/src/editor/effects";
import { setClipSpeedCurve } from "@/src/editor/model/ops";
import { makeClip, makePhotoClip, makeProject, type Clip } from "@/src/editor/model/types";
import { theme } from "@/src/theme/theme";
import { ClipThumbStrip } from "../components/ClipThumbStrip";
import { BADGE } from "../timelineMarks";

// 4 s at 50 pt a second: a clip 200 pt wide.
const show = (clip: Clip, over: { pps?: number; selected?: boolean; missing?: boolean } = {}) =>
  render(<ClipThumbStrip clip={clip} pixelsPerSecond={over.pps ?? 50} selected={over.selected ?? false} missing={over.missing ?? false} onPress={() => {}} />);
const badgeIds = () => screen.queryAllByTestId(/^clip-badge-/).map((b) => b.props.testID);

test("a filter shows its NAME, as the Filter strip does, and a speed its value — no letter f", async () => {
  await show(makeClip({ id: "a", sourceDuration: 4, speed: 2, filter: "warm" }));   // 2 s of output at 50 → 100 pt
  expect(screen.getByText(FILTERS.warm.label)).toBeTruthy();
  expect(screen.getByText("Warm")).toBeTruthy();
  expect(screen.queryByText("f")).toBeNull();
  expect(badgeIds()).toEqual(["clip-badge-filter", "clip-badge-speed"]);
  expect(screen.getByText("2×")).toBeTruthy();
});

test("the speed reads as the Speed strip formats it", async () => {
  await show(makeClip({ id: "a", sourceDuration: 8, speed: 1.5 }));
  expect(screen.getByText("1.5×")).toBeTruthy();
});

test("no badges at the default speed with no filter", async () => {
  await show(makeClip({ id: "a", sourceDuration: 4 }));
  expect(screen.queryByTestId("clip-badges")).toBeNull();
  expect(screen.queryByText("1×")).toBeNull();
  expect(screen.queryByLabelText("Photo")).toBeNull();
});

test("a reversed clip says Reversed — no arrow", async () => {
  await show(makeClip({ id: "a", sourceDuration: 4, reversed: true }));
  expect(screen.getByText("Reversed")).toBeTruthy();
  expect(screen.queryByText("◀")).toBeNull();
});

test("a photo clip keeps its photo badge: a symbol, named Photo", async () => {
  await show(makePhotoClip({ id: "p" }), { pps: 60 });
  expect(screen.getByLabelText("Photo")).toBeTruthy();
  expect(badgeIds()).toEqual(["clip-badge-photo"]);
});

test("a clip with a speed curve shows the curve's label in the speed badge slot, not a speed", async () => {
  const curved = setClipSpeedCurve(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 })] }), "a", "jumpCut").clips[0];
  await show(curved);
  expect(screen.getByText("Jump cut")).toBeTruthy();
  expect(screen.queryByText("1×")).toBeNull();
});

test("every badge is white words on the solid dark scrim, one row at the bottom left, and takes no touches", async () => {
  await show(makeClip({ id: "a", sourceDuration: 4, filter: "warm", reversed: true }));
  const row = screen.getByTestId("clip-badges");
  expect(row.props.pointerEvents).toBe("none");
  expect(StyleSheet.flatten(row.props.style)).toMatchObject({ position: "absolute", bottom: 4, left: BADGE.inset, flexDirection: "row" });
  for (const id of ["clip-badge-filter", "clip-badge-reversed"]) {
    expect(screen.getByTestId(id)).toHaveStyle({ backgroundColor: theme.colors.scrimStrong });
    expect(within(screen.getByTestId(id)).getByText(/./)).toHaveStyle({ color: theme.colors.text, fontSize: theme.type.micro });
  }
});

test("at most two badges: the rest collapse into a count", async () => {
  await show(makeClip({ id: "a", sourceDuration: 8, speed: 2, filter: "warm", reversed: true }));   // 200 pt
  expect(badgeIds()).toEqual(["clip-badge-filter", "clip-badge-speed", "clip-badge-more"]);
  expect(screen.getByText("+1")).toBeTruthy();
  expect(screen.queryByText("Reversed")).toBeNull();
});

test("a clip under 100 pt shows no badge rather than a cut-off one", async () => {
  await show(makeClip({ id: "a", sourceDuration: 4, filter: "warm", reversed: true }), { pps: 24 });   // 96 pt
  expect(screen.queryByTestId("clip-badges")).toBeNull();
  expect(screen.queryByText("Warm")).toBeNull();
});

test("on a selected clip the badges start past the trim handle and stop before the Move grip", async () => {
  await show(makeClip({ id: "a", sourceDuration: 4, filter: "warm" }), { selected: true });   // 200 pt: 38 pt of room
  expect(StyleSheet.flatten(screen.getByTestId("clip-badges").props.style).left).toBe(BADGE.selectedInset);
  expect(screen.getByText("Warm")).toBeTruthy();
});

test("a missing file keeps its red warning at the top left, whatever the clip's width — clear of the handle when selected", async () => {
  const view = await show(makeClip({ id: "a", sourceDuration: 1 }), { missing: true });   // 50 pt
  expect(screen.getByTestId("clip-missing")).toHaveStyle({ position: "absolute", top: 4, left: BADGE.inset, backgroundColor: theme.colors.danger });
  expect(screen.getByLabelText("File missing")).toBeTruthy();
  await view.unmount();
  await show(makeClip({ id: "a", sourceDuration: 4 }), { missing: true, selected: true });
  expect(screen.getByTestId("clip-missing")).toHaveStyle({ left: BADGE.selectedInset });
});

test("no missing mark on a clip whose file is there", async () => {
  await show(makeClip({ id: "a", sourceDuration: 4 }));
  expect(screen.queryByTestId("clip-missing")).toBeNull();
});
