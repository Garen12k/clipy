import { act, fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-06T12:00:00.000Z" }));
jest.mock("@react-native-community/slider", () => { const { View } = require("react-native"); return ({ testID, disabled, value, minimumValue, maximumValue, step, onSlidingStart, onValueChange }: { testID?: string; disabled?: boolean; value?: number; minimumValue?: number; maximumValue?: number; step?: number; onSlidingStart?: () => void; onValueChange?: (v: number) => void }) => <View testID={testID} {...{ disabled, value, minimumValue, maximumValue, step }} onTouchStart={() => onSlidingStart?.()} onTouchMove={(e: unknown) => onValueChange?.((e as { v?: number })?.v ?? 0)} />; });
import * as Haptics from "expo-haptics";
import { clipDuration } from "@/src/editor/model/timeline";
import { makeAudioTrack, makeClip, makePhotoClip, makeProject, type AudioTrack, type Project } from "@/src/editor/model/types";
import { BUNDLED_BEATS } from "@/src/editor/musicBeats";
import { useEditorStore } from "@/src/editor/store";
import { BEATS_BACKGROUND_TOOLS } from "@/src/lib/buildInfo";
import { useToast } from "@/src/ui/Toast";
import { BeatsSheet, findHint } from "../components/BeatsSheet";

const st = () => useEditorStore.getState();
const markers = () => st().project!.beatMarkers;
const btn = (name: string) => screen.getByRole("button", { name });
const slider = () => screen.getByTestId("beats-density");
const impact = Haptics.impactAsync as jest.Mock;
/** Bundled tracks as AddAudioSheet adds them: the manifest's title and length. */
const party = (extra: Partial<AudioTrack> = {}) => makeAudioTrack({ id: "party", title: "Party Sector", sourceDuration: 96.1, ...extra });
const seas = () => makeAudioTrack({ id: "seas", title: "The Frigid Seas", sourceDuration: 69.9 });
const own = () => makeAudioTrack({ id: "own", title: "my song.m4a", sourceDuration: 120 });
const open = async (p: Partial<Project>) => {
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 }), makePhotoClip({ id: "b", seconds: 3 }), makeClip({ id: "c", sourceDuration: 3 })], ...p }));
  return render(<BeatsSheet visible onClose={() => {}} />);
};
/** Party Sector: 120 bpm, first beat at 0.28 s. */
const FIRST = BUNDLED_BEATS["party-sector"]!.first;

beforeEach(() => { impact.mockClear(); useToast.getState().clear(); st().reset(); });

test("the hint says in one sentence what Find beats will do, or why it cannot", () => {
  expect(findHint("ok", "Party Sector")).toBe("Find beats marks the beats of Party Sector.");
  expect(findHint("unsteady", "The Frigid Seas")).toBe("The Frigid Seas has no steady beat. Tap the beat with Tap instead.");
  expect(findHint("own", "", false)).toBe("For your own music, Find beats needs the latest Clipy build. Until then, tap the beat with Tap.");
  expect(findHint("none", "")).toBe("Add music to find its beats.");
});

test("no music: Find beats and the slider are off and the hint says to add music; Cut to beats is off for want of markers; Tap still works", async () => {
  await open({});
  expect(btn("Find Beats")).toBeDisabled();
  expect(slider().props.disabled).toBe(true);
  expect(screen.getByText("Add music to find its beats.")).toBeTruthy();
  expect(btn("Cut to Beats")).toBeDisabled();
  expect(screen.getByText("Cut to beats needs beat markers.")).toBeTruthy();
  expect(btn("Tap")).toBeEnabled();
  await fireEvent.press(btn("Find Beats"));
  expect(st().past).toHaveLength(0);
});

test("music of the owner's own on a build without the listener: the hint says so, a tap says the sentence, nothing is placed", async () => {
  await open({ audioTracks: [own()] });
  expect(btn("Find Beats")).toBeEnabled();
  expect(screen.getByText("For your own music, Find beats needs the latest Clipy build. Until then, tap the beat with Tap.")).toBeTruthy();
  await fireEvent.press(btn("Find Beats"));
  expect(useToast.getState().message).toBe(BEATS_BACKGROUND_TOOLS);
  expect(markers()).toEqual([]);
  expect(st().past).toHaveLength(0);
});

test("the bundled track without a steady beat: off, and the hint names it", async () => {
  await open({ audioTracks: [seas()] });
  expect(btn("Find Beats")).toBeDisabled();
  expect(screen.getByText("The Frigid Seas has no steady beat. Tap the beat with Tap instead.")).toBeTruthy();
});

