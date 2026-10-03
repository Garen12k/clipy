import { fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { fitClip } from "@/src/editor/model/ops";
import { makeClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { TransformSheet } from "../components/TransformSheet";

const t = () => useEditorStore.getState().project!.clips[0].transform;

beforeEach(() => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4, width: 1920, height: 1080 })] }));
});

test("has the title and six buttons", async () => {
  await render(<TransformSheet clipId="a" visible onClose={() => {}} />);
  expect(screen.getByText("Transform")).toBeTruthy();
  for (const l of ["Rotate 90°", "Flip horizontal", "Flip vertical", "Fit", "Fill", "Reset"]) expect(screen.getByRole("button", { name: l })).toBeTruthy();
});

test("each button applies its op as one undo step", async () => {
  await render(<TransformSheet clipId="a" visible onClose={() => {}} />);
  await fireEvent.press(screen.getByRole("button", { name: "Rotate 90°" }));
  expect(t().rotation).toBe(90);
  await fireEvent.press(screen.getByRole("button", { name: "Flip horizontal" }));
  expect(t().flipH).toBe(true);
  await fireEvent.press(screen.getByRole("button", { name: "Flip vertical" }));
  expect(t().flipV).toBe(true);
  const before = useEditorStore.getState().project!;
  await fireEvent.press(screen.getByRole("button", { name: "Fit" }));
  expect(t()).toEqual(fitClip(before, "a").clips[0].transform);
  await fireEvent.press(screen.getByRole("button", { name: "Fill" }));
  expect(t().scale).toBe(1);
  await fireEvent.press(screen.getByRole("button", { name: "Reset" }));
  expect(t()).toEqual({ scale: 1, x: 0, y: 0, rotation: 0, flipH: false, flipV: false });
  useEditorStore.getState().undo();
  expect(t().scale).toBe(1);
  expect(t().flipV).toBe(true);
  expect(t().rotation).toBe(90);
});

test("renders nothing without a clip", async () => {
  await render(<TransformSheet clipId={null} visible onClose={() => {}} />);
  expect(screen.queryByText("Transform")).toBeNull();
});
