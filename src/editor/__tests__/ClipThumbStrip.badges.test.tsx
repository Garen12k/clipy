import { render, screen } from "@testing-library/react-native";
import { makeClip, makePhotoClip } from "@/src/editor/model/types";
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
