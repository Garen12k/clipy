import { act, fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-07T10:00:00.000Z" }));
jest.mock("@/src/ui/haptics", () => ({ haptic: jest.fn() }));
jest.mock("@/modules/clipy-video", () => ({ isSoundAvailable: jest.fn(() => true), probeNoiseReduction: jest.fn(async () => ({ ok: true, stage: "render", detail: "frames 220500 outputRms 0.05 latency 0" })) }));
import { isSoundAvailable, probeNoiseReduction } from "@/modules/clipy-video";
import { useSoundFiles } from "@/src/editor/soundFiles";
import { SOUND_UNAVAILABLE } from "@/src/editor/soundRenders";
import { EQ_IDS, makeAudioTrack, makeClip, makeProject } from "@/src/editor/model/types";
import { EQS } from "@/src/editor/soundTools";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { haptic } from "@/src/ui/haptics";
import { useToast } from "@/src/ui/Toast";
import { STRIP } from "@/src/ui/ToolStrip";
import { resetNoiseProbe, SoundQualitySheet } from "../components/SoundQualitySheet";

const st = () => useEditorStore.getState();
const track = () => st().project!.audioTracks[0];
const past = () => st().past.length;
const tile = (name: string) => screen.getByRole("button", { name });
const press = (name: string) => fireEvent.press(tile(name));
const level = () => screen.getByLabelText("Even out loudness");
const open = () => render(<SoundQualitySheet trackId="v" visible onClose={() => {}} />);
let log: jest.SpiedFunction<typeof console.log>;
const flush = async () => { for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve(); }); };

beforeEach(() => {
  jest.clearAllMocks();
  log = jest.spyOn(console, "log").mockImplementation(() => {});   // the noise test writes one line per app start
  jest.mocked(isSoundAvailable).mockReturnValue(true);
  resetNoiseProbe();
  useSoundFiles.setState({ files: {}, hold: false });
  useToast.setState({ message: null, stamp: 0 });
  st().reset();
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })], audioTracks: [makeAudioTrack({ id: "v", sourceDuration: 5, kind: "voice" })] }));
});
afterEach(() => { log.mockRestore(); });

test("titled Sound quality: None is ringed, the four presets follow, the switch is off", async () => {
  await open();
  expect(screen.getByText("Sound quality")).toBeTruthy();
  const labels = screen.getAllByRole("button").map((b) => b.props.accessibilityLabel as string).filter((l) => l !== "Done");
  expect(labels).toEqual(["None", "Bass boost", "Clear voice", "Warm", "Bright"]);
  expect(tile("None")).toBeSelected();
  for (const id of EQ_IDS) expect(tile(EQS[id].label)).not.toBeSelected();
  expect(screen.getByText("Even out loudness")).toBeTruthy();
  expect(level().props.value).toBe(false);
});

test("a preset is one undo step; the ringed one again does nothing; None takes it away", async () => {
  await open();
  await press("Warm");
  expect(track().sound).toEqual({ voice: null, strength: 0.5, pitch: 0, eq: "warm", level: false });
  expect(past()).toBe(1);
  expect(tile("Warm")).toBeSelected();
  expect(haptic).toHaveBeenCalledTimes(1);
  await press("Warm");
  expect(past()).toBe(1);
  expect(haptic).toHaveBeenCalledTimes(1);
  await press("None");
  expect("sound" in track()).toBe(false);
  expect(past()).toBe(2);
});

test("Even out loudness is one switch, one undo step each way, and keeps a preset that is set", async () => {
  await open();
  await press("Bright");
  await fireEvent(level(), "valueChange", true);
  expect(track().sound).toEqual({ voice: null, strength: 0.5, pitch: 0, eq: "bright", level: true });
  expect(level().props.value).toBe(true);
  expect(past()).toBe(2);
  await fireEvent(level(), "valueChange", false);
  expect(track().sound).toEqual({ voice: null, strength: 0.5, pitch: 0, eq: "bright", level: false });
  expect(past()).toBe(3);
});

test("the switch alone is a setting; off again leaves the bar as recorded", async () => {
  await open();
  await fireEvent(level(), "valueChange", true);
  expect(track().sound).toEqual({ voice: null, strength: 0.5, pitch: 0, eq: null, level: true });
  expect(tile("None")).toBeSelected();
  await fireEvent(level(), "valueChange", false);
  expect("sound" in track()).toBe(false);
  expect(past()).toBe(2);
});

test("a voice set elsewhere is kept by a preset and by the switch", async () => {
  st().setProject(makeProject({ audioTracks: [makeAudioTrack({ id: "v", sourceDuration: 5, kind: "voice", sound: { voice: "deep", strength: 0.8, pitch: -2, eq: null, level: false } })] }));
  await open();
  await press("Clear voice");
  await fireEvent(level(), "valueChange", true);
  expect(track().sound).toEqual({ voice: "deep", strength: 0.8, pitch: -2, eq: "clearVoice", level: true });
});

