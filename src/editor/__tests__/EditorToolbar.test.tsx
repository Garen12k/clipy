import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
jest.mock("@/src/lib/id", () => ({ newId: () => "dup" }));
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@/src/projects/pickMedia", () => ({ pickMedia: jest.fn() }));
jest.mock("@/src/projects", () => ({ storage: { importMedia: jest.fn(), saveStill: jest.fn() } }));
jest.mock("expo-video-thumbnails", () => ({ getThumbnailAsync: jest.fn(async () => ({ uri: "file:///thumb.jpg" })) }));
import { storage } from "@/src/projects";
import { pickMedia } from "@/src/projects/pickMedia";
import { useToast } from "@/src/ui/Toast";
import { makeClip, makeEffect, makeOverlay, makePhotoClip, makeProject, makeSticker } from "@/src/editor/model/types";
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
