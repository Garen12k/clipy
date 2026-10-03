import { fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { makeClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { BackgroundSheet } from "../components/BackgroundSheet";

const bg = (i: number) => useEditorStore.getState().project!.clips[i].background;
const borderOf = (name: string) => {
  const style = Object.assign({}, ...[screen.getByRole("button", { name }).props.style].flat(3).filter(Boolean));
  return style.borderColor;
};

beforeEach(() => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 4 })] }));
});

test("Black is selected by default and carries the ring", async () => {
  await render(<BackgroundSheet clipId="a" visible onClose={() => {}} />);
  expect(screen.getByText("Background")).toBeTruthy();
  expect(borderOf("Black")).toBe(theme.ring.borderColor);
  expect(borderOf("Blur")).not.toBe(theme.ring.borderColor);
});

test("Blur and a palette colour set the clip background", async () => {
  await render(<BackgroundSheet clipId="a" visible onClose={() => {}} />);
  await fireEvent.press(screen.getByRole("button", { name: "Blur" }));
  expect(bg(0)).toEqual({ type: "blur" });
  expect(borderOf("Blur")).toBe(theme.ring.borderColor);
  await fireEvent.press(screen.getByRole("button", { name: "Color #C8102E" }));
  expect(bg(0)).toEqual({ type: "color", color: "#C8102E" });
  expect(bg(1)).toEqual({ type: "black" });
});

test("Apply to all copies the current clip's background to every clip", async () => {
  await render(<BackgroundSheet clipId="a" visible onClose={() => {}} />);
  await fireEvent.press(screen.getByRole("button", { name: "Blur" }));
  await fireEvent.press(screen.getByRole("button", { name: "Apply to all" }));
  expect(bg(0)).toEqual({ type: "blur" });
  expect(bg(1)).toEqual({ type: "blur" });
});

test("Apply to all is one undo step and one undo restores every clip", async () => {
  await render(<BackgroundSheet clipId="a" visible onClose={() => {}} />);
  await fireEvent.press(screen.getByRole("button", { name: "Blur" }));
  const past = useEditorStore.getState().past.length;
  await fireEvent.press(screen.getByRole("button", { name: "Apply to all" }));
  expect(useEditorStore.getState().past.length).toBe(past + 1);
  useEditorStore.getState().undo();
  expect(bg(0)).toEqual({ type: "blur" });
  expect(bg(1)).toEqual({ type: "black" });
});

test("only one black swatch is shown", async () => {
  await render(<BackgroundSheet clipId="a" visible onClose={() => {}} />);
  expect(screen.queryByRole("button", { name: "Color #000000" })).toBeNull();
});