test("opening the panel places nothing", async () => {
  await open({ audioTracks: [party()] });
  expect(markers()).toEqual([]);
  expect(st().past).toHaveLength(0);
  expect(screen.getByText("Find beats marks the beats of Party Sector.")).toBeTruthy();
  expect(slider().props).toMatchObject({ value: 1, minimumValue: 0, maximumValue: 2, step: 1, disabled: false });
});

test("Find beats places every second beat of the track (the slider's middle) through the track's place on the timeline — one undo step", async () => {
  await open({ audioTracks: [party({ start: 2 })] });
  await fireEvent.press(btn("Find Beats"));
  // 10 s of video, the music from 2 s: beats 0.28, 1.28, 2.28 ... of the file land at 2.28, 3.28 ...
  expect(markers()).toEqual([0, 1, 2, 3, 4, 5, 6, 7].map((k) => Math.round((2 + FIRST + k) * 1000) / 1000));
  expect(st().past).toHaveLength(1);
  expect(impact).toHaveBeenCalledWith("medium");
  expect(screen.getByText("8 markers")).toBeTruthy();
  await act(() => { st().undo(); });
  expect(markers()).toEqual([]);
});

test("a second press with nothing to change is no undo step and says so", async () => {
  await open({ audioTracks: [party()] });
  await fireEvent.press(btn("Find Beats"));
  await fireEvent.press(btn("Find Beats"));
  expect(st().past).toHaveLength(1);
  expect(useToast.getState().message).toBe("The beat markers are already in place.");
});

test("Fewer / More before a Find only sets what the next Find does: no markers, no undo step", async () => {
  await open({ audioTracks: [party()] });
  await fireEvent(slider(), "touchStart");
  await fireEvent(slider(), "touchMove", { v: 2 });
  expect(markers()).toEqual([]);
  expect(st().past).toHaveLength(0);
  await fireEvent.press(btn("Find Beats"));
  expect(markers()).toHaveLength(20);                            // every beat: 0.28, 0.78 ... 9.78
  expect(markers()[1] - markers()[0]).toBeCloseTo(0.5, 9);
});

test("Fewer / More after a Find re-places the markers as it is dragged — the whole drag is one undo step", async () => {
  await open({ audioTracks: [party()] });
  await fireEvent.press(btn("Find Beats"));
  expect(markers()).toHaveLength(10);
  await fireEvent(slider(), "touchStart");
  await fireEvent(slider(), "touchMove", { v: 2 });
  expect(markers()).toHaveLength(20);
  await fireEvent(slider(), "touchMove", { v: 0 });
  expect(markers()).toEqual([0, 2, 4, 6, 8].map((k) => Math.round((FIRST + k) * 1000) / 1000));   // every 4th beat
  expect(st().past).toHaveLength(2);
  await act(() => { st().undo(); });
  expect(markers()).toHaveLength(10);
});

test("the selected music track is the one listened to; hand-tapped markers outside its stretch are kept", async () => {
  await open({ audioTracks: [own(), party({ start: 6 })], beatMarkers: [1.5, 7] });
  expect(btn("Find Beats")).toBeEnabled();                       // the first music track is the owner's own file: it can be listened to
  await act(() => { st().selectAudio("party"); });
  expect(btn("Find Beats")).toBeEnabled();
  await fireEvent.press(btn("Find Beats"));
  expect(markers()).toEqual([1.5, ...[0, 1, 2, 3].map((k) => Math.round((6 + FIRST + k) * 1000) / 1000)]);   // 7 was inside the track's stretch
});

test("closing the panel forgets the Find: the slider no longer re-places", async () => {
  const view = await open({ audioTracks: [party()] });
  await fireEvent.press(btn("Find Beats"));
  await view.rerender(<BeatsSheet visible={false} onClose={() => {}} />);
  await view.rerender(<BeatsSheet visible onClose={() => {}} />);
  await fireEvent(slider(), "touchStart");
  await fireEvent(slider(), "touchMove", { v: 0 });
  expect(markers()).toHaveLength(10);
  expect(st().past).toHaveLength(1);
});

