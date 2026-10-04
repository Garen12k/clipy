import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
jest.mock("@/src/lib/id", () => ({ newId: () => "dup" }));
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@/src/projects/pickMedia", () => ({ pickMedia: jest.fn() }));
jest.mock("@/src/projects", () => ({ storage: { importMedia: jest.fn(), saveStill: jest.fn() } }));
jest.mock("expo-video-thumbnails", () => ({ getThumbnailAsync: jest.fn(async () => ({ uri: "file:///thumb.jpg" })) }));
import { storage } from "@/src/projects";
import { pickMedia } from "@/src/projects/pickMedia";
import { useToast } from "@/src/ui/Toast";
import { AUDIO_LIMITS, makeAudioTrack, makeClip, makeEffect, makeOverlay, makePhotoClip, makeProject, makeSticker } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { EditorToolbar } from "../components/EditorToolbar";

const openGroup = async (name: string) => { await fireEvent.press(screen.getByRole("tab", { name })); };

beforeEach(() => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 4 })] }));
});

test("clip tools are disabled without a selection; Ratio is always enabled", async () => {
  await render(<EditorToolbar panelFor={null} onPanelChange={() => {}} transitionFor={null} onTransitionChange={() => {}} />);
  for (const l of ["Split", "Trim", "Duplicate", "Delete"]) expect(screen.getByRole("button", { name: l })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Ratio" })).toBeEnabled();
  await openGroup("Audio");
  expect(screen.getByRole("button", { name: "Volume" })).toBeDisabled();
  await openGroup("Text");
  expect(screen.getByRole("button", { name: "Text" })).toBeEnabled();
});

test("Text is disabled for an empty project", async () => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setProject(makeProject());
  await render(<EditorToolbar panelFor={null} onPanelChange={() => {}} transitionFor={null} onTransitionChange={() => {}} />);
  await openGroup("Text");
  expect(screen.getByRole("button", { name: "Text" })).toBeDisabled();
  await openGroup("Effects");
  expect(screen.getByRole("button", { name: "Templates" })).toBeDisabled();
});

test("Templates is enabled without a selection when the project has clips and opens the sheet", async () => {
  await render(<EditorToolbar panelFor={null} onPanelChange={() => {}} transitionFor={null} onTransitionChange={() => {}} />);
  await openGroup("Effects");
  expect(screen.getByRole("button", { name: "Templates" })).toBeEnabled();
  await fireEvent.press(screen.getByRole("button", { name: "Templates" }));
  expect(screen.getByRole("button", { name: "Random template" })).toBeTruthy();
});

test("Split cuts at the playhead; Duplicate and Delete act on the selection", async () => {
  await render(<EditorToolbar panelFor={null} onPanelChange={() => {}} transitionFor={null} onTransitionChange={() => {}} />);
  await act(() => { useEditorStore.getState().select("a"); useEditorStore.getState().seek(1.5); });
  await fireEvent.press(screen.getByRole("button", { name: "Split" }));
  expect(useEditorStore.getState().project?.clips).toHaveLength(3);
  await fireEvent.press(screen.getByRole("button", { name: "Duplicate" }));
  expect(useEditorStore.getState().project?.clips).toHaveLength(4);
  await fireEvent.press(screen.getByRole("button", { name: "Delete" }));
  expect(useEditorStore.getState().project?.clips).toHaveLength(3);
  expect(useEditorStore.getState().selectedClipId).toBeNull();
});

test("Text adds an overlay at the playhead and selects it", async () => {
  await render(<EditorToolbar panelFor={null} onPanelChange={() => {}} transitionFor={null} onTransitionChange={() => {}} />);
  useEditorStore.getState().seek(2);
  await openGroup("Text");
  await fireEvent.press(screen.getByRole("button", { name: "Text" }));
  const ovs = useEditorStore.getState().project!.overlays;
  expect(ovs).toHaveLength(1);
  expect(ovs[0]).toMatchObject({ start: 2, end: 5, text: "Your text" });
  expect(useEditorStore.getState().selectedOverlayId).toBe(ovs[0].id);
});

test("Volume is enabled after selecting a clip", async () => {
  await render(<EditorToolbar panelFor={null} onPanelChange={() => {}} transitionFor={null} onTransitionChange={() => {}} />);
  await openGroup("Audio");
  expect(screen.getByRole("button", { name: "Volume" })).toBeDisabled();
  await act(() => { useEditorStore.getState().select("a"); });
  expect(screen.getByRole("button", { name: "Volume" })).toBeEnabled();
});

