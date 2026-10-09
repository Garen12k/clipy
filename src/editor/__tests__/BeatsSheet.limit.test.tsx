import { fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-06T12:00:00.000Z" }));
jest.mock("@react-native-community/slider", () => { const { View } = require("react-native"); return ({ testID, onSlidingStart, onValueChange, onSlidingComplete }: { testID?: string; onSlidingStart?: () => void; onValueChange?: (v: number) => void; onSlidingComplete?: (v: number) => void }) => <View testID={testID} onTouchStart={() => onSlidingStart?.()} onTouchMove={(e: unknown) => onValueChange?.((e as { v?: number })?.v ?? 0)} onTouchEnd={(e: unknown) => onSlidingComplete?.((e as { v?: number })?.v ?? 0)} />; });
jest.mock("@/src/editor/model/beats", () => { const real = jest.requireActual("@/src/editor/model/beats"); return { ...real, beatCutState: jest.fn(real.beatCutState) }; });
import { beatCutState } from "@/src/editor/model/beats";
import { BEAT_LIMITS, makeAudioTrack, makeClip, makeProject, type Project } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { useToast } from "@/src/ui/Toast";
import { BeatsSheet } from "../components/BeatsSheet";

// The 300-marker limit, told to the owner: 100 s of video, Party Sector (120 bpm) under its second half, and 250 hand-tapped
// markers in the first half. Every 2nd beat of the 50 s is 50 markers — exactly 300, they fit. Every beat is 100: 50 do not.

const LEFT_OUT = "Only 300 markers fit. The last beats were left out.";
const st = () => useEditorStore.getState();
const markers = () => st().project!.beatMarkers;
const toast = () => useToast.getState().message;
const btn = (name: string) => screen.getByRole("button", { name });
const slider = () => screen.getByTestId("beats-density");
const tapped = Array.from({ length: 250 }, (_, k) => Math.round((k + 1) * 100) / 1000);   // 0.1, 0.2 ... 25
const open = async (p: Partial<Project> = {}) => {
  st().setProject(makeProject({
    clips: [makeClip({ id: "a", sourceDuration: 50 }), makeClip({ id: "b", sourceDuration: 50 })],
    audioTracks: [makeAudioTrack({ id: "party", title: "Party Sector", sourceDuration: 96.1, start: 50 })],
    beatMarkers: tapped, ...p,
  }));
  return render(<BeatsSheet visible onClose={() => {}} />);
};
const drag = async (to: number) => {
  await fireEvent(slider(), "touchStart");
  await fireEvent(slider(), "touchMove", { v: to });
};

const realShow = useToast.getState().show;
/** Every message shown from here on, in order. */
const shows = (): string[] => {
  const seen: string[] = [];
  useToast.setState({ show: (m) => { seen.push(m); realShow(m); } });
  return seen;
};

beforeEach(() => { useToast.setState({ show: realShow }); useToast.getState().clear(); st().reset(); });

test("the sentence carries the stored limit", () => {
  expect(LEFT_OUT).toContain(`Only ${BEAT_LIMITS.max} markers`);
});

test("a Find whose beats all fit says nothing, as before", async () => {
  await open();
  await fireEvent.press(btn("Find Beats"));
  expect(markers()).toHaveLength(300);                           // 250 tapped + 50 beats: exactly the limit, none left out
  expect(st().past).toHaveLength(1);
  expect(toast()).toBeNull();
});

test("a Find whose beats do not all fit says so, once", async () => {
  await open();
  await drag(2);                                                 // every beat, before any Find: sets the next Find only
  expect(toast()).toBeNull();
  const shown = shows();
  await fireEvent.press(btn("Find Beats"));
  expect(markers()).toHaveLength(300);
  expect(markers().slice(0, 250)).toEqual(tapped);               // every tapped marker stayed
  expect(st().past).toHaveLength(1);
  expect(toast()).toBe(LEFT_OUT);
  expect(shown).toEqual([LEFT_OUT]);
});

test("a second press at the limit does not claim the markers are all in place", async () => {
  await open();
  await drag(2);
  await fireEvent.press(btn("Find Beats"));
  useToast.getState().clear();
  await fireEvent.press(btn("Find Beats"));
  expect(st().past).toHaveLength(1);                             // nothing changed: no undo step
  expect(toast()).toBe(LEFT_OUT);
});

test("a full project: nothing can be placed, and the reason is the limit", async () => {
  await open({ beatMarkers: Array.from({ length: 300 }, (_, k) => Math.round((k + 1) * 100) / 1000) });
  await fireEvent.press(btn("Find Beats"));
  expect(st().past).toHaveLength(0);
  expect(toast()).toBe(LEFT_OUT);
});

test("a Fewer / More drag after a Find says it once, when the slider is let go — not while it is dragged", async () => {
  await open();
  await fireEvent.press(btn("Find Beats"));
  const shown = shows();
  await drag(2);
  await fireEvent(slider(), "touchMove", { v: 1 });
  await fireEvent(slider(), "touchMove", { v: 2 });
  expect(markers()).toHaveLength(300);
  expect(shown).toEqual([]);
  await fireEvent(slider(), "touchEnd", { v: 2 });
  expect(toast()).toBe(LEFT_OUT);
  expect(shown).toEqual([LEFT_OUT]);
  expect(st().past).toHaveLength(2);                             // the Find and the drag
});

test("a drag let go where everything fits says nothing; nor does a drag before any Find", async () => {
  await open();
  await drag(2);
  await fireEvent(slider(), "touchEnd", { v: 2 });               // no Find yet: the slider placed nothing
  expect(toast()).toBeNull();
  await fireEvent(slider(), "touchMove", { v: 1 });
  await fireEvent.press(btn("Find Beats"));
  await drag(0);
  await fireEvent(slider(), "touchEnd", { v: 0 });
  expect(toast()).toBeNull();
});

test("whether Cut to beats can run is asked of the model's one rule", async () => {
  await open();
  expect(beatCutState).toHaveBeenCalledWith(st().project);
  expect(btn("Cut to Beats")).toBeEnabled();
});