test("Cut to beats: one tap shortens the clips onto the markers, one undo brings every clip back", async () => {
  await open({ beatMarkers: [1, 2, 3, 4, 5, 6, 7, 8, 9] });
  const before = st().project!.clips;
  expect(btn("Cut to Beats")).toBeEnabled();
  await fireEvent.press(btn("Cut to Beats"));
  expect(st().project!.clips.map((c) => clipDuration(c))).toEqual([4, 3, 3]);   // 4 and 4 + 3 are on beats already
  expect(st().past).toHaveLength(0);
  expect(useToast.getState().message).toBe("Nothing more to cut.");
  await act(() => { st().apply((p) => ({ ...p, beatMarkers: [1.5, 3.5, 6] })); });
  await fireEvent.press(btn("Cut to Beats"));
  expect(st().project!.clips.map((c) => clipDuration(c))).toEqual([3.5, 2.5, 3]);
  expect(st().project!.clips.map((c) => c.id)).toEqual(["a", "b", "c"]);
  expect(st().past).toHaveLength(2);
  expect(impact).toHaveBeenLastCalledWith("medium");
  expect(useToast.getState().message).toBe("Clips cut to the beat. Undo brings them back.");
  await act(() => { st().undo(); });
  expect(st().project!.clips).toBe(before);
});

test("Cut to beats is off with a single clip, and says so", async () => {
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 })], beatMarkers: [1, 2] }));
  await render(<BeatsSheet visible onClose={() => {}} />);
  expect(btn("Cut to Beats")).toBeDisabled();
  expect(screen.getByText("Cut to beats needs at least two clips.")).toBeTruthy();
});

// —— Review fixes: a toast is only shown when it is true, and the slider re-places only for the track the hint names ——

test("Cut to beats with no marker in reach of any cut changes nothing and does not claim the cuts are on a beat", async () => {
  await open({ beatMarkers: [9.5] });                            // the cuts are at 4 and 7: neither is on a beat, neither can reach one
  await fireEvent.press(btn("Cut to Beats"));
  expect(st().project!.clips.map((c) => clipDuration(c))).toEqual([4, 3, 3]);
  expect(st().past).toHaveLength(0);
  expect(useToast.getState().message).toBe("Nothing more to cut.");
});

test("Find beats with the music past the end of the video places nothing and says there are no beats there", async () => {
  await open({ audioTracks: [party({ start: 20 })] });           // 10 s of video
  await fireEvent.press(btn("Find Beats"));
  expect(markers()).toEqual([]);
  expect(st().past).toHaveLength(0);
  expect(screen.getByText("0 markers")).toBeTruthy();
  expect(useToast.getState().message).toBe("No beats in this part of the music.");
});

test("Find beats on a short trimmed piece with Fewer: no fourth beat is inside it, and the toast says so", async () => {
  await open({ audioTracks: [party({ trimStart: 0.5, trimEnd: 1.2 })] });   // every 4th beat: 0.28, 2.28 ... none in 0.5 - 1.2
  await fireEvent(slider(), "touchStart");
  await fireEvent(slider(), "touchMove", { v: 0 });
  await fireEvent.press(btn("Find Beats"));
  expect(markers()).toEqual([]);
  expect(st().past).toHaveLength(0);
  expect(useToast.getState().message).toBe("No beats in this part of the music.");
  // ... while every beat does reach it (0.78): that one is placed, and a second press is "already in place".
  await fireEvent(slider(), "touchMove", { v: 2 });
  await fireEvent.press(btn("Find Beats"));
  expect(markers()).toEqual([0.28]);
  await fireEvent.press(btn("Find Beats"));
  expect(useToast.getState().message).toBe("The beat markers are already in place.");
});

test("after the earliest track has changed (an undo, a redo) the slider no longer re-places the old track: it only sets the next Find", async () => {
  const funk = makeAudioTrack({ id: "funk", title: "Funked Up", sourceDuration: 66.3, start: 1 });
  await open({ audioTracks: [party(), funk] });
  await fireEvent.press(btn("Find Beats"));                      // for Party Sector, the earliest
  const found = markers();
  expect(found).toHaveLength(10);
  await act(() => { st().apply((p) => ({ ...p, audioTracks: p.audioTracks.map((t) => (t.id === "party" ? { ...t, start: 5 } : t)) })); });
  expect(screen.getByText("Find beats marks the beats of Funked Up.")).toBeTruthy();
  await fireEvent(slider(), "touchStart");
  await fireEvent(slider(), "touchMove", { v: 2 });
  expect(markers()).toEqual(found);                              // Party Sector's markers were not re-placed behind the hint's back
  expect(st().past).toHaveLength(2);                             // the Find and the move: the drag is no undo step
  await fireEvent.press(btn("Find Beats"));                      // the next Find is for Funked Up, at the density just set
  expect(st().past).toHaveLength(3);
  expect(markers()).toContain(1.105);                            // Funked Up from 1 s, its first beat at 0.105 (0.28 before it stays)
  // Now the slider follows Funked Up.
  await fireEvent(slider(), "touchStart");
  await fireEvent(slider(), "touchMove", { v: 0 });
  expect(markers()).not.toEqual(found);
  expect(st().past).toHaveLength(4);
});