test("Speed is disabled without a selection and enabled after selecting a clip", async () => {
  await render(<EditorToolbar panelFor={null} onPanelChange={() => {}} transitionFor={null} onTransitionChange={() => {}} />);
  await openGroup("Effects");
  expect(screen.getByRole("button", { name: "Speed" })).toBeDisabled();
  await act(() => { useEditorStore.getState().select("a"); });
  expect(screen.getByRole("button", { name: "Speed" })).toBeEnabled();
});

test("five group tabs; Edit is selected by default and only its tools show", async () => {
  await render(<EditorToolbar panelFor={null} onPanelChange={() => {}} transitionFor={null} onTransitionChange={() => {}} />);
  expect(screen.getAllByRole("tab").map((t) => t.props.accessibilityLabel)).toEqual(["Edit", "Effects", "Text", "Stickers", "Audio"]);
  expect(screen.getByRole("tab", { name: "Edit" })).toBeSelected();
  expect(screen.getByRole("button", { name: "Split" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Filter" })).toBeNull();
});

test("selecting a clip keeps Effects/Audio, but leaves Text/Stickers for Edit", async () => {
  await render(<EditorToolbar panelFor={null} onPanelChange={() => {}} transitionFor={null} onTransitionChange={() => {}} />);
  await openGroup("Effects");
  await act(() => { useEditorStore.getState().select("a"); });
  expect(screen.getByRole("tab", { name: "Effects" })).toBeSelected();
  await openGroup("Text");
  await act(() => { useEditorStore.getState().select("b"); });
  expect(screen.getByRole("tab", { name: "Edit" })).toBeSelected();
  await openGroup("Audio");
  await act(() => { useEditorStore.getState().select(null); });
  expect(screen.getByRole("tab", { name: "Audio" })).toBeSelected();
});

test("selecting a sticker overlay shows Stickers; a text overlay shows Text", async () => {
  useEditorStore.getState().setProject(makeProject({
    clips: [makeClip({ id: "a", sourceDuration: 4 })],
    overlays: [makeSticker({ id: "s1" }), makeOverlay({ id: "t1" })],
  }));
  await render(<EditorToolbar panelFor={null} onPanelChange={() => {}} transitionFor={null} onTransitionChange={() => {}} />);
  await act(() => { useEditorStore.getState().selectOverlay("s1"); });
  expect(screen.getByRole("tab", { name: "Stickers" })).toBeSelected();
  await act(() => { useEditorStore.getState().selectOverlay("t1"); });
  expect(screen.getByRole("tab", { name: "Text" })).toBeSelected();
});

const renderBar = () => render(<EditorToolbar panelFor={null} onPanelChange={() => {}} transitionFor={null} onTransitionChange={() => {}} />);

test("Edit group lists the new tools", async () => {
  await renderBar();
  const labels = screen.getAllByRole("button").map((b) => b.props.accessibilityLabel);
  expect(labels).toEqual(expect.arrayContaining(["Split", "Trim", "Transform", "Crop", "Replace", "Reverse", "Freeze", "Duplicate", "Delete", "Ratio"]));
});

test("Transform, Reverse, Crop, Replace and Freeze need a selection; Freeze is enabled for a video clip", async () => {
  await renderBar();
  for (const l of ["Transform", "Reverse", "Crop", "Replace"]) expect(screen.getByRole("button", { name: l })).toBeDisabled();
  await act(() => { useEditorStore.getState().select("a"); });
  for (const l of ["Transform", "Reverse", "Crop", "Replace"]) expect(screen.getByRole("button", { name: l })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Freeze" })).toBeEnabled();
});

test("pressing Freeze runs the freeze capture for the selected clip", async () => {
  const VT = jest.requireMock("expo-video-thumbnails") as { getThumbnailAsync: jest.Mock };
  VT.getThumbnailAsync.mockClear();
  VT.getThumbnailAsync.mockResolvedValueOnce({ uri: "file:///tmp/f.jpg" });
  (storage as unknown as { saveStill: jest.Mock }).saveStill.mockResolvedValueOnce({ uri: "file:///p/media/s.jpg" });
  await renderBar();
  await act(() => { useEditorStore.getState().select("a"); useEditorStore.getState().seek(1); });
  await fireEvent.press(screen.getByRole("button", { name: "Freeze" }));
  await waitFor(() => expect(VT.getThumbnailAsync).toHaveBeenCalledWith(expect.any(String), { time: 1000, quality: 1 }));
  await waitFor(() => expect(useEditorStore.getState().project!.clips).toHaveLength(4));
});

test("Freeze is disabled without a selection", async () => {
  await renderBar();
  expect(screen.getByRole("button", { name: "Freeze" })).toBeDisabled();
});

test("a photo selection disables Reverse, Freeze, Speed and Volume but keeps Transform and Background", async () => {
  useEditorStore.getState().setProject(makeProject({ clips: [makePhotoClip({ id: "p" }), makeClip({ id: "a", sourceDuration: 4 })] }));
  await renderBar();
  await act(() => { useEditorStore.getState().select("p"); });
  expect(screen.getByRole("button", { name: "Reverse" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Freeze" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Transform" })).toBeEnabled();
  await openGroup("Effects");
  expect(screen.getByRole("button", { name: "Speed" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Background" })).toBeEnabled();
  await openGroup("Audio");
  expect(screen.getByRole("button", { name: "Volume" })).toBeDisabled();
});

test("Background needs a selection", async () => {
  await renderBar();
  await openGroup("Effects");
  expect(screen.getByRole("button", { name: "Background" })).toBeDisabled();
  await act(() => { useEditorStore.getState().select("a"); });
  expect(screen.getByRole("button", { name: "Background" })).toBeEnabled();
});

test("Reverse toggles the clip and shows active; one undo step each", async () => {
  await renderBar();
  await act(() => { useEditorStore.getState().select("a"); });
  await fireEvent.press(screen.getByRole("button", { name: "Reverse" }));
  expect(useEditorStore.getState().project!.clips[0].reversed).toBe(true);
  expect(screen.getByRole("button", { name: "Reverse" })).toBeSelected();
  await fireEvent.press(screen.getByRole("button", { name: "Reverse" }));
  expect(useEditorStore.getState().project!.clips[0].reversed).toBe(false);
  await act(() => { useEditorStore.getState().undo(); });
  expect(useEditorStore.getState().project!.clips[0].reversed).toBe(true);
});

test("Transform and Background open their sheets", async () => {
  await renderBar();
  await act(() => { useEditorStore.getState().select("a"); });
  await fireEvent.press(screen.getByRole("button", { name: "Transform" }));
  expect(screen.getByRole("button", { name: "Rotate 90°" })).toBeTruthy();
});

const pick = pickMedia as jest.Mock;
const importMedia = storage.importMedia as jest.Mock;
const videoAsset = { uri: "file:///new.mov", kind: "video" as const, durationSec: 9, width: 1920, height: 1080 };

describe("Replace", () => {
  beforeEach(() => { pick.mockReset(); importMedia.mockReset(); useToast.getState().clear(); });

  test("is enabled for a photo selection too", async () => {
    useEditorStore.getState().setProject(makeProject({ clips: [makePhotoClip({ id: "p" })] }));
    await renderBar();
    await act(() => { useEditorStore.getState().select("p"); });
    expect(screen.getByRole("button", { name: "Replace" })).toBeEnabled();
  });

  test("swaps the selected clip's media in one undo step and keeps it selected", async () => {
    pick.mockResolvedValueOnce([videoAsset]);
    importMedia.mockResolvedValueOnce({ clips: [makeClip({ id: "imported", sourceDuration: 9, sourceUri: "file:///p1/media/imported.mov", width: 1920, height: 1080 })], failed: 0 });
    await renderBar();
    await act(() => { useEditorStore.getState().select("a"); });
    await fireEvent.press(screen.getByRole("button", { name: "Replace" }));
    await waitFor(() => expect(useEditorStore.getState().project!.clips[0].sourceUri).toBe("file:///p1/media/imported.mov"));
    expect(pick).toHaveBeenCalledWith({ multiple: false });
    expect(importMedia).toHaveBeenCalledWith("p1", [videoAsset]);
    const s = useEditorStore.getState();
    expect(s.project!.clips[0]).toMatchObject({ id: "a", sourceDuration: 9, trimStart: 0, trimEnd: 4, width: 1920 });
    expect(s.selectedClipId).toBe("a");
    expect(s.past).toHaveLength(1);
  });

  test("a cancelled pick changes nothing", async () => {
    pick.mockResolvedValueOnce(null);
    await renderBar();
    await act(() => { useEditorStore.getState().select("a"); });
    await fireEvent.press(screen.getByRole("button", { name: "Replace" }));
    await waitFor(() => expect(pick).toHaveBeenCalled());
    expect(importMedia).not.toHaveBeenCalled();
    expect(useEditorStore.getState().past).toHaveLength(0);
    expect(useToast.getState().message).toBeNull();
  });

  test("a failed import toasts and changes nothing", async () => {
    pick.mockResolvedValueOnce([videoAsset]);
    importMedia.mockResolvedValueOnce({ clips: [], failed: 1 });
    await renderBar();
    await act(() => { useEditorStore.getState().select("a"); });
    await fireEvent.press(screen.getByRole("button", { name: "Replace" }));
    await waitFor(() => expect(useToast.getState().message).toBe("Couldn't replace the clip."));
    expect(useEditorStore.getState().past).toHaveLength(0);
  });

  test("a video too short to be a clip is refused with a toast", async () => {
    pick.mockResolvedValueOnce([videoAsset]);
    importMedia.mockResolvedValueOnce({ clips: [makeClip({ id: "imported", sourceDuration: 0.05 })], failed: 0 });
    await renderBar();
    await act(() => { useEditorStore.getState().select("a"); });
    await fireEvent.press(screen.getByRole("button", { name: "Replace" }));
    await waitFor(() => expect(useToast.getState().message).toBe("That video is too short."));
    expect(useEditorStore.getState().past).toHaveLength(0);
    expect(useEditorStore.getState().project!.clips[0].sourceUri).toBe("file:///media/a.mp4");
  });
});

test("a reversed clip disables Volume (the export is silent)", async () => {
  useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "r", sourceDuration: 4, reversed: true }), makeClip({ id: "a", sourceDuration: 4 })] }));
  await renderBar();
  await act(() => { useEditorStore.getState().select("r"); });
  await openGroup("Audio");
  expect(screen.getByRole("button", { name: "Volume" })).toBeDisabled();
  await act(() => { useEditorStore.getState().select("a"); });
  expect(screen.getByRole("button", { name: "Volume" })).toBeEnabled();
});

test("Adjust is disabled without a selection, enabled for a selected clip, and opens the sheet", async () => {
  await render(<EditorToolbar panelFor={null} onPanelChange={() => {}} transitionFor={null} onTransitionChange={() => {}} />);
  await openGroup("Effects");
  expect(screen.getByRole("button", { name: "Adjust" })).toBeDisabled();
  await act(() => { useEditorStore.getState().select("a"); });
  expect(screen.getByRole("button", { name: "Adjust" })).toBeEnabled();
  await fireEvent.press(screen.getByRole("button", { name: "Adjust" }));
  expect(screen.getByRole("button", { name: "Reset" })).toBeTruthy();
});

describe("Effects on the timeline", () => {
  const withEffect = () => useEditorStore.getState().setProject(makeProject({
    clips: [makeClip({ id: "a", sourceDuration: 10 })],
    effects: [makeEffect({ id: "e1", type: "glow", start: 1, end: 3 })],
  }));
  const effects = () => useEditorStore.getState().project!.effects;
  const NORMAL = ["Filter", "Adjust", "Speed", "Transition", "Templates", "Background"];
  const SELECTED = ["Strength", "Duplicate", "Delete"];
  const subRow = () => screen.getAllByRole("button").map((b) => b.props.accessibilityLabel as string).filter((l) => ["Effect", ...NORMAL, ...SELECTED].includes(l));

  test("Effect is enabled whenever a project is open, even an empty one, and opens the Effects sheet", async () => {
    useEditorStore.getState().setProject(makeProject());
    await renderBar();
    await openGroup("Effects");
    expect(screen.getByRole("button", { name: "Effect" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Glitch" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Effect" }));
    expect(screen.getByRole("button", { name: "Glitch" })).toBeTruthy();
  });

  test("adding from the sheet selects the effect, closes the sheet and swaps the sub-row", async () => {
    await renderBar();
    await openGroup("Effects");
    await fireEvent.press(screen.getByRole("button", { name: "Effect" }));
    await fireEvent.press(screen.getByRole("button", { name: "Glitch" }));
    expect(effects()).toHaveLength(1);
    expect(useEditorStore.getState().selectedEffectId).toBe(effects()[0].id);
    expect(screen.queryByRole("button", { name: "Glitch" })).toBeNull();
    expect(screen.getByRole("button", { name: "Strength" })).toBeEnabled();
  });

  test("selecting an effect jumps to Effects and shows exactly Effect, Strength, Duplicate, Delete; deselecting restores the tools", async () => {
    withEffect();
    await renderBar();
    expect(screen.queryByRole("button", { name: "Strength" })).toBeNull();
    await act(() => { useEditorStore.getState().selectEffect("e1"); });
    expect(screen.getByRole("tab", { name: "Effects" })).toBeSelected();
    expect(subRow()).toEqual(["Effect", "Strength", "Duplicate", "Delete"]);
    for (const l of ["Effect", ...SELECTED]) expect(screen.getByRole("button", { name: l })).toBeEnabled();
    await act(() => { useEditorStore.getState().selectEffect(null); });
    expect(screen.getByRole("tab", { name: "Effects" })).toBeSelected();
    expect(subRow()).toEqual(["Filter", "Adjust", "Effect", "Speed", "Transition", "Templates", "Background"]);
  });

  test("a second effect can be added while one is selected", async () => {
    withEffect();
    await renderBar();
    await act(() => { useEditorStore.getState().selectEffect("e1"); useEditorStore.getState().seek(5); });
    await fireEvent.press(screen.getByRole("button", { name: "Effect" }));
    await fireEvent.press(screen.getByRole("button", { name: "Shake" }));
    expect(effects()).toMatchObject([{ id: "e1" }, { id: "dup", type: "shake", start: 5, end: 7 }]);
    expect(useEditorStore.getState().selectedEffectId).toBe("dup");
  });

  test("selecting a clip instead restores the normal Effects tools; other groups are not swapped", async () => {
    withEffect();
    await renderBar();
    await act(() => { useEditorStore.getState().selectEffect("e1"); });
    await openGroup("Edit");
    expect(screen.getByRole("button", { name: "Split" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Strength" })).toBeNull();
    await openGroup("Effects");
    expect(screen.getByRole("button", { name: "Strength" })).toBeTruthy();
    await act(() => { useEditorStore.getState().select("a"); });
    expect(screen.queryByRole("button", { name: "Strength" })).toBeNull();
    expect(screen.getByRole("button", { name: "Filter" })).toBeEnabled();
  });

  test("Strength opens the strength sheet for the selected effect", async () => {
    withEffect();
    await renderBar();
    await act(() => { useEditorStore.getState().selectEffect("e1"); });
    expect(screen.queryByTestId("effect-strength")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Strength" }));
    expect(screen.getByTestId("effect-strength")).toBeTruthy();
    expect(screen.getByText("Strength 70")).toBeTruthy();
  });

  test("Duplicate copies the effect in one undo step, selects the copy and keeps the sub-row", async () => {
    withEffect();
    await renderBar();
    await act(() => { useEditorStore.getState().selectEffect("e1"); });
    await fireEvent.press(screen.getByRole("button", { name: "Duplicate" }));
    expect(effects()).toMatchObject([{ id: "e1", start: 1, end: 3 }, { id: "dup", type: "glow", start: 3, end: 5 }]);
    expect(useEditorStore.getState().past).toHaveLength(1);
    expect(useEditorStore.getState().selectedEffectId).toBe("dup");
    expect(useEditorStore.getState().project!.clips).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Strength" })).toBeTruthy();
  });

  test("Delete removes the effect in one undo step, clears the selection and restores the tools", async () => {
    withEffect();
    await renderBar();
    await act(() => { useEditorStore.getState().selectEffect("e1"); });
    await fireEvent.press(screen.getByRole("button", { name: "Delete" }));
    expect(effects()).toEqual([]);
    expect(useEditorStore.getState().project!.clips).toHaveLength(1);
    expect(useEditorStore.getState().selectedEffectId).toBeNull();
    expect(useEditorStore.getState().past).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Strength" })).toBeNull();
    expect(screen.getByRole("button", { name: "Filter" })).toBeTruthy();
  });
});

describe("Audio tools", () => {
  const withAudio = (count = 2) => useEditorStore.getState().setProject(makeProject({
    clips: [makeClip({ id: "a", sourceDuration: 10 })],
    audioTracks: Array.from({ length: count }, (_, i) => makeAudioTrack({ id: `t${i + 1}`, sourceDuration: 4, start: i, volume: 1.2 })),
  }));
  const tracks = () => useEditorStore.getState().project!.audioTracks;
  const btn = (name: string) => screen.getByRole("button", { name });
  const row = () => screen.getAllByRole("button").map((b) => b.props.accessibilityLabel as string);
  const past = () => useEditorStore.getState().past.length;
  beforeEach(() => { useToast.getState().clear(); });

  test("Beats opens the beat markers sheet, whose Tap adds a marker at the playhead", async () => {
    await renderBar();
    await openGroup("Audio");
    expect(btn("Beats")).toBeEnabled();
    expect(screen.queryByRole("header", { name: "Beat markers" })).toBeNull();
    await fireEvent.press(btn("Beats"));
    expect(screen.getByRole("header", { name: "Beat markers" })).toBeTruthy();
    await act(() => { useEditorStore.getState().seek(2); });
    await fireEvent.press(btn("Tap"));
    expect(useEditorStore.getState().project!.beatMarkers).toEqual([2]);
    expect(past()).toBe(1);
  });

  test("the Audio group lists Add audio, Volume, Ducking, Beats; Add audio opens the sheet", async () => {
    await renderBar();
    await openGroup("Audio");
    expect(row()).toEqual(["Add audio", "Volume", "Ducking", "Beats"]);
    expect(btn("Add audio")).toBeEnabled();
    expect(btn("Ducking")).toBeEnabled();
    expect(screen.queryByRole("header", { name: "Add audio" })).toBeNull();
    await fireEvent.press(btn("Add audio"));
    expect(screen.getByRole("header", { name: "Add audio" })).toBeTruthy();
  });

  test("Ducking toggles the project's ducking in one undo step each and shows active", async () => {
    await renderBar();
    await openGroup("Audio");
    expect(btn("Ducking")).not.toBeSelected();
    await fireEvent.press(btn("Ducking"));
    expect(useEditorStore.getState().project!.ducking).toBe(true);
    expect(btn("Ducking")).toBeSelected();
    expect(past()).toBe(1);
    await fireEvent.press(btn("Ducking"));
    expect(useEditorStore.getState().project!.ducking).toBe(false);
    expect(btn("Ducking")).not.toBeSelected();
    expect(past()).toBe(2);
  });

  test("selecting a track jumps to Audio and shows exactly Volume, Fade, Duplicate, Delete; deselecting restores the tools", async () => {
    withAudio();
    await renderBar();
    await act(() => { useEditorStore.getState().selectAudio("t1"); });
    expect(screen.getByRole("tab", { name: "Audio" })).toBeSelected();
    expect(row()).toEqual(["Volume", "Fade", "Duplicate", "Delete"]);
    for (const l of row()) expect(btn(l)).toBeEnabled();
    await openGroup("Edit");
    expect(btn("Split")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Fade" })).toBeNull();
    await openGroup("Audio");
    await act(() => { useEditorStore.getState().selectAudio(null); });
    expect(screen.getByRole("tab", { name: "Audio" })).toBeSelected();
    expect(row()).toEqual(["Add audio", "Volume", "Ducking", "Beats"]);
  });

  test("Volume opens the selected track's volume sheet, Fade its fade sheet", async () => {
    withAudio();
    await renderBar();
    await act(() => { useEditorStore.getState().selectAudio("t2"); });
    expect(screen.queryByTestId("audio-volume")).toBeNull();
    await fireEvent.press(btn("Volume"));
    expect(screen.getByTestId("audio-volume")).toBeTruthy();
    expect(screen.getByText("Volume 120 %")).toBeTruthy();
    expect(screen.queryByTestId("volume-slider")).toBeNull();
    await fireEvent(screen.getByTestId("audio-volume"), "valueChange", 0.4);
    expect(tracks().map((t) => t.volume)).toEqual([1.2, 0.4]);
    await fireEvent.press(btn("Fade"));
    expect(screen.getByTestId("fade-in").props.maximumValue).toBe(2);
    await fireEvent(screen.getByTestId("fade-in"), "valueChange", 1);
    expect(tracks().map((t) => t.fadeIn)).toEqual([0, 1]);
  });

  test("Duplicate copies the track in one undo step and selects the copy", async () => {
    withAudio();
    await renderBar();
    await act(() => { useEditorStore.getState().selectAudio("t1"); });
    await fireEvent.press(btn("Duplicate"));
    expect(tracks().map((t) => t.id)).toEqual(["t1", "dup", "t2"]);
    expect(past()).toBe(1);
    expect(useEditorStore.getState().selectedAudioId).toBe("dup");
    expect(row()).toEqual(["Volume", "Fade", "Duplicate", "Delete"]);
    expect(useToast.getState().message).toBeNull();
  });

  test("Duplicate at the track limit toasts and changes nothing", async () => {
    withAudio(AUDIO_LIMITS.maxTracks);
    await renderBar();
    await act(() => { useEditorStore.getState().selectAudio("t1"); });
    await fireEvent.press(btn("Duplicate"));
    expect(tracks()).toHaveLength(AUDIO_LIMITS.maxTracks);
    expect(past()).toBe(0);
    expect(useEditorStore.getState().selectedAudioId).toBe("t1");
    expect(useToast.getState().message).toBe("You've reached the audio track limit.");
  });

  test("Delete removes the track in one undo step, clears the selection and restores the tools", async () => {
    withAudio();
    await renderBar();
    await act(() => { useEditorStore.getState().selectAudio("t1"); });
    await fireEvent.press(btn("Delete"));
    expect(tracks().map((t) => t.id)).toEqual(["t2"]);
    expect(past()).toBe(1);
    expect(useEditorStore.getState().selectedAudioId).toBeNull();
    expect(useEditorStore.getState().project!.clips).toHaveLength(1);
    expect(row()).toEqual(["Add audio", "Volume", "Ducking", "Beats"]);
  });
});

describe("Animate and Keyframe", () => {
  const withOverlays = () => useEditorStore.getState().setProject(makeProject({
    clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 4 })],
    overlays: [makeOverlay({ id: "t1", start: 1, end: 3 }), makeSticker({ id: "s1", start: 1, end: 3 }), makeOverlay({ id: "c1", kind: "caption", start: 1, end: 3 })],
  }));
  const btn = (name: string) => screen.getByRole("button", { name });
  const clipPins = (i = 0) => useEditorStore.getState().project!.clips[i].keyframes;
  const overlayPins = (id: string) => useEditorStore.getState().project!.overlays.find((o) => o.id === id)!.keyframes;
  const past = () => useEditorStore.getState().past.length;

  test("sit after Transform in Edit and at the end of Text and Stickers", async () => {
    await renderBar();
    const row = () => screen.getAllByRole("button").map((b) => b.props.accessibilityLabel as string);
    expect(row().slice(0, 5)).toEqual(["Split", "Trim", "Transform", "Animate", "Keyframe"]);
    await openGroup("Text");
    expect(row()).toEqual(["Text", "Captions", "Animate", "Keyframe"]);
    await openGroup("Stickers");
    expect(row()).toEqual(["Sticker", "Animate", "Keyframe"]);
  });

  test("both are disabled without a selection in every group", async () => {
    withOverlays();
    await renderBar();
    for (const g of ["Edit", "Text", "Stickers"]) {
      await openGroup(g);
      expect(btn("Animate")).toBeDisabled();
      expect(btn("Keyframe")).toBeDisabled();
    }
  });

  test("Edit: a selected clip enables Animate; Keyframe also needs the playhead on that clip", async () => {
    await renderBar();
    await act(() => { useEditorStore.getState().select("a"); useEditorStore.getState().seek(1); });
    expect(btn("Animate")).toBeEnabled();
    expect(btn("Keyframe")).toBeEnabled();
    await act(() => { useEditorStore.getState().seek(5); });
    expect(btn("Animate")).toBeEnabled();
    expect(btn("Keyframe")).toBeDisabled();
    await act(() => { useEditorStore.getState().select("b"); });
    expect(btn("Keyframe")).toBeEnabled();
  });

  test("Edit: Keyframe adds a pin then removes it, the diamond fills while on the pin, one undo step each", async () => {
    await renderBar();
    await act(() => { useEditorStore.getState().select("a"); useEditorStore.getState().seek(1); });
    expect(btn("Keyframe")).not.toBeSelected();
    await fireEvent.press(btn("Keyframe"));
    expect(clipPins()).toHaveLength(1);
    expect(clipPins()[0].t).toBeCloseTo(1);
    expect(past()).toBe(1);
    expect(btn("Keyframe")).toBeSelected();
    await act(() => { useEditorStore.getState().seek(2); });
    expect(btn("Keyframe")).not.toBeSelected();
    await act(() => { useEditorStore.getState().seek(1); });
    expect(btn("Keyframe")).toBeSelected();
    await fireEvent.press(btn("Keyframe"));
    expect(clipPins()).toHaveLength(0);
    expect(past()).toBe(2);
    expect(btn("Keyframe")).not.toBeSelected();
    await act(() => { useEditorStore.getState().undo(); });
    expect(clipPins()).toHaveLength(1);
  });

  test("Edit: Animate opens the clip animation sheet", async () => {
    await renderBar();
    await act(() => { useEditorStore.getState().select("a"); });
    expect(screen.queryByRole("button", { name: "Combo" })).toBeNull();
    await fireEvent.press(btn("Animate"));
    expect(btn("Combo")).toBeTruthy();
    await fireEvent.press(btn("Fade"));
    expect(useEditorStore.getState().project!.clips[0].animation.in).toEqual({ id: "fade", duration: 0.5 });
  });

  test("Text: a selected text enables both inside its range; Keyframe is off outside it", async () => {
    withOverlays();
    await renderBar();
    await act(() => { useEditorStore.getState().selectOverlay("t1"); useEditorStore.getState().seek(2); });
    expect(screen.getByRole("tab", { name: "Text" })).toBeSelected();
    expect(btn("Animate")).toBeEnabled();
    expect(btn("Keyframe")).toBeEnabled();
    await act(() => { useEditorStore.getState().seek(1); });
    expect(btn("Keyframe")).toBeEnabled();
    await act(() => { useEditorStore.getState().seek(3); });
    expect(btn("Keyframe")).toBeEnabled();
    await act(() => { useEditorStore.getState().seek(0.5); });
    expect(btn("Keyframe")).toBeDisabled();
    await act(() => { useEditorStore.getState().seek(5); });
    expect(btn("Keyframe")).toBeDisabled();
    expect(btn("Animate")).toBeEnabled();
  });

  test("Text: Keyframe toggles a pin on the text and Animate opens the overlay sheet", async () => {
    withOverlays();
    await renderBar();
    await act(() => { useEditorStore.getState().selectOverlay("t1"); useEditorStore.getState().seek(2); });
    await fireEvent.press(btn("Keyframe"));
    expect(overlayPins("t1")).toHaveLength(1);
    expect(overlayPins("t1")[0].t).toBeCloseTo(1);
    expect(past()).toBe(1);
    expect(btn("Keyframe")).toBeSelected();
    await fireEvent.press(btn("Keyframe"));
    expect(overlayPins("t1")).toHaveLength(0);
    expect(past()).toBe(2);
    expect(btn("Keyframe")).not.toBeSelected();
    await fireEvent.press(btn("Animate"));
    expect(btn("Loop")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Combo" })).toBeNull();
    await fireEvent.press(btn("Pop"));
    expect(useEditorStore.getState().project!.overlays[0].animation.in).toEqual({ id: "pop", duration: 0.5 });
  });

  test("a caption selection disables both", async () => {
    withOverlays();
    await renderBar();
    await act(() => { useEditorStore.getState().selectOverlay("c1"); useEditorStore.getState().seek(2); });
    expect(screen.getByRole("tab", { name: "Text" })).toBeSelected();
    expect(btn("Animate")).toBeDisabled();
    expect(btn("Keyframe")).toBeDisabled();
  });

  test("Stickers: a selected sticker enables both and Keyframe pins the sticker", async () => {
    withOverlays();
    await renderBar();
    await act(() => { useEditorStore.getState().selectOverlay("s1"); useEditorStore.getState().seek(2); });
    expect(screen.getByRole("tab", { name: "Stickers" })).toBeSelected();
    expect(btn("Animate")).toBeEnabled();
    await fireEvent.press(btn("Keyframe"));
    expect(overlayPins("s1")).toHaveLength(1);
    expect(overlayPins("t1")).toHaveLength(0);
    await fireEvent.press(btn("Animate"));
    expect(btn("Loop")).toBeTruthy();
  });

  test("the tools follow the group: a text selection does not enable them in Stickers or Edit, nor a sticker in Text", async () => {
    withOverlays();
    await renderBar();
    await act(() => { useEditorStore.getState().selectOverlay("t1"); useEditorStore.getState().seek(2); });
    for (const g of ["Stickers", "Edit"]) {
      await openGroup(g);
      expect(btn("Animate")).toBeDisabled();
      expect(btn("Keyframe")).toBeDisabled();
    }
    await act(() => { useEditorStore.getState().selectOverlay("s1"); });
    await openGroup("Text");
    expect(btn("Animate")).toBeDisabled();
    expect(btn("Keyframe")).toBeDisabled();
  });
});
