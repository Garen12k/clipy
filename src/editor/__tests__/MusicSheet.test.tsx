import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
jest.mock("expo-audio", () => ({ useAudioPlayer: () => ({ play: jest.fn(), pause: jest.fn(), playing: false, replace: jest.fn() }), createAudioPlayer: jest.fn() }));
jest.mock("expo-asset", () => ({ Asset: { fromModule: () => ({ downloadAsync: async () => {}, localUri: "file:///bundled/t.mp3", uri: "file:///bundled/t.mp3" }) } }));
jest.mock("@/src/editor/music", () => ({ BUNDLED_TRACKS: [{ id: "t1", title: "Sunny Loop", durationSec: 30, license: "CC0", source: "https://x", file: 1 }] }));
jest.mock("@/src/projects", () => ({ storage: { importAudio: jest.fn(async (_id: string, a: { uri: string; title: string; durationSec: number }) => ({ id: "m1", sourceUri: "file:///p/m1.mp3", title: a.title, sourceDuration: a.durationSec, start: 0, trimStart: 0, trimEnd: a.durationSec, volume: 1 })) } }));
jest.mock("@/src/projects/audioInfo", () => ({ audioDuration: jest.fn(async () => 12) }));
jest.mock("@react-native-community/slider", () => { const { View } = require("react-native"); return () => <View />; });
import * as DocumentPicker from "expo-document-picker";
import { makeClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { MusicSheet } from "../components/MusicSheet";

beforeEach(() => { useEditorStore.getState().reset(); useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })] })); });

test("Use on a bundled track imports it and sets the project's audio track", async () => {
  await render(<MusicSheet visible onClose={() => {}} />);
  expect(screen.getByText("Sunny Loop")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Use Sunny Loop" }));
  await waitFor(() => expect(useEditorStore.getState().project!.audioTracks[0]).toMatchObject({ title: "Sunny Loop", sourceDuration: 30 }));
});

test("My files picks a document, measures its duration and imports it", async () => {
  (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({ canceled: false, assets: [{ uri: "file:///picked/a.m4a", name: "a.m4a", size: 1000 }] });
  await render(<MusicSheet visible onClose={() => {}} />);
  await fireEvent.press(screen.getByRole("button", { name: "My files" }));
  await fireEvent.press(screen.getByRole("button", { name: "Choose a file" }));
  await waitFor(() => expect(useEditorStore.getState().project!.audioTracks[0]).toMatchObject({ title: "a.m4a", sourceDuration: 12 }));
});

test("with a track present shows the current-track view and Remove clears it", async () => {
  useEditorStore.getState().apply((p) => ({ ...p, audioTracks: [{ id: "m", sourceUri: "file:///p/m.mp3", title: "Loop", sourceDuration: 20, start: 0, trimStart: 0, trimEnd: 20, volume: 1 }] }));
  await render(<MusicSheet visible onClose={() => {}} />);
  expect(screen.getByText("Loop")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Remove" }));
  expect(useEditorStore.getState().project!.audioTracks).toEqual([]);
});