test("every row has its explicit height: tiles 72, the switch row 36; the tile row is not remounted by a pick", async () => {
  await open();
  expect(screen.getByTestId("strip-tiles")).toHaveStyle({ height: STRIP.tiles });
  expect(screen.getByTestId("sound-level-row")).toHaveStyle({ height: STRIP.slider, paddingHorizontal: theme.space.gutter });
  const row = screen.getByTestId("strip-tiles");
  await press("Warm");
  await press("Bright");
  expect(screen.getByTestId("strip-tiles")).toBe(row);   // same instance: its scroll offset stays
});

test("the spinner shows while this track's copy is being rendered", async () => {
  const view = await open();
  await press("Warm");
  expect(screen.queryByLabelText("Preparing the sound")).toBeNull();
  await act(async () => { useSoundFiles.setState({ files: { "v-v1-plain-s0-p0-warm-l0.m4a": { status: "busy" } } }); });
  await view.rerender(<SoundQualitySheet trackId="v" visible onClose={() => {}} />);
  expect(screen.getByLabelText("Preparing the sound")).toBeTruthy();
});

test("without the engine nothing changes, and the sentence is said once", async () => {
  jest.mocked(isSoundAvailable).mockReturnValue(false);
  await open();
  await press("Warm");
  expect("sound" in track()).toBe(false);
  expect(past()).toBe(0);
  expect(haptic).not.toHaveBeenCalled();
  expect(useToast.getState().message).toBe(SOUND_UNAVAILABLE);
  useToast.setState({ message: null });
  await fireEvent(level(), "valueChange", true);
  await press("Bright");
  expect("sound" in track()).toBe(false);
  expect(past()).toBe(0);
  expect(level().props.value).toBe(false);
  expect(useToast.getState().message).toBeNull();   // not again
});

test("no track, or a closed strip: nothing is drawn", async () => {
  await render(<SoundQualitySheet trackId="nope" visible onClose={() => {}} />);
  expect(screen.queryByText("Sound quality")).toBeNull();
  await render(<SoundQualitySheet trackId="v" visible={false} onClose={() => {}} />);
  expect(screen.queryByText("Sound quality")).toBeNull();
});

test("the noise test: once per app start, when the strip opens in a dev session with the engine, to the log only", async () => {
  const first = await open();
  await flush();
  expect(probeNoiseReduction).toHaveBeenCalledTimes(1);
  expect(probeNoiseReduction).toHaveBeenCalledWith("file:///media/v.m4a");
  expect(log).toHaveBeenCalledWith("[noise-probe]", JSON.stringify({ ok: true, stage: "render", detail: "frames 220500 outputRms 0.05 latency 0" }));
  expect(log).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(/noise/i)).toBeNull();                        // nothing on screen
  expect(useToast.getState().message).toBeNull();
  await first.unmount();
  await open();
  await flush();
  expect(probeNoiseReduction).toHaveBeenCalledTimes(1);                   // not again
  expect("sound" in track()).toBe(false);                                 // and it changed nothing
});

test("the noise test is not run without the engine, nor while the strip is closed; a failing test is logged, not thrown", async () => {
  jest.mocked(isSoundAvailable).mockReturnValue(false);
  await open();
  await flush();
  expect(probeNoiseReduction).not.toHaveBeenCalled();
  jest.mocked(isSoundAvailable).mockReturnValue(true);
  await render(<SoundQualitySheet trackId="v" visible={false} onClose={() => {}} />);
  await flush();
  expect(probeNoiseReduction).not.toHaveBeenCalled();
  jest.mocked(probeNoiseReduction).mockRejectedValueOnce(new Error("boom"));
  await open();
  await flush();
  expect(log).toHaveBeenCalledWith("[noise-probe]", JSON.stringify({ ok: false, stage: "call", detail: "boom" }));
});

test("the noise test: a wrapper that throws at once (a build without the function) is logged too, and the strip still opens", async () => {
  jest.mocked(probeNoiseReduction).mockImplementationOnce(() => { throw new Error("This build of the app has no sound tools yet."); });
  await open();
  await flush();
  expect(log).toHaveBeenCalledWith("[noise-probe]", JSON.stringify({ ok: false, stage: "call", detail: "This build of the app has no sound tools yet." }));
  expect(log).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Sound quality")).toBeTruthy();
});

test("the noise test is not run outside a development session", async () => {
  const g = globalThis as unknown as { __DEV__: boolean };
  const was = g.__DEV__;
  g.__DEV__ = false;
  try {
    await open();
    await flush();
    expect(probeNoiseReduction).not.toHaveBeenCalled();
  } finally { g.__DEV__ = was; }
});
