import { act, fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { makeAudioTrack, makeClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { AudioFadeSheet, fadeCap } from "../components/AudioFadeSheet";
import { AudioVolumeSheet } from "../components/AudioVolumeSheet";

const track = (id = "m") => useEditorStore.getState().project!.audioTracks.find((t) => t.id === id)!;
const past = () => useEditorStore.getState().past.length;
const drag = async (testID: string, ...values: number[]) => {
  const slider = screen.getByTestId(testID);
  await fireEvent(slider, "slidingStart");
  for (const v of values) await fireEvent(slider, "valueChange", v);
};

beforeEach(() => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setProject(makeProject({
    clips: [makeClip({ id: "a", sourceDuration: 30 })],
    audioTracks: [makeAudioTrack({ id: "m", sourceDuration: 20, volume: 1.2, fadeIn: 1.5 }), makeAudioTrack({ id: "s", sourceDuration: 0.6, kind: "sfx" })],
  }));
});

describe("AudioVolumeSheet", () => {
  test("shows the track's volume on a 0–2 slider", async () => {
    await render(<AudioVolumeSheet trackId="m" visible onClose={() => {}} />);
    expect(screen.getByText("Volume 120 %")).toBeTruthy();
    expect(screen.getByTestId("audio-volume").props).toMatchObject({ minimumValue: 0, maximumValue: 2, value: 1.2 });
  });

  test("a drag is one undo step and only changes that track", async () => {
    await render(<AudioVolumeSheet trackId="m" visible onClose={() => {}} />);
    await drag("audio-volume", 0.9, 0.5);
    expect(track().volume).toBe(0.5);
    expect(track("s").volume).toBe(1);
    expect(screen.getByText("Volume 50 %")).toBeTruthy();
    expect(past()).toBe(1);
    await act(() => { useEditorStore.getState().undo(); });
    expect(track().volume).toBe(1.2);
  });

  test("renders nothing without a track", async () => {
    await render(<AudioVolumeSheet trackId={null} visible onClose={() => {}} />);
    expect(screen.queryByTestId("audio-volume")).toBeNull();
  });
});

describe("AudioFadeSheet", () => {
  test("fadeCap is half the length, at most 5 s, never negative", () => {
    expect(fadeCap(20)).toBe(5);
    expect(fadeCap(6)).toBe(3);
    expect(fadeCap(0.6)).toBeCloseTo(0.3);
    expect(fadeCap(-1)).toBe(0);
  });

  test("two sliders with the track's fades, 0 – min(5, length / 2) in 0.05 steps", async () => {
    await render(<AudioFadeSheet target={{ type: "track", id: "m" }} visible onClose={() => {}} />);
    expect(screen.getByText("Fade in 1.5 s")).toBeTruthy();
    expect(screen.getByText("Fade out 0.0 s")).toBeTruthy();
    for (const id of ["fade-in", "fade-out"]) expect(screen.getByTestId(id).props).toMatchObject({ minimumValue: 0, maximumValue: 5, step: 0.05 });
    expect(screen.getByTestId("fade-in").props.value).toBe(1.5);
  });

  test("the cap follows the trimmed length: a 0.6 s sound fades at most 0.3 s", async () => {
    await render(<AudioFadeSheet target={{ type: "track", id: "s" }} visible onClose={() => {}} />);
    expect(screen.getByTestId("fade-in").props.maximumValue).toBeCloseTo(0.3);
    await drag("fade-out", 4);
    expect(track("s").fadeOut).toBe(0.3);
  });

  test("each drag is one undo step; fade in and fade out are written separately", async () => {
    await render(<AudioFadeSheet target={{ type: "track", id: "m" }} visible onClose={() => {}} />);
    await drag("fade-in", 1, 2.5);
    expect(track()).toMatchObject({ fadeIn: 2.5, fadeOut: 0 });
    expect(past()).toBe(1);
    await drag("fade-out", 0.75);
    expect(track()).toMatchObject({ fadeIn: 2.5, fadeOut: 0.75 });
    expect(screen.getByText("Fade in 2.5 s")).toBeTruthy();
    expect(past()).toBe(2);
    await act(() => { useEditorStore.getState().undo(); });
    expect(track()).toMatchObject({ fadeIn: 2.5, fadeOut: 0 });
  });

  test("renders nothing without a target or for an unknown track", async () => {
    await render(<AudioFadeSheet target={null} visible onClose={() => {}} />);
    expect(screen.queryByTestId("fade-in")).toBeNull();
    await render(<AudioFadeSheet target={{ type: "track", id: "nope" }} visible onClose={() => {}} />);
    expect(screen.queryByTestId("fade-in")).toBeNull();
  });
});
