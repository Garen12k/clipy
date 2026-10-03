import { fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@/src/editor/components/thumbnails", () => ({ getThumb: jest.fn(async () => "file:///thumb.jpg") }));
import { makeClip, makePhotoClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { FilterSheet } from "../components/FilterSheet";

beforeEach(() => { useEditorStore.getState().reset(); useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 4 })] })); });

test("tiles apply a filter to the clip; Apply to all applies to every clip", async () => {
  await render(<FilterSheet clipId="a" visible onClose={() => {}} />);
  await fireEvent.press(screen.getByRole("button", { name: "Warm" }));
  expect(useEditorStore.getState().project!.clips.map((c) => c.filter)).toEqual(["warm", null]);
  await fireEvent.press(screen.getByRole("button", { name: "Apply to all clips" }));
  expect(useEditorStore.getState().project!.clips.map((c) => c.filter)).toEqual(["warm", "warm"]);
  await fireEvent.press(screen.getByRole("button", { name: "None" }));
  expect(useEditorStore.getState().project!.clips[0].filter).toBeNull();
});

test("a photo clip's tiles use the photo itself, not the video thumbnailer", async () => {
  const { getThumb } = jest.requireMock("@/src/editor/components/thumbnails") as { getThumb: jest.Mock };
  getThumb.mockClear();
  useEditorStore.getState().setProject(makeProject({ clips: [makePhotoClip({ id: "p", sourceUri: "file:///media/p.jpg" })] }));
  await render(<FilterSheet clipId="p" visible onClose={() => {}} />);
  expect(getThumb).not.toHaveBeenCalled();
  expect(screen.getByTestId("filter-thumb-warm").props.source).toEqual({ uri: "file:///media/p.jpg" });
});
