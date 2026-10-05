import { fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-05T10:00:00.000Z" }));
import { makeAudioTrack, makeClip, makeEffect, makePhotoClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { AudioFadeSheet } from "../components/AudioFadeSheet";
import { AudioVolumeSheet } from "../components/AudioVolumeSheet";
import { EffectStrengthSheet } from "../components/EffectStrengthSheet";
import { VolumeSheet } from "../components/VolumeSheet";

const st = () => useEditorStore.getState();
beforeEach(() => {
  st().reset();
  st().setProject(makeProject({
    clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 6 }), makePhotoClip({ id: "p" })],
    effects: [makeEffect({ id: "e", type: "glow", start: 1, end: 3 })],
    audioTracks: [makeAudioTrack({ id: "m", sourceDuration: 5 })],
  }));
});
/** A strip, not a modal sheet: inline, no scrim, ✓ closes. */
const expectStrip = async (title: string, onClose: jest.Mock) => {
  expect(screen.getByTestId("tool-strip")).toBeTruthy();
  expect(screen.getByRole("header", { name: title })).toBeTruthy();
  expect(screen.queryByLabelText("Close sheet")).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Done" }));
  expect(onClose).toHaveBeenCalledTimes(1);
};

test("Strength is a strip with one slider row", async () => {
  const onClose = jest.fn();
  await render(<EffectStrengthSheet effectId="e" visible onClose={onClose} />);
  expect(screen.getAllByTestId("strip-slider")).toHaveLength(1);
  await fireEvent(screen.getByTestId("effect-strength"), "slidingStart");
  await fireEvent(screen.getByTestId("effect-strength"), "valueChange", 0.35);
  expect(screen.getByText("Strength 35")).toBeTruthy();
  expect(st().past).toHaveLength(1);
  await expectStrip("Strength", onClose);
});

test("a sound's Volume is a strip with the export note in its header", async () => {
  const onClose = jest.fn();
  await render(<AudioVolumeSheet trackId="m" visible onClose={onClose} />);
  expect(screen.getByText("Above 100% only applies in the exported video.")).toBeTruthy();
  expect(screen.getAllByTestId("strip-slider")).toHaveLength(1);
  await expectStrip("Volume", onClose);
});

test("Fade is a strip with two slider rows; a drag is one undo step", async () => {
  const onClose = jest.fn();
  await render(<AudioFadeSheet target={{ type: "track", id: "m" }} visible onClose={onClose} />);
  expect(screen.getAllByTestId("strip-slider")).toHaveLength(2);
  await fireEvent(screen.getByTestId("fade-in"), "slidingStart");
  await fireEvent(screen.getByTestId("fade-in"), "valueChange", 1);
  await fireEvent(screen.getByTestId("fade-in"), "valueChange", 1.5);
  expect(screen.getByText("Fade in 1.5 s")).toBeTruthy();
  expect(st().past).toHaveLength(1);
  await expectStrip("Fade", onClose);
});

test("a clip's Volume: three rows for a video (volume with Mute, fade in, fade out), one for a photo and in clipIds mode", async () => {
  const onClose = jest.fn();
  const view = await render(<VolumeSheet clipId="a" visible onClose={onClose} />);
  expect(screen.getAllByTestId("strip-slider")).toHaveLength(3);
  expect(screen.getByLabelText("Mute")).toBeTruthy();
  expect(screen.getByText("Above 100% only applies in the exported video.")).toBeTruthy();
  await expectStrip("Volume", onClose);
  await view.rerender(<VolumeSheet clipId="p" visible onClose={onClose} />);
  expect(screen.getAllByTestId("strip-slider")).toHaveLength(1);
  await view.rerender(<VolumeSheet clipId="a" clipIds={["a", "b"]} visible onClose={onClose} />);
  expect(screen.getByRole("header", { name: "Volume · 2 clips" })).toBeTruthy();
  expect(screen.getAllByTestId("strip-slider")).toHaveLength(1);
});

test("hidden strips render nothing", async () => {
  await render(<><VolumeSheet clipId="a" visible={false} onClose={() => {}} /><AudioFadeSheet target={{ type: "track", id: "m" }} visible={false} onClose={() => {}} /></>);
  expect(screen.queryByTestId("tool-strip")).toBeNull();
  expect(screen.queryByTestId("volume-slider")).toBeNull();
});
