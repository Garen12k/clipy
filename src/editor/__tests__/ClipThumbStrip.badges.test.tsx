import { render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { setClipSpeedCurve } from "@/src/editor/model/ops";
import { makeClip, makePhotoClip, makeProject } from "@/src/editor/model/types";
import { ClipThumbStrip } from "../components/ClipThumbStrip";

test("shows speed and filter badges when set", async () => {
  await render(
    <ClipThumbStrip clip={makeClip({ id: "a", sourceDuration: 4, speed: 2, filter: "warm" })} pixelsPerSecond={50} selected={false} missing={false} onPress={() => {}} />
  );
  expect(screen.getByText("2×")).toBeTruthy();
  expect(screen.getByText("f")).toBeTruthy();
});

test("shows no badges at default speed with no filter", async () => {
  await render(
    <ClipThumbStrip clip={makeClip({ id: "a", sourceDuration: 4 })} pixelsPerSecond={50} selected={false} missing={false} onPress={() => {}} />
  );
  expect(screen.queryByText("1×")).toBeNull();
  expect(screen.queryByText("f")).toBeNull();
});

test("shows a reverse badge for a reversed clip only", async () => {
  await render(<ClipThumbStrip clip={makeClip({ id: "a", sourceDuration: 4, reversed: true })} pixelsPerSecond={50} selected={false} missing={false} onPress={() => {}} />);
  expect(screen.getByText("◀")).toBeTruthy();
});

test("no reverse or photo badge by default", async () => {
  await render(<ClipThumbStrip clip={makeClip({ id: "a", sourceDuration: 4 })} pixelsPerSecond={50} selected={false} missing={false} onPress={() => {}} />);
  expect(screen.queryByText("◀")).toBeNull();
  expect(screen.queryByLabelText("Photo")).toBeNull();
});

test("a photo clip shows a photo badge", async () => {
  await render(<ClipThumbStrip clip={makePhotoClip({ id: "p" })} pixelsPerSecond={50} selected={false} missing={false} onPress={() => {}} />);
  expect(screen.getByLabelText("Photo")).toBeTruthy();
});

test("a clip with a speed curve shows the curve's label in the speed badge slot, not a speed", async () => {
  const curved = setClipSpeedCurve(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 })] }), "a", "jumpCut").clips[0];
  await render(<ClipThumbStrip clip={curved} pixelsPerSecond={50} selected={false} missing={false} onPress={() => {}} />);
  expect(screen.getByText("Jump cut")).toBeTruthy();
  expect(screen.queryByText("1×")).toBeNull();
});
