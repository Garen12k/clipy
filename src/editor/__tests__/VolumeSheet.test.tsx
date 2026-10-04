import { act, fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { makeClip, makePhotoClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { VolumeSheet } from "../components/VolumeSheet";

const clip = (i = 0) => useEditorStore.getState().project!.clips[i];
const past = () => useEditorStore.getState().past.length;
const drag = async (testID: string, ...values: number[]) => {
  const slider = screen.getByTestId(testID);
  await fireEvent(slider, "slidingStart");
  for (const v of values) await fireEvent(slider, "valueChange", v);
};

beforeEach(() => { useEditorStore.getState().reset(); useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 5 }), makePhotoClip({ id: "p" }), makeClip({ id: "l", sourceDuration: 30, speed: 2 })] })); });

test("slider drag is one undo step; mute toggles", async () => {
  await render(<VolumeSheet clipId="a" visible onClose={() => {}} />);
  await drag("volume-slider", 1.5);
  expect(clip().volume).toBe(1.5);
  expect(past()).toBe(1);
  await fireEvent(screen.getByLabelText("Mute"), "valueChange", true);
  expect(clip().muted).toBe(true);
  expect(screen.getByText("150%")).toBeTruthy();
});

test("a video clip has fade sliders capped at half its length", async () => {
  await render(<VolumeSheet clipId="a" visible onClose={() => {}} />);
  expect(screen.getByText("Fade in 0.0 s")).toBeTruthy();
  expect(screen.getByText("Fade out 0.0 s")).toBeTruthy();
  for (const id of ["fade-in", "fade-out"]) expect(screen.getByTestId(id).props).toMatchObject({ minimumValue: 0, maximumValue: 2.5, step: 0.05 });
});

test("the cap uses the clip's output length (speed counted), at most 5 s", async () => {
  await render(<VolumeSheet clipId="l" visible onClose={() => {}} />);
  expect(screen.getByTestId("fade-in").props.maximumValue).toBe(5);
});

test("each fade drag is one undo step and writes the clip's fade", async () => {
  await render(<VolumeSheet clipId="a" visible onClose={() => {}} />);
  await drag("fade-in", 0.5, 1.25);
  expect(clip()).toMatchObject({ fadeIn: 1.25, fadeOut: 0 });
  expect(past()).toBe(1);
  await drag("fade-out", 9);
  expect(clip()).toMatchObject({ fadeIn: 1.25, fadeOut: 2.5 });
  expect(screen.getByText("Fade out 2.5 s")).toBeTruthy();
  expect(past()).toBe(2);
  await act(() => { useEditorStore.getState().undo(); });
  expect(clip()).toMatchObject({ fadeIn: 1.25, fadeOut: 0 });
});

test("a photo has no fade sliders", async () => {
  await render(<VolumeSheet clipId="p" visible onClose={() => {}} />);
  expect(screen.getByTestId("volume-slider")).toBeTruthy();
  expect(screen.queryByTestId("fade-in")).toBeNull();
  expect(screen.queryByText(/Fade/)).toBeNull();
});
