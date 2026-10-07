import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Dimensions } from "react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-07T10:00:00.000Z" }));
jest.mock("@/src/ui/haptics", () => ({ haptic: jest.fn() }));
jest.mock("@/src/editor/soundRenders", () => ({ holdSounds: jest.fn(), SOUND_UNAVAILABLE: "Voice and sound effects need the new native build. Expo Go cannot run them." }));
jest.mock("@/modules/clipy-video", () => ({ isSoundAvailable: jest.fn(() => true) }));
jest.mock("@react-native-community/slider", () => { const { View } = require("react-native"); return ({ testID, disabled, value, minimumValue, maximumValue, step, onSlidingStart, onValueChange, onSlidingComplete }: { testID?: string; disabled?: boolean; value?: number; minimumValue?: number; maximumValue?: number; step?: number; onSlidingStart?: () => void; onValueChange?: (v: number) => void; onSlidingComplete?: () => void }) => <View testID={testID} {...{ disabled, value, minimumValue, maximumValue, step }} onTouchStart={() => onSlidingStart?.()} onTouchMove={(e: unknown) => onValueChange?.((e as { v?: number })?.v ?? 0.8)} onTouchEnd={() => onSlidingComplete?.()} />; });
import { isSoundAvailable } from "@/modules/clipy-video";
import { holdSounds } from "@/src/editor/soundRenders";
import { useSoundFiles } from "@/src/editor/soundFiles";
import { setTrackSound } from "@/src/editor/model/ops";
import { makeAudioTrack, makeClip, makeProject, VOICE_IDS } from "@/src/editor/model/types";
import { VOICES } from "@/src/editor/soundTools";
import { useEditorStore } from "@/src/editor/store";
import { TILE_WIDTH } from "@/src/ui/Tile";
import { tilesStartXIn } from "@/src/ui/ToolStrip";
import { VoiceSheet } from "../components/VoiceSheet";

const st = () => useEditorStore.getState();
const track = () => st().project!.audioTracks[0];
const past = () => st().past.length;
const tile = (name: string) => screen.getByRole("button", { name });
const press = (name: string) => fireEvent.press(tile(name));
const strength = () => screen.getByTestId("voice-strength");
const pitch = () => screen.getByTestId("voice-pitch");
const open = () => render(<VoiceSheet trackId="v" visible onClose={() => {}} />);

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(isSoundAvailable).mockReturnValue(true);
  jest.mocked(holdSounds).mockImplementation(() => {});
  useSoundFiles.setState({ files: {}, hold: false });
  st().reset();
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })], audioTracks: [makeAudioTrack({ id: "v", sourceDuration: 5, kind: "voice" })] }));
});

test("titled Voice: None is ringed, the seven voices follow in order, Strength is off at 50 %, Pitch is at 0", async () => {
  await open();
  expect(screen.getByText("Voice")).toBeTruthy();
  const labels = screen.getAllByRole("button").map((b) => b.props.accessibilityLabel as string).filter((l) => l !== "Done");
  expect(labels).toEqual(["None", "Deep", "High", "Chipmunk", "Robot", "Echo", "Hall", "Telephone"]);
  expect(tile("None")).toBeSelected();
  for (const id of VOICE_IDS) expect(tile(VOICES[id].label)).not.toBeSelected();
  expect(strength().props).toMatchObject({ disabled: true, minimumValue: 0, maximumValue: 1, step: 0.05, value: 0.5 });
  expect(pitch().props).toMatchObject({ minimumValue: -12, maximumValue: 12, step: 1, value: 0 });
  expect(screen.getByText("Strength 50 %")).toBeTruthy();
  expect(screen.getByText("Pitch 0")).toBeTruthy();
  expect(screen.queryByLabelText("Preparing the sound")).toBeNull();
});

