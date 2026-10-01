import { render, screen } from "@testing-library/react-native";
import { makeClip } from "@/src/editor/model/types";
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
