import { fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { makeClip, makePhotoClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { TrimSheet } from "../components/TrimSheet";

beforeEach(() => { useEditorStore.getState().reset(); });

test("a photo shows one Length field with helper text; Apply sets its length in one undo step", async () => {
  useEditorStore.getState().setProject(makeProject({ clips: [makePhotoClip({ id: "p", seconds: 3 }), makeClip({ id: "a", sourceDuration: 4 })] }));
  await render(<TrimSheet clipId="p" visible onClose={() => {}} />);
  expect(screen.queryByLabelText("Trim start")).toBeNull();
  expect(screen.getByText("How long the photo stays on screen (0.5 – 60 s)")).toBeTruthy();
  const field = screen.getByLabelText("Length");
  expect(field.props.value).toBe("3.0");
  await fireEvent.changeText(field, "7.5");
  await fireEvent.press(screen.getByRole("button", { name: "Apply" }));
  const c = useEditorStore.getState().project!.clips[0];
  expect([c.trimStart, c.trimEnd]).toEqual([0, 7.5]);
  expect(useEditorStore.getState().past).toHaveLength(1);
});

test("a photo length is clamped to 0.5–60", async () => {
  useEditorStore.getState().setProject(makeProject({ clips: [makePhotoClip({ id: "p", seconds: 3 })] }));
  await render(<TrimSheet clipId="p" visible onClose={() => {}} />);
  await fireEvent.changeText(screen.getByLabelText("Length"), "500");
  await fireEvent.press(screen.getByRole("button", { name: "Apply" }));
  expect(useEditorStore.getState().project!.clips[0].trimEnd).toBe(60);
});

test("a video still shows Start and End", async () => {
  useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 })] }));
  await render(<TrimSheet clipId="a" visible onClose={() => {}} />);
  expect(screen.getByLabelText("Trim start")).toBeTruthy();
  expect(screen.getByLabelText("Trim end")).toBeTruthy();
  expect(screen.queryByLabelText("Length")).toBeNull();
});
