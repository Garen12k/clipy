import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
const mockPlayer = { play: jest.fn(), pause: jest.fn(), playing: false, replace: jest.fn() };
const mockRecorder = { currentTime: 0, uri: "file:///cache/rec.m4a", prepareToRecordAsync: jest.fn(async () => {}), record: jest.fn(), stop: jest.fn(async () => {}), getStatus: jest.fn(() => ({ durationMillis: 0 })) };
jest.mock("expo-audio", () => ({
  useAudioPlayer: () => mockPlayer, createAudioPlayer: jest.fn(),
  useAudioRecorder: () => mockRecorder, RecordingPresets: { HIGH_QUALITY: {} },
  requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: true })), setAudioModeAsync: jest.fn(async () => {}),
}));
const mockDownload = jest.fn(async () => {});
jest.mock("expo-asset", () => ({ Asset: { fromModule: (file: number) => ({ downloadAsync: () => mockDownload(), localUri: `file:///bundled/${file}.wav`, uri: `file:///bundled/${file}.wav` }) } }));
jest.mock("@/src/editor/music", () => ({ BUNDLED_TRACKS: [{ id: "t1", title: "Sunny Loop", durationSec: 30, license: "CC0", source: "https://x", file: 1 }] }));
let mockN = 0;
jest.mock("@/src/projects", () => ({ storage: { importAudio: jest.fn(async (_id: string, a: { uri: string; title: string; durationSec: number }, kind: string = "music") => ({ id: `m${++mockN}`, sourceUri: `file:///p/m${mockN}.mp3`, title: a.title, sourceDuration: a.durationSec, start: 0, trimStart: 0, trimEnd: a.durationSec, volume: 1, kind, fadeIn: 0, fadeOut: 0 })) } }));
jest.mock("@/src/projects/audioInfo", () => ({ audioDuration: jest.fn(async () => 12) }));
import * as DocumentPicker from "expo-document-picker";
import { storage } from "@/src/projects";
import { audioDuration } from "@/src/projects/audioInfo";
import { theme } from "@/src/theme/theme";
import { useToast } from "@/src/ui/Toast";
import { AUDIO_LIMITS, makeAudioTrack, makeClip, makeProject } from "@/src/editor/model/types";
import { SFX, SFX_IDS } from "@/src/editor/sfx";
import { useEditorStore } from "@/src/editor/store";
import { closeStrip, openStrip, useStripCloser, useToolStrip } from "../toolStrip";
import { AddAudioSheet } from "../components/AddAudioSheet";

const importAudio = storage.importAudio as jest.Mock;
const tracks = () => useEditorStore.getState().project!.audioTracks;
const btn = (name: string) => screen.getByRole("button", { name });
const fullProject = () => useEditorStore.getState().apply((p) => ({ ...p, audioTracks: Array.from({ length: AUDIO_LIMITS.maxTracks }, (_, i) => makeAudioTrack({ id: `x${i}`, sourceDuration: 5 })) }));

beforeEach(() => {
  mockN = 0;
  mockRecorder.currentTime = 0; mockRecorder.stop.mockClear(); mockRecorder.record.mockClear();
  importAudio.mockClear(); mockPlayer.play.mockClear(); mockPlayer.pause.mockClear(); mockPlayer.replace.mockClear();
  useToast.getState().clear();
  closeStrip();
  useEditorStore.getState().reset();
  useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })] }));
});

test("four tabs: Music, Files, Effects, Record; Music is open first", async () => {
  await render(<AddAudioSheet visible onClose={() => {}} />);
  expect(screen.getByRole("header", { name: "Add audio" })).toBeTruthy();
  for (const l of ["Music", "Files", "Effects", "Record"]) expect(btn(l)).toBeTruthy();
  expect(btn("Music")).toBeSelected();
  expect(screen.getByText("Sunny Loop")).toBeTruthy();
});

