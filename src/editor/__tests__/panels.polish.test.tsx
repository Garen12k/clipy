import { render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-05T10:00:00.000Z" }));
jest.mock("@/src/lib/id", () => ({ newId: () => "dup" }));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
const mockPlayer = { play: jest.fn(), pause: jest.fn(), playing: false, replace: jest.fn() };
const mockRecorder = { currentTime: 0, uri: "file:///cache/rec.m4a", prepareToRecordAsync: jest.fn(async () => {}), record: jest.fn(), stop: jest.fn(async () => {}), getStatus: jest.fn(() => ({ durationMillis: 0 })) };
jest.mock("expo-audio", () => ({
  useAudioPlayer: () => mockPlayer, createAudioPlayer: jest.fn(),
  useAudioRecorder: () => mockRecorder, RecordingPresets: { HIGH_QUALITY: {} },
  requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: true })), setAudioModeAsync: jest.fn(async () => {}),
}));
jest.mock("expo-asset", () => ({ Asset: { fromModule: (file: number) => ({ downloadAsync: async () => {}, localUri: `file:///bundled/${file}.wav`, uri: `file:///bundled/${file}.wav` }) } }));
jest.mock("@/src/editor/music", () => ({ BUNDLED_TRACKS: [{ id: "t1", title: "Sunny Loop", durationSec: 30, license: "CC0", source: "https://x", file: 1 }] }));
jest.mock("@/src/projects", () => ({ storage: { importAudio: jest.fn() } }));
jest.mock("@/src/projects/audioInfo", () => ({ audioDuration: jest.fn(async () => 12) }));
import { makeClip, makeOverlay, makeProject, type TextOverlay } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { NumField } from "@/src/ui/NumField";
import { ToneContext } from "@/src/ui/tone";
import { AddAudioSheet } from "../components/AddAudioSheet";
import { FontStrip } from "../components/FontStrip";
import { TextPanel } from "../components/TextPanel";

const st = () => useEditorStore.getState();
beforeEach(() => {
  st().reset();
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 })], overlays: [makeOverlay({ id: "t", text: "Hi", start: 0, end: 3 })] }));
});

test("the text panel's sliders are the kit's and its Size line is one text with the value picked out", async () => {
  await render(<TextPanel overlayId="t" visible onClose={() => {}} />);
  expect(screen.getByTestId("size-slider").props).toMatchObject({ minimumTrackTintColor: theme.colors.accent, maximumTrackTintColor: theme.colors.track });
  const overlay = st().project!.overlays[0] as TextOverlay;
  const pct = `${Math.round(overlay.fontScale * 100)}%`;
  expect(screen.getByText(`Size ${pct}`)).toBeTruthy();
  expect(screen.getByText(pct)).toHaveStyle({ color: theme.colors.text, fontVariant: ["tabular-nums"] });
  // Duplicate is the grey button, Delete is the grey button in red — no gold fill in the panel's body.
  expect(screen.queryAllByTestId("primary-button")).toHaveLength(0);
});

/** As in the app: the editor says its family once, on its Screen (src/ui/tone.ts); a part rendered bare would be on a navy screen. */
const inEditor = { wrapper: ({ children }: { children: React.ReactNode }) => <ToneContext.Provider value="editor">{children}</ToneContext.Provider> };

test("fields and font chips sit on the tile surface, on the scale; the chosen font has the ring", async () => {
  const overlay = st().project!.overlays[0] as TextOverlay;
  await render(<><NumField label="X %" value={50} onCommit={() => {}} /><FontStrip value={overlay.fontId} onChange={() => {}} /></>, inEditor);
  expect(screen.getByLabelText("X %")).toHaveStyle({ padding: theme.space.md, backgroundColor: theme.elevation.tile });
  const chips = screen.getAllByRole("button");
  const chosen = chips.filter((c) => c.props.accessibilityState?.selected);
  expect(chosen).toHaveLength(1);
  expect(chosen[0]).toHaveStyle({ paddingVertical: theme.space.sm, paddingHorizontal: theme.space.lg, backgroundColor: theme.elevation.lifted, ...theme.ring });
  const other = chips.find((c) => !c.props.accessibilityState?.selected)!;
  expect(other).toHaveStyle({ backgroundColor: theme.elevation.tile, ...theme.ringClear });
});

test("Add audio: a row's button is the grey secondary button, not a chip, and the list has no gold button", async () => {
  await render(<AddAudioSheet visible onClose={() => {}} />, inEditor);
  const use = screen.getAllByRole("button", { name: /^Use / })[0];
  expect(use).toHaveStyle({ height: theme.size.controlCompact, backgroundColor: theme.elevation.lifted });
  expect(screen.queryAllByTestId("primary-button")).toHaveLength(0);
});