test("a tile sets the voice in one undo step; the ringed tile again does nothing; None takes it away again", async () => {
  await open();
  await press("Deep");
  expect(track().sound).toEqual({ voice: "deep", strength: 0.5, pitch: 0, eq: null, level: false });
  expect(past()).toBe(1);
  expect(tile("Deep")).toBeSelected();
  expect(strength().props.disabled).toBe(false);
  await press("Deep");
  expect(past()).toBe(1);
  await press("Echo");
  expect(track().sound?.voice).toBe("echo");
  expect(past()).toBe(2);
  await press("None");
  expect("sound" in track()).toBe(false);
  expect(past()).toBe(3);
});

test("a Strength drag is one undo step, and nothing is rendered until it is let go", async () => {
  await open();
  await press("Robot");
  await fireEvent(strength(), "touchStart");
  expect(holdSounds).toHaveBeenLastCalledWith(true);
  await fireEvent(strength(), "touchMove", { v: 0.8 });
  await fireEvent(strength(), "touchMove", { v: 0.25 });
  expect(track().sound).toMatchObject({ voice: "robot", strength: 0.25 });
  expect(jest.mocked(holdSounds).mock.calls.filter(([on]) => on === false)).toHaveLength(0);
  await fireEvent(strength(), "touchEnd");
  expect(holdSounds).toHaveBeenLastCalledWith(false);
  expect(past()).toBe(2);                                                    // the tile, the drag
  expect(screen.getByText("Strength 25 %")).toBeTruthy();
});

test("Pitch works on its own, without a voice, in whole steps; back at 0 the track is as recorded", async () => {
  await open();
  await fireEvent(pitch(), "touchStart");
  await fireEvent(pitch(), "touchMove", { v: 3 });
  await fireEvent(pitch(), "touchEnd");
  expect(track().sound).toEqual({ voice: null, strength: 0.5, pitch: 3, eq: null, level: false });
  expect(screen.getByText("Pitch +3")).toBeTruthy();
  expect(past()).toBe(1);
  await fireEvent(pitch(), "touchStart");
  await fireEvent(pitch(), "touchMove", { v: -2 });
  expect(screen.getByText("Pitch -2")).toBeTruthy();
  await fireEvent(pitch(), "touchMove", { v: 0 });
  await fireEvent(pitch(), "touchEnd");
  expect("sound" in track()).toBe(false);
});

test("the spinner shows while this track's copy is being rendered; closing mid-drag lets the hold go", async () => {
  const view = await open();
  await press("Deep");
  await fireEvent(screen.getByTestId("voice-strength"), "touchStart");
  await act(async () => { useSoundFiles.setState({ files: { "v-v1-deep-s50-p0-flat-l0.m4a": { status: "busy" } } }); });
  await view.rerender(<VoiceSheet trackId="v" visible onClose={() => {}} />);
  expect(screen.getByLabelText("Preparing the sound")).toBeTruthy();
  jest.mocked(holdSounds).mockClear();
  await view.unmount();
  expect(holdSounds).toHaveBeenCalledWith(false);
});

test("nothing for a track that is not there", async () => {
  await render(<VoiceSheet trackId="nope" visible onClose={() => {}} />);
  expect(screen.queryByText("Voice")).toBeNull();
});

test("the hold is taken before the drag's undo step is opened, and before anything is written", async () => {
  await open();
  const seen: number[] = [];
  jest.mocked(holdSounds).mockImplementation((on) => { if (on) seen.push(past()); });
  await fireEvent(pitch(), "touchStart");
  expect(seen).toEqual([0]);
  expect(past()).toBe(1);
  await fireEvent(pitch(), "touchMove", { v: 5 });
  await fireEvent(pitch(), "touchEnd");
  expect(seen).toEqual([0]);                                                 // once per drag, not per value
  expect(jest.mocked(holdSounds).mock.calls.map(([on]) => on)).toEqual([true, false]);
});