test("Music: Use adds a music track at the playhead in one undo step, selects it and closes", async () => {
  const onClose = jest.fn();
  await render(<AddAudioSheet visible onClose={onClose} />);
  await act(() => { useEditorStore.getState().seek(2); });
  await fireEvent.press(btn("Use Sunny Loop"));
  await waitFor(() => expect(tracks()).toHaveLength(1));
  expect(tracks()[0]).toMatchObject({ id: "m1", title: "Sunny Loop", sourceDuration: 30, kind: "music", start: 2 });
  expect(useEditorStore.getState().past).toHaveLength(1);
  expect(useEditorStore.getState().selectedAudioId).toBe("m1");
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("Files: picks a document, measures it and adds a music track at the playhead", async () => {
  (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({ canceled: false, assets: [{ uri: "file:///picked/a.m4a", name: "a.m4a", size: 1000 }] });
  const onClose = jest.fn();
  await render(<AddAudioSheet visible onClose={onClose} />);
  await act(() => { useEditorStore.getState().seek(3.5); });
  await fireEvent.press(btn("Files"));
  await fireEvent.press(btn("Choose a File"));
  await waitFor(() => expect(tracks()).toHaveLength(1));
  expect(tracks()[0]).toMatchObject({ title: "a.m4a", sourceDuration: 12, kind: "music", start: 3.5 });
  expect(useEditorStore.getState().past).toHaveLength(1);
  expect(useEditorStore.getState().selectedAudioId).toBe(tracks()[0].id);
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("Effects: one row per sound with its length; Add copies the bundled file in and adds an sfx track at the playhead", async () => {
  const onClose = jest.fn();
  await render(<AddAudioSheet visible onClose={onClose} />);
  await act(() => { useEditorStore.getState().seek(4); });
  await fireEvent.press(btn("Effects"));
  for (const id of SFX_IDS) expect(btn(`Add ${SFX[id].label}`)).toBeTruthy();
  expect(screen.getByText("0.6 s")).toBeTruthy();
  await fireEvent.press(btn("Add Whoosh"));
  await waitFor(() => expect(tracks()).toHaveLength(1));
  expect(importAudio).toHaveBeenCalledWith("p1", { uri: `file:///bundled/${SFX.whoosh.file}.wav`, title: "Whoosh", durationSec: 0.6 }, "sfx");
  expect(tracks()[0]).toMatchObject({ title: "Whoosh", kind: "sfx", start: 4, trimStart: 0, trimEnd: 0.6 });
  expect(useEditorStore.getState().past).toHaveLength(1);
  expect(useEditorStore.getState().selectedAudioId).toBe(tracks()[0].id);
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("Effects: the preview button plays one sound at a time on the shared player and stops", async () => {
  await render(<AddAudioSheet visible onClose={() => {}} />);
  await fireEvent.press(btn("Effects"));
  await fireEvent.press(btn("Play Whoosh"));
  expect(mockPlayer.replace).toHaveBeenLastCalledWith(SFX.whoosh.file);
  expect(mockPlayer.play).toHaveBeenCalledTimes(1);
  expect(btn("Stop Whoosh")).toBeTruthy();
  await fireEvent.press(btn("Play Pop"));
  expect(mockPlayer.replace).toHaveBeenLastCalledWith(SFX.pop.file);
  expect(btn("Play Whoosh")).toBeTruthy();
  mockPlayer.pause.mockClear();
  await fireEvent.press(btn("Stop Pop"));
  expect(mockPlayer.pause).toHaveBeenCalled();
  expect(btn("Play Pop")).toBeTruthy();
  expect(tracks()).toEqual([]);
});

test("Effects: the preview resets by itself when the sound has finished", async () => {
  jest.useFakeTimers();
  try {
    await render(<AddAudioSheet visible onClose={() => {}} />);
    await fireEvent.press(btn("Effects"));
    await fireEvent.press(btn("Play Whoosh"));
    expect(btn("Stop Whoosh")).toBeTruthy();
    await act(() => { jest.advanceTimersByTime(2000); });
    expect(btn("Play Whoosh")).toBeTruthy();
  } finally { jest.useRealTimers(); }
});

test("the preview stops on a tab change, on close, and survives a released player on unmount", async () => {
  const onClose = jest.fn();
  const view = await render(<AddAudioSheet visible onClose={onClose} />);
  await fireEvent.press(btn("Effects"));
  await fireEvent.press(btn("Play Whoosh"));
  mockPlayer.pause.mockClear();
  await fireEvent.press(btn("Music"));
  expect(mockPlayer.pause).toHaveBeenCalled();
  await fireEvent.press(btn("Effects"));
  expect(btn("Play Whoosh")).toBeTruthy();
  await fireEvent.press(btn("Play Whoosh"));
  mockPlayer.pause.mockClear();
  await fireEvent.press(btn("Done"));
  expect(mockPlayer.pause).toHaveBeenCalled();
  expect(onClose).toHaveBeenCalledTimes(1);
  mockPlayer.pause.mockImplementation(() => { throw new Error("released"); });
  try { await view.unmount(); } finally { mockPlayer.pause.mockImplementation(() => {}); }
});

test("at the track limit nothing is imported: the sheet closes first, then the toast shows", async () => {
  fullProject();
  const order: string[] = [];
  const onClose = jest.fn(() => { order.push(`close:${useToast.getState().message}`); });
  await render(<AddAudioSheet visible onClose={onClose} />);
  await fireEvent.press(btn("Effects"));
  await fireEvent.press(btn("Add Pop"));
  await waitFor(() => expect(useToast.getState().message).toBe("You've reached the audio track limit."));
  expect(order).toEqual(["close:null"]);
  expect(importAudio).not.toHaveBeenCalled();
  expect(tracks()).toHaveLength(AUDIO_LIMITS.maxTracks);
  expect(useEditorStore.getState().past).toHaveLength(1);
});

test("a limit reached while the file was being imported is refused the same way", async () => {
  importAudio.mockImplementationOnce(async (_id: string, a: { title: string; durationSec: number }) => {
    fullProject();
    return makeAudioTrack({ id: "late", title: a.title, sourceDuration: a.durationSec });
  });
  const onClose = jest.fn();
  await render(<AddAudioSheet visible onClose={onClose} />);
  await fireEvent.press(btn("Use Sunny Loop"));
  await waitFor(() => expect(useToast.getState().message).toBe("You've reached the audio track limit."));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(tracks().some((t) => t.id === "late")).toBe(false);
  expect(useEditorStore.getState().selectedAudioId).toBeNull();
});

test("an add refused for another reason than the limit does not blame the limit", async () => {
  useEditorStore.getState().apply((p) => ({ ...p, audioTracks: [makeAudioTrack({ id: "same", sourceDuration: 5 })] }));
  importAudio.mockImplementationOnce(async (_id: string, a: { title: string; durationSec: number }) => makeAudioTrack({ id: "same", title: a.title, sourceDuration: a.durationSec }));
  const order: string[] = [];
  const onClose = jest.fn(() => { order.push(`close:${useToast.getState().message}`); });
  await render(<AddAudioSheet visible onClose={onClose} />);
  await fireEvent.press(btn("Use Sunny Loop"));
  await waitFor(() => expect(useToast.getState().message).toBe("Couldn't add that audio file."));
  expect(order).toEqual(["close:null"]);
  expect(tracks()).toHaveLength(1);
  expect(useEditorStore.getState().selectedAudioId).toBeNull();
});

describe("the playhead at the project's end", () => {
  const MESSAGE = "Move the playhead back to add audio here.";

  test("nothing is imported (the track would never be heard): the sheet closes, then the toast shows", async () => {
    const order: string[] = [];
    const onClose = jest.fn(() => { order.push(`close:${useToast.getState().message}`); });
    await render(<AddAudioSheet visible onClose={onClose} />);
    await act(() => { useEditorStore.getState().seek(10); });
    await fireEvent.press(btn("Use Sunny Loop"));
    expect(useToast.getState().message).toBe(MESSAGE);
    expect(order).toEqual(["close:null"]);
    expect(importAudio).not.toHaveBeenCalled();
    expect(tracks()).toEqual([]);
    expect(useEditorStore.getState().past).toHaveLength(0);
  });

  test("within 0.05 s of the end counts as the end, for sound effects too; just before it is fine", async () => {
    await render(<AddAudioSheet visible onClose={() => {}} />);
    await fireEvent.press(btn("Effects"));
    await act(() => { useEditorStore.getState().seek(9.96); });
    await fireEvent.press(btn("Add Pop"));
    expect(useToast.getState().message).toBe(MESSAGE);
    expect(importAudio).not.toHaveBeenCalled();
    useToast.getState().clear();
    await act(() => { useEditorStore.getState().seek(9.9); });
    await fireEvent.press(btn("Add Pop"));
    await waitFor(() => expect(tracks()).toHaveLength(1));
    expect(tracks()[0].start).toBe(9.9);
    expect(useToast.getState().message).toBeNull();
  });

  test("Files: the picker is not opened", async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockClear();
    const onClose = jest.fn();
    await render(<AddAudioSheet visible onClose={onClose} />);
    await act(() => { useEditorStore.getState().seek(10); });
    await fireEvent.press(btn("Files"));
    await fireEvent.press(btn("Choose a File"));
    expect(useToast.getState().message).toBe(MESSAGE);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(DocumentPicker.getDocumentAsync).not.toHaveBeenCalled();
  });
});

test("Files: Choose a File is the tab's one main button, white; the other tabs have none, and nothing is filled gold", async () => {
  await render(<AddAudioSheet visible onClose={() => {}} />);
  expect(screen.queryAllByTestId("main-button")).toHaveLength(0);              // Music: rows of grey buttons
  await fireEvent.press(btn("Files"));
  expect(screen.getAllByTestId("main-button")).toHaveLength(1);
  expect(screen.getByTestId("main-button")).toHaveAccessibleName("Choose a File");
  expect(screen.getByTestId("main-button")).toHaveStyle({ backgroundColor: theme.plain.fill });
  expect(screen.queryAllByTestId("primary-button")).toHaveLength(0);
  await fireEvent.press(btn("Effects"));
  expect(screen.queryAllByTestId("main-button")).toHaveLength(0);
  expect(screen.queryAllByTestId("primary-button")).toHaveLength(0);
});

test("the sheet only adds: with tracks present it shows no track controls", async () => {
  useEditorStore.getState().apply((p) => ({ ...p, audioTracks: [makeAudioTrack({ id: "m", sourceUri: "file:///p/m.mp3", title: "Loop", sourceDuration: 20 })] }));
  await render(<AddAudioSheet visible onClose={() => {}} />);
  expect(screen.queryByText("Loop")).toBeNull();
  expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
  expect(btn("Use Sunny Loop")).toBeEnabled();
  await fireEvent.press(btn("Use Sunny Loop"));
  await waitFor(() => expect(tracks().map((t) => t.title)).toEqual(["Loop", "Sunny Loop"]));
});

test("a bundled track that fails to download shows a toast instead of throwing", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  mockDownload.mockRejectedValueOnce(new Error("offline"));
  const onClose = jest.fn();
  await render(<AddAudioSheet visible onClose={onClose} />);
  await fireEvent.press(btn("Use Sunny Loop"));
  await waitFor(() => expect(useToast.getState().message).toBe("Couldn't add that audio file."));
  expect(tracks()).toEqual([]);
  expect(useEditorStore.getState().past).toHaveLength(0);
  await waitFor(() => expect(btn("Use Sunny Loop")).toBeEnabled());
  warn.mockRestore();
});

test("Choose a file is disabled while the picked file's duration is being measured", async () => {
  let disabledWhileMeasuring: boolean | undefined;
  (audioDuration as jest.Mock).mockImplementationOnce(async () => {
    await new Promise((r) => setImmediate(r));
    disabledWhileMeasuring = btn("Choose a File").props.accessibilityState?.disabled;
    return 7;
  });
  (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({ canceled: false, assets: [{ uri: "file:///picked/b.m4a", name: "b.m4a", size: 1000 }] });
  await render(<AddAudioSheet visible onClose={() => {}} />);
  await fireEvent.press(btn("Files"));
  await fireEvent.press(btn("Choose a File"));
  await waitFor(() => expect(tracks()[0]).toMatchObject({ title: "b.m4a", sourceDuration: 7 }));
  expect(disabledWhileMeasuring).toBe(true);
});

test("the track starts where the playhead was at the press, not where it is when the import finishes", async () => {
  importAudio.mockImplementationOnce(async (_id: string, a: { title: string; durationSec: number }) => {
    useEditorStore.getState().seek(7);   // playback ran on while the file was copied
    return makeAudioTrack({ id: "slow", title: a.title, sourceDuration: a.durationSec });
  });
  await render(<AddAudioSheet visible onClose={() => {}} />);
  await act(() => { useEditorStore.getState().seek(2); });
  await fireEvent.press(btn("Use Sunny Loop"));
  await waitFor(() => expect(tracks()).toHaveLength(1));
  expect(tracks()[0]).toMatchObject({ id: "slow", start: 2 });
});

test("Files: the track starts where the playhead was when Choose a file was pressed", async () => {
  (DocumentPicker.getDocumentAsync as jest.Mock).mockImplementationOnce(async () => {
    useEditorStore.getState().seek(6);
    return { canceled: false, assets: [{ uri: "file:///picked/c.m4a", name: "c.m4a", size: 1000 }] };
  });
  await render(<AddAudioSheet visible onClose={() => {}} />);
  await act(() => { useEditorStore.getState().seek(1.5); });
  await fireEvent.press(btn("Files"));
  await fireEvent.press(btn("Choose a File"));
  await waitFor(() => expect(tracks()).toHaveLength(1));
  expect(tracks()[0].start).toBe(1.5);
});

test("two presses before the first import finishes add one track", async () => {
  let finish!: () => void;
  importAudio.mockImplementationOnce((_id: string, a: { title: string; durationSec: number }) => new Promise((resolve) => {
    finish = () => resolve(makeAudioTrack({ id: "one", title: a.title, sourceDuration: a.durationSec, kind: "sfx" }));
  }));
  await render(<AddAudioSheet visible onClose={() => {}} />);
  await fireEvent.press(btn("Effects"));
  await fireEvent.press(btn("Add Whoosh"));
  await fireEvent.press(btn("Add Whoosh"));
  await fireEvent.press(btn("Add Pop"));
  await waitFor(() => expect(importAudio).toHaveBeenCalled());
  await act(async () => { finish(); });
  await waitFor(() => expect(tracks()).toHaveLength(1));
  await waitFor(() => expect(btn("Add Whoosh")).toBeEnabled());
  expect(importAudio).toHaveBeenCalledTimes(1);
  expect(tracks()).toHaveLength(1);
  expect(useEditorStore.getState().past).toHaveLength(1);
});

test("a sheet dismissed during the import is not closed a second time; the track is still added", async () => {
  let finish!: () => void;
  importAudio.mockImplementationOnce((_id: string, a: { title: string; durationSec: number }) => new Promise((resolve) => {
    finish = () => resolve(makeAudioTrack({ id: "late", title: a.title, sourceDuration: a.durationSec }));
  }));
  const onClose = jest.fn();
  const view = await render(<AddAudioSheet visible onClose={onClose} />);
  await fireEvent.press(btn("Use Sunny Loop"));
  await waitFor(() => expect(importAudio).toHaveBeenCalled());
  await view.rerender(<AddAudioSheet visible={false} onClose={onClose} />);
  await act(async () => { finish(); });
  await waitFor(() => expect(tracks().map((t) => t.id)).toEqual(["late"]));
  expect(onClose).not.toHaveBeenCalled();
});

test("Files: busy from the press on, and a picker that fails is a toast", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  let fail!: (e: Error) => void;
  (DocumentPicker.getDocumentAsync as jest.Mock).mockClear();
  (DocumentPicker.getDocumentAsync as jest.Mock).mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }));
  await render(<AddAudioSheet visible onClose={() => {}} />);
  await fireEvent.press(btn("Files"));
  await fireEvent.press(btn("Choose a File"));
  expect(btn("Choose a File")).toBeDisabled();
  await act(async () => { fail(new Error("picker broke")); });
  await waitFor(() => expect(useToast.getState().message).toBe("Couldn't add that audio file."));
  await waitFor(() => expect(btn("Choose a File")).toBeEnabled());
  expect(tracks()).toEqual([]);
  expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledTimes(1);
  warn.mockRestore();
});

test("Files: a cancelled picker frees the button again without a toast", async () => {
  (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({ canceled: true });
  await render(<AddAudioSheet visible onClose={() => {}} />);
  await fireEvent.press(btn("Files"));
  await fireEvent.press(btn("Choose a File"));
  await waitFor(() => expect(btn("Choose a File")).toBeEnabled());
  expect(useToast.getState().message).toBeNull();
});

test("the preview player is left alone while nothing is previewing", async () => {
  const view = await render(<AddAudioSheet visible onClose={() => {}} />);
  await fireEvent.press(btn("Effects"));
  await fireEvent.press(btn("Music"));
  await fireEvent.press(btn("Done"));
  await view.rerender(<AddAudioSheet visible={false} onClose={() => {}} />);
  await view.unmount();
  expect(mockPlayer.pause).not.toHaveBeenCalled();
});

describe("Record tab", () => {
  const record = async (onClose: () => void, at: number) => {
    await render(<AddAudioSheet visible onClose={onClose} />);
    await act(() => { useEditorStore.getState().seek(at); });
    await fireEvent.press(btn("Record"));
    await fireEvent.press(btn("Start recording"));
    await waitFor(() => expect(btn("Stop recording")).toBeEnabled());
    mockRecorder.currentTime = 2.5;
  };

  test("records while the video plays with its sound muted; stopping adds a voice track where recording began and closes the sheet", async () => {
    const onClose = jest.fn();
    await record(onClose, 1.5);
    expect(useEditorStore.getState()).toMatchObject({ recording: true, isPlaying: true });
    expect(screen.getByText("Recording…")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    await fireEvent.press(btn("Stop recording"));
    await waitFor(() => expect(tracks()).toHaveLength(1));
    expect(importAudio).toHaveBeenCalledWith("p1", { uri: "file:///cache/rec.m4a", title: "Voice-over", durationSec: 2.5 }, "voice");
    expect(tracks()[0]).toMatchObject({ kind: "voice", title: "Voice-over", start: 1.5, trimEnd: 2.5 });
    expect(useEditorStore.getState()).toMatchObject({ recording: false, isPlaying: false, selectedAudioId: tracks()[0].id });
    expect(useEditorStore.getState().past).toHaveLength(1);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  test("closing the sheet while recording stops and saves, then closes", async () => {
    const onClose = jest.fn();
    await record(onClose, 0);
    await fireEvent.press(btn("Done"));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(mockRecorder.stop).toHaveBeenCalledTimes(1);
    expect(tracks()).toHaveLength(1);
    expect(tracks()[0]).toMatchObject({ kind: "voice", start: 0 });
    expect(useEditorStore.getState().recording).toBe(false);
  });

  test("switching tab while recording stops and saves instead of dropping the recording", async () => {
    const onClose = jest.fn();
    await record(onClose, 0);
    await fireEvent.press(btn("Music"));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(tracks()).toHaveLength(1);
    expect(tracks()[0].kind).toBe("voice");
  });

  test("a recording that is too short: the sheet closes first, then the toast shows", async () => {
    const order: string[] = [];
    const onClose = jest.fn(() => { order.push(`close:${useToast.getState().message}`); });
    await record(onClose, 0);
    mockRecorder.currentTime = 0.2;
    await fireEvent.press(btn("Stop recording"));
    await waitFor(() => expect(useToast.getState().message).toBe("That recording was too short."));
    expect(order).toEqual(["close:null"]);
    expect(tracks()).toEqual([]);
  });
});

test("it is a panel: inline, no scrim, the four tabs in the lead", async () => {
  await render(<AddAudioSheet visible onClose={() => {}} />);
  expect(screen.getByTestId("tool-panel")).toBeTruthy();
  expect(screen.getByTestId("tool-panel-lead")).toBeTruthy();
  expect(screen.queryByLabelText("Close sheet")).toBeNull();
  for (const l of ["Music", "Files", "Effects", "Record"]) expect(btn(l)).toBeTruthy();
});

test("hidden by its host (the closer, Export) it stops the preview, as when the sheet was hidden", async () => {
  const view = await render(<AddAudioSheet visible onClose={() => {}} />);
  await fireEvent.press(btn("Effects"));
  await fireEvent.press(btn("Play Whoosh"));
  mockPlayer.pause.mockClear();
  await view.rerender(<AddAudioSheet visible={false} onClose={() => {}} />);
  expect(mockPlayer.pause).toHaveBeenCalled();
});

describe("as a panel, hosted like the toolbar hosts it", () => {
  function Host() {
    useStripCloser();
    const open = useToolStrip((s) => s.open);
    return <AddAudioSheet visible={open?.id === "addAudio"} onClose={closeStrip} />;
  }
  const startRecording = async () => {
    await fireEvent.press(btn("Record"));
    await fireEvent.press(btn("Start recording"));
    await waitFor(() => expect(btn("Stop recording")).toBeEnabled());
    mockRecorder.currentTime = 2.5;
  };

  test("a selection change while recording does not take it away; stopping saves, selects the voice-over and closes it", async () => {
    await render(<Host />);
    await act(() => { openStrip("addAudio"); });
    await startRecording();
    await act(() => { useEditorStore.getState().select("a"); });
    expect(useToolStrip.getState().open?.id).toBe("addAudio");
    expect(useEditorStore.getState().recording).toBe(true);
    await act(() => { openStrip("ratio"); });
    expect(useToolStrip.getState().open?.id).toBe("addAudio");
    await fireEvent.press(btn("Stop recording"));
    await waitFor(() => expect(useToolStrip.getState().open).toBeNull());
    expect(tracks()).toHaveLength(1);
    expect(useEditorStore.getState().selectedAudioId).toBe(tracks()[0].id);
    expect(useEditorStore.getState().recording).toBe(false);
  });

  test("a selection change while recording, then a recording that is too short: the panel closes and the toast still shows", async () => {
    await render(<Host />);
    await act(() => { openStrip("addAudio"); });
    await startRecording();
    await act(() => { useEditorStore.getState().select("a"); });
    mockRecorder.currentTime = 0.2;
    await fireEvent.press(btn("Stop recording"));
    await waitFor(() => expect(useToast.getState().message).toBe("That recording was too short."));
    expect(useToolStrip.getState().open).toBeNull();
    expect(useEditorStore.getState().recording).toBe(false);
    expect(tracks()).toEqual([]);
  });

  test("a selection change while the recording is being saved does not take the panel away; a save that fails still shows its toast", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    let fail!: (e: Error) => void;
    importAudio.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }));
    await render(<Host />);
    await act(() => { openStrip("addAudio"); });
    await startRecording();
    await fireEvent.press(btn("Stop recording"));
    await waitFor(() => expect(importAudio).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Saving…")).toBeTruthy();
    await act(() => { useEditorStore.getState().select("a"); });   // a tap in the preview, live again
    expect(useToolStrip.getState().open?.id).toBe("addAudio");
    expect(screen.getByText("Saving…")).toBeTruthy();
    await act(() => { openStrip("ratio"); });
    expect(useToolStrip.getState().open?.id).toBe("addAudio");
    await act(async () => { fail(new Error("disk full")); });
    await waitFor(() => expect(useToast.getState().message).toBe("Couldn't save that recording."));
    expect(useToolStrip.getState().open).toBeNull();
    expect(useEditorStore.getState().recording).toBe(false);
    expect(tracks()).toEqual([]);
    warn.mockRestore();
  });

  test("a selection change while a too-short recording is being measured: the panel waits, then closes with the toast", async () => {
    let finish!: (seconds: number) => void;
    (audioDuration as jest.Mock).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await render(<Host />);
    await act(() => { openStrip("addAudio"); });
    await startRecording();
    await fireEvent.press(btn("Stop recording"));
    await waitFor(() => expect(finish).toBeDefined());
    await act(() => { useEditorStore.getState().select("a"); });
    expect(useToolStrip.getState().open?.id).toBe("addAudio");
    await act(async () => { finish(0.2); });
    await waitFor(() => expect(useToast.getState().message).toBe("That recording was too short."));
    expect(useToolStrip.getState().open).toBeNull();
    expect(useEditorStore.getState().recording).toBe(false);
  });

  test("a selection change while the recording is being saved: the saved voice-over ends up selected and the panel closed", async () => {
    let finish!: () => void;
    importAudio.mockImplementationOnce((_id: string, a: { title: string; durationSec: number }) => new Promise((resolve) => {
      finish = () => resolve(makeAudioTrack({ id: "held", title: a.title, sourceDuration: a.durationSec, kind: "voice" }));
    }));
    await render(<Host />);
    await act(() => { openStrip("addAudio"); });
    await startRecording();
    await fireEvent.press(btn("Stop recording"));
    await waitFor(() => expect(importAudio).toHaveBeenCalledTimes(1));
    await act(() => { useEditorStore.getState().select("a"); });
    expect(useToolStrip.getState().open?.id).toBe("addAudio");
    await act(async () => { finish(); });
    await waitFor(() => expect(useToolStrip.getState().open).toBeNull());
    expect(useEditorStore.getState()).toMatchObject({ recording: false, selectedAudioId: "held" });
    expect(useToast.getState().message).toBeNull();
  });

  test("adding a bundled track selects it and closes the panel; the closer has nothing left to do", async () => {
    await render(<Host />);
    await act(() => { openStrip("addAudio"); });
    await fireEvent.press(btn("Use Sunny Loop"));
    await waitFor(() => expect(tracks()).toHaveLength(1));
    await waitFor(() => expect(useToolStrip.getState().open).toBeNull());
    expect(useEditorStore.getState().selectedAudioId).toBe(tracks()[0].id);
  });

  test("a selection change closes the panel and stops a preview that was playing", async () => {
    await render(<Host />);
    await act(() => { openStrip("addAudio"); });
    await fireEvent.press(btn("Play Sunny Loop"));
    mockPlayer.pause.mockClear();
    await act(() => { useEditorStore.getState().select("a"); });
    expect(useToolStrip.getState().open).toBeNull();
    expect(screen.queryByTestId("tool-panel")).toBeNull();
    expect(mockPlayer.pause).toHaveBeenCalled();
  });

  test("the done mark while recording stops and saves first, then the panel closes; nothing is left recording", async () => {
    await render(<Host />);
    await act(() => { openStrip("addAudio"); });
    await startRecording();
    await fireEvent.press(btn("Done"));
    await waitFor(() => expect(useToolStrip.getState().open).toBeNull());
    await waitFor(() => expect(tracks()).toHaveLength(1));
    expect(mockRecorder.stop).toHaveBeenCalledTimes(1);
    expect(useEditorStore.getState()).toMatchObject({ recording: false, isPlaying: false });
  });

  test("playback pausing while recording (Export) stops and saves, and the panel closes itself", async () => {
    await render(<Host />);
    await act(() => { openStrip("addAudio"); });
    await startRecording();
    await act(() => { useEditorStore.getState().setPlaying(false); });
    await waitFor(() => expect(useToolStrip.getState().open).toBeNull());
    await waitFor(() => expect(tracks()).toHaveLength(1));
    expect(useEditorStore.getState().recording).toBe(false);
  });

  test("leaving the editor while recording discards the recording and clears the recording flag", async () => {
    const view = await render(<Host />);
    await act(() => { openStrip("addAudio"); });
    await startRecording();
    await view.unmount();
    expect(useEditorStore.getState()).toMatchObject({ recording: false, isPlaying: false });
    expect(useToolStrip.getState().open).toBeNull();
    expect(tracks()).toEqual([]);
  });

  test("leaving the editor while a preview plays survives a released player", async () => {
    const view = await render(<Host />);
    await act(() => { openStrip("addAudio"); });
    await fireEvent.press(btn("Play Sunny Loop"));
    mockPlayer.pause.mockImplementation(() => { throw new Error("released"); });
    try { await view.unmount(); } finally { mockPlayer.pause.mockImplementation(() => {}); }
  });

  test("a preview does not pause the project's own playback, and playback does not stop the preview", async () => {
    await render(<Host />);
    await act(() => { openStrip("addAudio"); });
    await act(() => { useEditorStore.getState().setPlaying(true); });
    await fireEvent.press(btn("Play Sunny Loop"));
    expect(useEditorStore.getState().isPlaying).toBe(true);
    expect(btn("Stop Sunny Loop")).toBeTruthy();
    mockPlayer.pause.mockClear();
    await act(() => { useEditorStore.getState().setPlaying(false); });
    expect(mockPlayer.pause).not.toHaveBeenCalled();
    expect(btn("Stop Sunny Loop")).toBeTruthy();
  });
});
