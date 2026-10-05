import { fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-05T10:00:00.000Z" }));
import { makeClip, makeLayer, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { BackgroundSheet } from "../components/BackgroundSheet";
import { BlendSheet } from "../components/BlendSheet";
import { MaskSheet } from "../components/MaskSheet";
import { RatioSheet } from "../components/RatioSheet";
import { TransformSheet } from "../components/TransformSheet";
import { TransitionSheet } from "../components/TransitionSheet";

const st = () => useEditorStore.getState();
beforeEach(() => {
  st().reset();
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4, width: 1920, height: 1080 }), makeClip({ id: "b", sourceDuration: 4 })], layers: [makeLayer({ id: "L", sourceDuration: 2 })] }));
});
const expectStrip = async (title: string, onClose: jest.Mock) => {
  expect(screen.getByTestId("tool-strip")).toBeTruthy();
  expect(screen.getByRole("header", { name: title })).toBeTruthy();
  expect(screen.queryByLabelText("Close sheet")).toBeNull();
  expect(screen.getAllByTestId("strip-tiles")).toHaveLength(1);       // one row: nothing wraps
  await fireEvent.press(screen.getByRole("button", { name: "Done" }));
  expect(onClose).toHaveBeenCalledTimes(1);
};
const cases: [string, (onClose: () => void) => React.JSX.Element, string][] = [
  ["Mask", (c) => <MaskSheet clipId="a" visible onClose={c} />, "Circle"],
  ["Blend", (c) => <BlendSheet clipId="L" visible onClose={c} />, "Multiply"],
  ["Background", (c) => <BackgroundSheet clipId="a" visible onClose={c} />, "Blur"],
  ["Aspect ratio", (c) => <RatioSheet visible onClose={c} />, "1:1"],
  ["Transition", (c) => <TransitionSheet clipIndex={0} visible onClose={c} />, "Dissolve"],
  ["Transform", (c) => <TransformSheet clipId="a" visible onClose={c} />, "Rotate 90°"],
];

test.each(cases)("%s is a strip with one scrolling row", async (title, make, probe) => {
  const onClose = jest.fn();
  await render(make(onClose));
  expect(screen.getByRole("button", { name: probe })).toBeTruthy();
  await expectStrip(title, onClose);
});

test("the notes sit in the strip's header", async () => {
  const view = await render(<BlendSheet clipId="L" visible onClose={() => {}} />);
  expect(screen.getByText("Shows in the exported video")).toBeTruthy();
  await view.rerender(<BackgroundSheet clipId="a" visible onClose={() => {}} />);
  expect(screen.getByText("Shown around a clip that does not fill the frame.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Apply to all" })).toBeTruthy();
  await view.rerender(<RatioSheet visible onClose={() => {}} />);
  expect(screen.getByText("9:16 for TikTok, Reels and Shorts. 1:1 for feeds. 16:9 for YouTube.")).toBeTruthy();
});

test("Transition: chips over one slider row; the last clip shows its message in a strip", async () => {
  const view = await render(<TransitionSheet clipIndex={0} visible onClose={() => {}} />);
  expect(screen.getAllByTestId("strip-slider")).toHaveLength(1);
  await fireEvent.press(screen.getByRole("button", { name: "Fade" }));
  expect(st().project!.clips[0].transitionOut).toEqual({ type: "fade", duration: 0.5 });
  expect(screen.getByText("0.50 s")).toBeTruthy();
  expect(st().past).toHaveLength(1);
  await view.rerender(<TransitionSheet clipIndex={1} visible onClose={() => {}} />);
  expect(screen.getByTestId("tool-strip")).toBeTruthy();
  expect(screen.getByText("No clip after this one")).toBeTruthy();
});

test("a pick is one undo step and a re-pick is none; a ratio pick closes", async () => {
  const onClose = jest.fn();
  const view = await render(<MaskSheet clipId="a" visible onClose={() => {}} />);
  await fireEvent.press(screen.getByRole("button", { name: "Circle" }));
  await fireEvent.press(screen.getByRole("button", { name: "Circle" }));
  expect(st().past).toHaveLength(1);
  await view.rerender(<RatioSheet visible onClose={onClose} />);
  await fireEvent.press(screen.getByRole("button", { name: "1:1" }));
  expect(st().project?.aspectRatio).toBe("1:1");
  expect(onClose).toHaveBeenCalledTimes(1);
});