test("Strength without a voice holds nothing, writes nothing and adds no undo step", async () => {
  await open();
  const before = st().project;
  await fireEvent(strength(), "touchStart");
  await fireEvent(strength(), "touchMove", { v: 0.9 });
  await fireEvent(strength(), "touchEnd");
  expect(st().project).toBe(before);
  expect(past()).toBe(0);
  expect(jest.mocked(holdSounds).mock.calls.filter(([on]) => on === true)).toHaveLength(0);
});

test("a panel that is hidden, or whose track goes, mid-drag lets the hold go; one that was not dragged calls nothing", async () => {
  const view = await open();
  await fireEvent(pitch(), "touchStart");
  await fireEvent(pitch(), "touchMove", { v: 2 });
  jest.mocked(holdSounds).mockClear();
  await view.rerender(<VoiceSheet trackId="v" visible={false} onClose={() => {}} />);
  expect(jest.mocked(holdSounds).mock.calls).toEqual([[false]]);
  await view.rerender(<VoiceSheet trackId="v" visible onClose={() => {}} />);
  await fireEvent(pitch(), "touchStart");
  jest.mocked(holdSounds).mockClear();
  await act(async () => { st().apply((p) => ({ ...p, audioTracks: [] })); });
  expect(screen.queryByText("Voice")).toBeNull();
  expect(jest.mocked(holdSounds).mock.calls).toEqual([[false]]);
  jest.mocked(holdSounds).mockClear();
  await view.unmount();
  expect(holdSounds).not.toHaveBeenCalled();
});

test("the row starts with the ringed tile in view, worked out when the panel opens; a pick does not move it", async () => {
  type Inst = ReturnType<typeof screen.getByTestId>;
  const findScroll = (n: Inst): Inst | null => { if (n.props.contentOffset !== undefined) return n; for (const c of n.children) { if (typeof c === "string") continue; const f = findScroll(c as Inst); if (f) return f; } return null; };
  const window = Dimensions.get("window");
  Dimensions.set({ window: { ...window, width: 320 } });               // narrower than the eight tiles, so the row can start anywhere
  try {
    await act(async () => { st().apply((p) => setTrackSound(p, "v", { voice: "echo" })); });
    const view = await open();
    const startX = () => findScroll(screen.getByTestId("strip-tiles"))!.props.contentOffset.x as number;
    const atEcho = tilesStartXIn(5, TILE_WIDTH, 8, 320);
    expect(atEcho).toBeGreaterThan(0);
    expect(tilesStartXIn(0, TILE_WIDTH, 8, 320)).not.toBe(atEcho);
    expect(startX()).toBe(atEcho);
    await press("None");
    expect(startX()).toBe(atEcho);
    await press("Deep");
    expect(startX()).toBe(atEcho);
    // Opened again, it is worked out again.
    await view.rerender(<VoiceSheet trackId="v" visible={false} onClose={() => {}} />);
    await view.rerender(<VoiceSheet trackId="v" visible onClose={() => {}} />);
    expect(startX()).toBe(tilesStartXIn(1, TILE_WIDTH, 8, 320));
    await view.unmount();
  } finally {
    Dimensions.set({ window });
  }
});

test("without the engine the panel says so once and changes nothing", async () => {
  jest.mocked(isSoundAvailable).mockReturnValue(false);
  await open();
  const before = st().project;
  expect(screen.getAllByText("Voice and sound effects need the new native build. Expo Go cannot run them.")).toHaveLength(1);
  await press("Deep");
  await fireEvent(pitch(), "touchStart");
  await fireEvent(pitch(), "touchMove", { v: 4 });
  await fireEvent(pitch(), "touchEnd");
  expect(st().project).toBe(before);
  expect(past()).toBe(0);
  expect(holdSounds).not.toHaveBeenCalled();
  expect(strength().props.disabled).toBe(true);
  expect(pitch().props.disabled).toBe(true);
});

test("with the engine there is no such sentence", async () => {
  await open();
  expect(screen.queryByText(/native build/)).toBeNull();
});
