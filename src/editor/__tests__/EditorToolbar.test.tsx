import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
jest.mock("@/src/lib/id", () => ({ newId: () => "dup" }));
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@/src/projects/pickMedia", () => ({ pickMedia: jest.fn() }));
jest.mock("@/src/projects", () => ({ storage: { importMedia: jest.fn(), saveStill: jest.fn() } }));
jest.mock("expo-video-thumbnails", () => ({ getThumbnailAsync: jest.fn(async () => ({ uri: "file:///thumb.jpg" })) }));
import { storage } from "@/src/projects";
import { pickMedia } from "@/src/projects/pickMedia";
import * as haptics from "@/src/ui/haptics";
import { useToast } from "@/src/ui/Toast";
import { BAR_HEIGHT, STRIP } from "@/src/ui/ToolStrip";
import * as ops from "@/src/editor/model/ops";
import { deleteClip, moveClip } from "@/src/editor/model/ops";
import { AUDIO_LIMITS, makeAudioTrack, makeClip, makeEffect, makeOverlay, makePhotoClip, makeProject, makeSticker } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { EditorToolbar } from "../components/EditorToolbar";
import { closeStrip, openStrip, useToolStrip } from "../toolStrip";

const renderBar = () => render(<EditorToolbar panelFor={null} onPanelChange={() => {}} />);
const st = () => useEditorStore.getState();
const btn = (name: string) => screen.getByRole("button", { name });
const gone = (name: string) => expect(screen.queryByRole("button", { name })).toBeNull();
/** Every button on screen, in order (with nothing open: the back arrow, then the bar's tools). */
const row = () => screen.getAllByRole("button").map((b) => b.props.accessibilityLabel as string);
/** Closes whatever tool is open: a strip's ✓ or a modal sheet's scrim. */
const closeTool = async () => { await fireEvent.press(screen.queryByRole("button", { name: "Done" }) ?? screen.getByLabelText("Close sheet")); };
const BACK = "Back to main tools";
const MAIN = ["Edit", "Audio", "Text", "Stickers", "Overlay", "Effects", "Filter", "Adjust", "Ratio", "Background", "Cover", "Templates"];
const CLIP = ["Split", "Trim", "Select", "Speed", "Volume", "Animate", "Filter", "Adjust", "Background", "Templates", "Crop", "Transform", "Opacity", "Mask", "Green screen", "Keyframe", "Transition", "Replace", "Reverse", "Freeze", "Duplicate", "Delete"];
const TEXT = ["Edit", "Animate", "Keyframe", "Duplicate", "Delete", "Add text"];
const SOUND = ["Volume", "Fade", "Duplicate", "Delete", "Add audio", "Ducking", "Beats"];

beforeEach(() => {
  closeStrip();
  st().reset();
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 4 })] }));
});

describe("bars", () => {
  const full = () => st().setProject(makeProject({
    clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 4 })],
    overlays: [makeOverlay({ id: "t1", start: 1, end: 3 }), makeSticker({ id: "s1", start: 1, end: 3 }), makeOverlay({ id: "c1", kind: "caption", start: 1, end: 3 })],
    effects: [makeEffect({ id: "e1", type: "glow", start: 1, end: 3 })],
    audioTracks: [makeAudioTrack({ id: "m1", sourceDuration: 5 })],
  }));

  test("nothing selected: the main bar, no tabs, no back arrow", async () => {
    await renderBar();
    expect(row()).toEqual(MAIN);
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
  });

  test("the bar follows the selection", async () => {
    full();
    await renderBar();
    await act(() => { st().select("a"); });
    expect(row()).toEqual([BACK, ...CLIP]);
    await act(() => { st().selectOverlay("t1"); });
    expect(row()).toEqual([BACK, ...TEXT]);
    await act(() => { st().selectOverlay("c1"); });
    expect(row()).toEqual([BACK, "Edit", "Captions", "Duplicate", "Delete", "Add text"]);
    await act(() => { st().selectOverlay("s1"); });
    expect(row()).toEqual([BACK, "Edit", "Animate", "Keyframe", "Duplicate", "Delete"]);
    await act(() => { st().selectAudio("m1"); });
    expect(row()).toEqual([BACK, ...SOUND]);
    await act(() => { st().selectEffect("e1"); });
    expect(row()).toEqual([BACK, "Strength", "Duplicate", "Delete"]);
    await act(() => { st().selectEffect(null); });
    expect(row()).toEqual(MAIN);
  });

  test("the back arrow clears the selection and shows the main bar", async () => {
    full();
    await renderBar();
    for (const pick of [() => st().select("a"), () => st().selectOverlay("t1"), () => st().selectAudio("m1"), () => st().selectEffect("e1")]) {
      await act(() => { pick(); });
      await fireEvent.press(btn(BACK));
      expect(st()).toMatchObject({ selectedClipId: null, selectedOverlayId: null, selectedEffectId: null, selectedAudioId: null });
      expect(row()).toEqual(MAIN);
    }
    expect(st().past).toHaveLength(0);
  });

  test("no button is rendered disabled, except Keyframe off its item", async () => {
    full();
    await renderBar();
    const disabled = () => screen.getAllByRole("button").filter((b) => b.props.accessibilityState?.disabled).map((b) => b.props.accessibilityLabel);
    expect(disabled()).toEqual([]);
    await act(() => { st().select("a"); st().seek(1); });
    expect(disabled()).toEqual([]);
    await act(() => { st().seek(6); });                 // the playhead is on b
    expect(disabled()).toEqual(["Keyframe"]);
    await act(() => { st().selectOverlay("t1"); st().seek(2); });
    expect(disabled()).toEqual([]);
    await act(() => { st().selectAudio("m1"); });
    expect(disabled()).toEqual([]);
  });

  test("tools that do not apply are not there: a photo, the last clip, one clip, an empty project", async () => {
    st().setProject(makeProject({ clips: [makePhotoClip({ id: "p" }), makeClip({ id: "z", sourceDuration: 4 })] }));
    await renderBar();
    await act(() => { st().select("p"); });
    for (const l of ["Speed", "Volume", "Reverse", "Freeze"]) gone(l);
    expect(btn("Transition")).toBeEnabled();
    await act(() => { st().select("z"); });
    gone("Transition");
    expect(btn("Speed")).toBeEnabled();
    await act(() => { st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 })] })); st().select("a"); });
    gone("Select");
    await act(() => { st().setProject(makeProject()); });
    expect(row()).toEqual(["Audio", "Effects", "Ratio"]);
  });

  test("the bottom area has an explicit height and does not lift while the bar shows", async () => {
    await renderBar();
    expect(screen.getByTestId("editor-toolbar")).toHaveStyle({ height: BAR_HEIGHT + 8, marginTop: 0 });
    await act(() => { st().select("a"); });
    expect(screen.getByTestId("editor-toolbar")).toHaveStyle({ height: BAR_HEIGHT + 8, marginTop: 0 });
  });
});

describe("main bar entries", () => {
  test("Edit selects the clip under the playhead without seeking or an undo step", async () => {
    await renderBar();
    await act(() => { st().seek(5); });
    await fireEvent.press(btn("Edit"));
    expect(st()).toMatchObject({ selectedClipId: "b", playhead: 5 });
    expect(st().past).toHaveLength(0);
    expect(row()[1]).toBe("Split");
  });

  test("Edit past the end of the video selects the last clip", async () => {
    await renderBar();
    await act(() => { st().seek(8); });
    await fireEvent.press(btn("Edit"));
    expect(st().selectedClipId).toBe("b");
  });

  test("Audio opens the audio bar without a selection: Add audio, Ducking, Beats; back returns", async () => {
    await renderBar();
    await fireEvent.press(btn("Audio"));
    expect(row()).toEqual([BACK, "Add audio", "Ducking", "Beats"]);
    await fireEvent.press(btn("Ducking"));
    expect(st().project?.ducking).toBe(true);
    expect(btn("Ducking")).toBeSelected();
    await fireEvent.press(btn("Beats"));
    expect(screen.getByRole("header", { name: "Beat markers" })).toBeTruthy();
    await closeTool();
    await fireEvent.press(btn(BACK));
    expect(row()).toEqual(MAIN);
  });

  test("Add audio on the audio bar opens the Add audio sheet", async () => {
    await renderBar();
    await fireEvent.press(btn("Audio"));
    expect(screen.queryByRole("header", { name: "Add audio" })).toBeNull();
    await fireEvent.press(btn("Add audio"));
    expect(screen.getByRole("header", { name: "Add audio" })).toBeTruthy();
  });

  test("Text opens the text bar without a selection; Add text adds, selects and asks for the panel", async () => {
    const onPanelChange = jest.fn();
    await render(<EditorToolbar panelFor={null} onPanelChange={onPanelChange} />);
    await fireEvent.press(btn("Text"));
    expect(row()).toEqual([BACK, "Add text", "Captions"]);
    await fireEvent.press(btn("Add text"));
    const added = st().project!.overlays[0];
    expect(st().selectedOverlayId).toBe(added.id);
    expect(onPanelChange).toHaveBeenCalledWith({ id: added.id, kind: "text" });
    expect(row()).toEqual([BACK, ...TEXT]);
  });

  test("Add text with a text or a caption selected is one tap: it adds another, selects it and asks for the panel", async () => {
    st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 })], overlays: [makeOverlay({ id: "t1", start: 1, end: 3 }), makeOverlay({ id: "c1", kind: "caption", start: 1, end: 3 })] }));
    const onPanelChange = jest.fn();
    await render(<EditorToolbar panelFor={null} onPanelChange={onPanelChange} />);
    for (const [from, count] of [["t1", 3], ["c1", 4]] as const) {
      await act(() => { st().selectOverlay(from); });
      await fireEvent.press(btn("Add text"));
      expect(st().project!.overlays).toHaveLength(count);
      const added = st().project!.overlays.find((o) => o.id === st().selectedOverlayId)!;
      expect(added).toMatchObject({ kind: "text", text: "Your text" });
      expect(onPanelChange).toHaveBeenLastCalledWith({ id: added.id, kind: "text" });
    }
    expect(st().past).toHaveLength(2);
  });

  test("the Audio / Text section does not survive an emptied project", async () => {
    await renderBar();
    for (const [entry, first] of [["Text", "Add text"], ["Audio", "Add audio"]] as const) {
      await fireEvent.press(btn(entry));
      expect(row()[1]).toBe(first);
      await act(() => { st().apply((p) => ({ ...p, clips: [] })); });
      expect(row()).toEqual(["Audio", "Effects", "Ratio"]);
      await act(() => { st().undo(); });
      expect(row()).toEqual(MAIN);
    }
  });

  test("on an empty project Audio still opens its bar, without Beats", async () => {
    st().setProject(makeProject());
    await renderBar();
    await fireEvent.press(btn("Audio"));
    expect(row()).toEqual([BACK, "Add audio", "Ducking"]);
  });

  test("Background on the clip bar opens for the selected clip, not the one under the playhead", async () => {
    await renderBar();
    await act(() => { st().select("a"); st().seek(5); });               // the playhead is on b
    await fireEvent.press(btn("Background"));
    expect(st().selectedClipId).toBe("a");
    expect(useToolStrip.getState().open).toMatchObject({ id: "background", key: "clip:a" });
    const before = st().project!.clips[1].background;
    await fireEvent.press(btn("Blur"));
    expect(st().project!.clips[0].background).not.toEqual(before);
    expect(st().project!.clips[1].background).toEqual(before);
  });

  test("Templates on the clip bar offers This clip; on the main bar it cannot", async () => {
    await renderBar();
    await fireEvent.press(btn("Templates"));
    expect(btn("This clip")).toBeDisabled();
    await closeTool();
    await act(() => { st().select("b"); });
    await fireEvent.press(btn("Templates"));
    expect(btn("Random template")).toBeTruthy();
    expect(btn("This clip")).toBeEnabled();
  });

  test("Captions on the text bar opens the Captions sheet", async () => {
    await renderBar();
    await fireEvent.press(btn("Text"));
    expect(screen.queryByRole("header", { name: "Captions" })).toBeNull();
    await fireEvent.press(btn("Captions"));
    expect(screen.getByRole("header", { name: "Captions" })).toBeTruthy();
  });

  test("a section is left when something is selected, and does not come back", async () => {
    await renderBar();
    await fireEvent.press(btn("Audio"));
    await act(() => { st().select("a"); });
    expect(row()[1]).toBe("Split");
    await act(() => { st().select(null); });
    expect(row()).toEqual(MAIN);
  });

  test("Filter, Adjust and Background act on the clip under the playhead: it is selected, then the tool opens on it", async () => {
    for (const [tool, probe] of [["Filter", "Warm"], ["Adjust", "Brightness"], ["Background", "Blur"]] as const) {
      await act(() => { closeStrip(); st().select(null); st().seek(5); });
      const view = await renderBar();
      await fireEvent.press(btn(tool));
      expect(st().selectedClipId).toBe("b");
      expect(useToolStrip.getState().open).toMatchObject({ id: tool.toLowerCase(), key: "clip:b" });
      expect(btn(probe)).toBeTruthy();
      await view.unmount();
    }
  });

  test("Stickers, Effects, Cover and Templates open today's sheets; Ratio opens the ratio tool", async () => {
    await renderBar();
    await fireEvent.press(btn("Stickers"));
    expect(screen.getByRole("header", { name: "Sticker" })).toBeTruthy();       // the sheet keeps its own title
    await closeTool();
    await fireEvent.press(btn("Effects"));
    expect(screen.getByRole("header", { name: "Effects" })).toBeTruthy();
    await closeTool();
    await fireEvent.press(btn("Cover"));
    expect(screen.getByRole("header", { name: "Cover" })).toBeTruthy();
    await closeTool();
    await fireEvent.press(btn("Templates"));
    expect(btn("Random template")).toBeTruthy();
    await closeTool();
    await fireEvent.press(btn("Ratio"));
    expect(useToolStrip.getState().open).toMatchObject({ id: "ratio", key: "none" });
    await fireEvent.press(btn("1:1"));
    expect(st().project?.aspectRatio).toBe("1:1");
    expect(useToolStrip.getState().open).toBeNull();
  });
});

describe("text and sticker bars", () => {
  const withOverlays = () => st().setProject(makeProject({
    clips: [makeClip({ id: "a", sourceDuration: 4 })],
    overlays: [makeOverlay({ id: "t1", start: 1, end: 3 }), makeSticker({ id: "s1", start: 1, end: 3 }), makeOverlay({ id: "c1", kind: "caption", start: 1, end: 3 })],
  }));

  test("Edit asks for the text panel (a text, a caption) or the sticker panel (a sticker)", async () => {
    withOverlays();
    const onPanelChange = jest.fn();
    await render(<EditorToolbar panelFor={null} onPanelChange={onPanelChange} />);
    for (const [id, kind] of [["t1", "text"], ["c1", "text"], ["s1", "sticker"]] as const) {
      await act(() => { st().selectOverlay(id); });
      await fireEvent.press(btn("Edit"));
      expect(onPanelChange).toHaveBeenLastCalledWith({ id, kind });
    }
  });

  test("Duplicate copies the overlay in one undo step and selects the copy; Delete removes it and the main bar shows", async () => {
    withOverlays();
    await renderBar();
    await act(() => { st().selectOverlay("t1"); });
    await fireEvent.press(btn("Duplicate"));
    const list = st().project!.overlays;
    expect(list).toHaveLength(4);
    expect(st().selectedOverlayId).toBe(list[1].id);
    expect(st().past).toHaveLength(1);
    await fireEvent.press(btn("Delete"));
    expect(st().project!.overlays).toHaveLength(3);
    expect(st().past).toHaveLength(2);
    expect(st().selectedOverlayId).toBeNull();
    expect(row()).toEqual(MAIN);
  });

  test("Duplicate buzzes only when the overlay was copied", async () => {
    withOverlays();
    const buzz = jest.spyOn(haptics, "haptic");
    await renderBar();
    await act(() => { st().selectOverlay("t1"); });
    const refused = jest.spyOn(ops, "duplicateOverlay").mockImplementationOnce((p) => p);
    await fireEvent.press(btn("Duplicate"));
    expect(refused).toHaveBeenCalled();
    expect(buzz).not.toHaveBeenCalled();
    expect(st().past).toHaveLength(0);
    expect(st().selectedOverlayId).toBe("t1");
    await fireEvent.press(btn("Duplicate"));
    expect(buzz).toHaveBeenCalledWith("light");
    expect(st().past).toHaveLength(1);
    buzz.mockRestore(); refused.mockRestore();
  });

  test("Animate opens the overlay animation for a text and the clip animation for a clip", async () => {
    withOverlays();
    await renderBar();
    await act(() => { st().selectOverlay("t1"); });
    await fireEvent.press(btn("Animate"));
    expect(useToolStrip.getState().open?.id).toBe("overlayAnimation");
    expect(btn("Loop")).toBeTruthy();
    await closeTool();
    await act(() => { st().select("a"); });
    await fireEvent.press(btn("Animate"));
    expect(useToolStrip.getState().open?.id).toBe("clipAnimation");
    expect(btn("Combo")).toBeTruthy();
  });
});

describe("strips and the bar", () => {
  test("while a strip shows the bar is hidden and the bottom area is taller and lifted; Done brings the bar back", async () => {
    await renderBar();
    await act(() => { st().select("a"); });
    await fireEvent.press(btn("Opacity"));
    expect(screen.getByRole("header", { name: "Opacity" })).toBeTruthy();
    expect(screen.queryByTestId("toolbar-row")).toBeNull();
    gone("Split"); gone(BACK);
    expect(screen.getByTestId("editor-toolbar")).toHaveStyle({ height: STRIP.height + 8, marginTop: -STRIP.lift });
    await fireEvent.press(btn("Done"));
    expect(row()).toEqual([BACK, ...CLIP]);
    expect(screen.getByTestId("editor-toolbar")).toHaveStyle({ height: BAR_HEIGHT + 8, marginTop: 0 });
    expect(st().past).toHaveLength(0);
  });

  test("selecting another clip, clearing the selection or deleting the item closes the strip", async () => {
    await renderBar();
    for (const change of [() => st().select("b"), () => st().select(null), () => st().apply((p) => deleteClip(p, "a"))]) {
      await act(() => { st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 4 })] })); st().select("a"); });
      await fireEvent.press(btn("Opacity"));
      expect(screen.getByTestId("tool-strip")).toBeTruthy();
      await act(() => { change(); });
      expect(screen.queryByTestId("tool-strip")).toBeNull();
      expect(screen.getByTestId("toolbar-row")).toBeTruthy();
    }
  });

  test("Transition on the clip bar opens for the selected clip's cut", async () => {
    await renderBar();
    await act(() => { st().select("a"); });
    await fireEvent.press(btn("Transition"));
    expect(useToolStrip.getState().open).toEqual({ id: "transition", key: "clip:a" });
    expect(btn("Dissolve")).toBeTruthy();
  });

  test("the Transition strip follows its clip: after a reorder (and its undo) a pick lands on the selected clip's cut", async () => {
    st().setProject(makeProject({ clips: ["a", "b", "c"].map((id) => makeClip({ id, sourceDuration: 4 })) }));
    await renderBar();
    await act(() => { st().select("a"); });
    await fireEvent.press(btn("Transition"));
    await act(() => { st().apply((p) => moveClip(p, "a", 1)); });         // b, a, c
    expect(st().project!.clips.map((c) => c.id)).toEqual(["b", "a", "c"]);
    expect(useToolStrip.getState().open?.id).toBe("transition");
    await fireEvent.press(btn("Dissolve"));
    expect(st().project!.clips.map((c) => c.transitionOut.type)).toEqual(["none", "dissolve", "none"]);
    await act(() => { st().undo(); st().undo(); });                       // a, b, c again, nothing set
    expect(st().project!.clips.map((c) => c.id)).toEqual(["a", "b", "c"]);
    await fireEvent.press(btn("Dissolve"));
    expect(st().project!.clips.map((c) => c.transitionOut.type)).toEqual(["dissolve", "none", "none"]);
  });

  test("the Transition strip closes when its clip becomes the last one", async () => {
    st().setProject(makeProject({ clips: ["a", "b", "c"].map((id) => makeClip({ id, sourceDuration: 4 })) }));
    await renderBar();
    await act(() => { st().select("b"); });
    await fireEvent.press(btn("Transition"));
    expect(screen.getByTestId("tool-strip")).toBeTruthy();
    await act(() => { st().apply((p) => moveClip(p, "b", 2)); });
    expect(useToolStrip.getState().open).toBeNull();
    expect(screen.queryByTestId("tool-strip")).toBeNull();
    expect(row()).not.toContain("Transition");
  });

  test("the bar is one horizontally scrolling row that starts again from the left when the bar changes", async () => {
    await renderBar();
    const scroller = () => screen.getByTestId("toolbar-scroll");
    const main = scroller();
    await act(() => { st().seek(1); });                                  // a re-render of the same bar keeps the scroller (and its offset)
    expect(scroller()).toBe(main);
    await act(() => { st().select("a"); });
    const clip = scroller();
    expect(clip).not.toBe(main);                                         // another bar: a fresh scroller, at the start
    await act(() => { st().select("b"); });
    expect(scroller()).toBe(clip);
  });
});

test("Templates is enabled without a selection when the project has clips and opens the sheet", async () => {
  await renderBar();
  expect(btn("Templates")).toBeEnabled();
  await fireEvent.press(btn("Templates"));
  expect(btn("Random template")).toBeTruthy();
});

test("Split cuts at the playhead; Duplicate and Delete act on the selection", async () => {
  await renderBar();
  await act(() => { st().select("a"); st().seek(1.5); });
  await fireEvent.press(btn("Split"));
  expect(st().project?.clips).toHaveLength(3);
  await fireEvent.press(btn("Duplicate"));
  expect(st().project?.clips).toHaveLength(4);
  await fireEvent.press(btn("Delete"));
  expect(st().project?.clips).toHaveLength(3);
  expect(st().selectedClipId).toBeNull();
});

test("Text adds an overlay at the playhead and selects it", async () => {
  await renderBar();
  st().seek(2);
  await fireEvent.press(btn("Text"));
  await fireEvent.press(btn("Add text"));
  const ovs = st().project!.overlays;
  expect(ovs).toHaveLength(1);
  expect(ovs[0]).toMatchObject({ start: 2, end: 5, text: "Your text" });
  expect(st().selectedOverlayId).toBe(ovs[0].id);
});

test("Volume is enabled after selecting a clip", async () => {
  await renderBar();
  gone("Volume");
  await act(() => { st().select("a"); });
  expect(btn("Volume")).toBeEnabled();
});

test("Freeze is enabled for a selected video clip", async () => {
  await renderBar();
  await act(() => { st().select("a"); });
  expect(btn("Freeze")).toBeEnabled();
});

test("pressing Freeze runs the freeze capture for the selected clip", async () => {
  const VT = jest.requireMock("expo-video-thumbnails") as { getThumbnailAsync: jest.Mock };
  VT.getThumbnailAsync.mockClear();
  VT.getThumbnailAsync.mockResolvedValueOnce({ uri: "file:///tmp/f.jpg" });
  (storage as unknown as { saveStill: jest.Mock }).saveStill.mockResolvedValueOnce({ uri: "file:///p/media/s.jpg" });
  await renderBar();
  await act(() => { st().select("a"); st().seek(1); });
  await fireEvent.press(btn("Freeze"));
  await waitFor(() => expect(VT.getThumbnailAsync).toHaveBeenCalledWith(expect.any(String), { time: 1000, quality: 1 }));
  await waitFor(() => expect(st().project!.clips).toHaveLength(4));
});

test("a photo selection has no Reverse, Freeze, Speed or Volume but keeps Transform", async () => {
  st().setProject(makeProject({ clips: [makePhotoClip({ id: "p" }), makeClip({ id: "a", sourceDuration: 4 })] }));
  await renderBar();
  await act(() => { st().select("p"); });
  gone("Reverse");
  gone("Freeze");
  gone("Speed");
  gone("Volume");
  expect(btn("Transform")).toBeEnabled();
});

test("Reverse toggles the clip and shows active; one undo step each", async () => {
  await renderBar();
  await act(() => { st().select("a"); });
  await fireEvent.press(btn("Reverse"));
  expect(st().project!.clips[0].reversed).toBe(true);
  expect(btn("Reverse")).toBeSelected();
  await fireEvent.press(btn("Reverse"));
  expect(st().project!.clips[0].reversed).toBe(false);
  await act(() => { st().undo(); });
  expect(st().project!.clips[0].reversed).toBe(true);
});

test("Transform opens its sheet", async () => {
  await renderBar();
  await act(() => { st().select("a"); });
  await fireEvent.press(btn("Transform"));
  expect(btn("Rotate 90°")).toBeTruthy();
});

const pick = pickMedia as jest.Mock;
const importMedia = storage.importMedia as jest.Mock;
const videoAsset = { uri: "file:///new.mov", kind: "video" as const, durationSec: 9, width: 1920, height: 1080 };

describe("Replace", () => {
  beforeEach(() => { pick.mockReset(); importMedia.mockReset(); useToast.getState().clear(); });

  test("is enabled for a photo selection too", async () => {
    st().setProject(makeProject({ clips: [makePhotoClip({ id: "p" })] }));
    await renderBar();
    await act(() => { st().select("p"); });
    expect(btn("Replace")).toBeEnabled();
  });

  test("swaps the selected clip's media in one undo step and keeps it selected", async () => {
    pick.mockResolvedValueOnce([videoAsset]);
    importMedia.mockResolvedValueOnce({ clips: [makeClip({ id: "imported", sourceDuration: 9, sourceUri: "file:///p1/media/imported.mov", width: 1920, height: 1080 })], failed: 0 });
    await renderBar();
    await act(() => { st().select("a"); });
    await fireEvent.press(btn("Replace"));
    await waitFor(() => expect(st().project!.clips[0].sourceUri).toBe("file:///p1/media/imported.mov"));
    expect(pick).toHaveBeenCalledWith({ multiple: false });
    expect(importMedia).toHaveBeenCalledWith("p1", [videoAsset]);
    const s = st();
    expect(s.project!.clips[0]).toMatchObject({ id: "a", sourceDuration: 9, trimStart: 0, trimEnd: 4, width: 1920 });
    expect(s.selectedClipId).toBe("a");
    expect(s.past).toHaveLength(1);
  });

  test("a cancelled pick changes nothing", async () => {
    pick.mockResolvedValueOnce(null);
    await renderBar();
    await act(() => { st().select("a"); });
    await fireEvent.press(btn("Replace"));
    await waitFor(() => expect(pick).toHaveBeenCalled());
    expect(importMedia).not.toHaveBeenCalled();
    expect(st().past).toHaveLength(0);
    expect(useToast.getState().message).toBeNull();
  });

  test("a failed import toasts and changes nothing", async () => {
    pick.mockResolvedValueOnce([videoAsset]);
    importMedia.mockResolvedValueOnce({ clips: [], failed: 1 });
    await renderBar();
    await act(() => { st().select("a"); });
    await fireEvent.press(btn("Replace"));
    await waitFor(() => expect(useToast.getState().message).toBe("Couldn't replace the clip."));
    expect(st().past).toHaveLength(0);
  });

  test("a video too short to be a clip is refused with a toast", async () => {
    pick.mockResolvedValueOnce([videoAsset]);
    importMedia.mockResolvedValueOnce({ clips: [makeClip({ id: "imported", sourceDuration: 0.05 })], failed: 0 });
    await renderBar();
    await act(() => { st().select("a"); });
    await fireEvent.press(btn("Replace"));
    await waitFor(() => expect(useToast.getState().message).toBe("That video is too short."));
    expect(st().past).toHaveLength(0);
    expect(st().project!.clips[0].sourceUri).toBe("file:///media/a.mp4");
  });

  test("Replace is disabled while the pick runs, and enabled again after it", async () => {
    let finish: (v: null) => void = () => {};
    pick.mockReturnValueOnce(new Promise<null>((resolve) => { finish = resolve; }));
    await renderBar();
    await act(() => { st().select("a"); });
    await fireEvent.press(btn("Replace"));
    expect(btn("Replace")).toBeDisabled();
    await act(async () => { finish(null); });
    await waitFor(() => expect(btn("Replace")).toBeEnabled());
  });
});

test("a reversed clip has no Volume (the export is silent)", async () => {
  st().setProject(makeProject({ clips: [makeClip({ id: "r", sourceDuration: 4, reversed: true }), makeClip({ id: "a", sourceDuration: 4 })] }));
  await renderBar();
  await act(() => { st().select("r"); });
  gone("Volume");
  await act(() => { st().select("a"); });
  expect(btn("Volume")).toBeEnabled();
});

test("Adjust opens the sheet for a selected clip", async () => {
  await renderBar();
  await act(() => { st().select("a"); });
  expect(btn("Adjust")).toBeEnabled();
  await fireEvent.press(btn("Adjust"));
  expect(btn("Reset")).toBeTruthy();
});

describe("Effects on the timeline", () => {
  const withEffect = () => st().setProject(makeProject({
    clips: [makeClip({ id: "a", sourceDuration: 10 })],
    effects: [makeEffect({ id: "e1", type: "glow", start: 1, end: 3 })],
  }));
  const effects = () => st().project!.effects;

  test("Effects is enabled whenever a project is open, even an empty one, and opens the Effects sheet", async () => {
    st().setProject(makeProject());
    await renderBar();
    expect(btn("Effects")).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Glitch" })).toBeNull();
    await fireEvent.press(btn("Effects"));
    expect(btn("Glitch")).toBeTruthy();
  });

  test("adding from the sheet selects the effect, closes the sheet and shows the effect bar", async () => {
    await renderBar();
    await fireEvent.press(btn("Effects"));
    await fireEvent.press(btn("Glitch"));
    expect(effects()).toHaveLength(1);
    expect(st().selectedEffectId).toBe(effects()[0].id);
    expect(screen.queryByRole("button", { name: "Glitch" })).toBeNull();
    expect(btn("Strength")).toBeEnabled();
    expect(row()).toEqual([BACK, "Strength", "Duplicate", "Delete"]);
  });

  test("Strength opens the strength sheet for the selected effect", async () => {
    withEffect();
    await renderBar();
    await act(() => { st().selectEffect("e1"); });
    expect(screen.queryByTestId("effect-strength")).toBeNull();
    await fireEvent.press(btn("Strength"));
    expect(screen.getByTestId("effect-strength")).toBeTruthy();
    expect(screen.getByText("Strength 70")).toBeTruthy();
  });

  test("Duplicate copies the effect in one undo step, selects the copy and keeps the effect bar", async () => {
    withEffect();
    await renderBar();
    await act(() => { st().selectEffect("e1"); });
    await fireEvent.press(btn("Duplicate"));
    expect(effects()).toMatchObject([{ id: "e1", start: 1, end: 3 }, { id: "dup", type: "glow", start: 3, end: 5 }]);
    expect(st().past).toHaveLength(1);
    expect(st().selectedEffectId).toBe("dup");
    expect(st().project!.clips).toHaveLength(1);
    expect(row()).toEqual([BACK, "Strength", "Duplicate", "Delete"]);
  });

  test("Delete removes the effect in one undo step, clears the selection and shows the main bar", async () => {
    withEffect();
    await renderBar();
    await act(() => { st().selectEffect("e1"); });
    await fireEvent.press(btn("Delete"));
    expect(effects()).toEqual([]);
    expect(st().project!.clips).toHaveLength(1);
    expect(st().selectedEffectId).toBeNull();
    expect(st().past).toHaveLength(1);
    expect(row()).toEqual(MAIN);
  });
});

describe("Audio tools", () => {
  const withAudio = (count = 2) => st().setProject(makeProject({
    clips: [makeClip({ id: "a", sourceDuration: 10 })],
    audioTracks: Array.from({ length: count }, (_, i) => makeAudioTrack({ id: `t${i + 1}`, sourceDuration: 4, start: i, volume: 1.2 })),
  }));
  const tracks = () => st().project!.audioTracks;
  const past = () => st().past.length;
  const TRACK = [BACK, ...SOUND];
  beforeEach(() => { useToast.getState().clear(); });

  test("Beats opens the beat markers sheet, whose Tap adds a marker at the playhead", async () => {
    await renderBar();
    await fireEvent.press(btn("Audio"));
    expect(btn("Beats")).toBeEnabled();
    expect(screen.queryByRole("header", { name: "Beat markers" })).toBeNull();
    await fireEvent.press(btn("Beats"));
    expect(screen.getByRole("header", { name: "Beat markers" })).toBeTruthy();
    await act(() => { st().seek(2); });
    await fireEvent.press(btn("Tap"));
    expect(st().project!.beatMarkers).toEqual([2]);
    expect(past()).toBe(1);
  });

  test("Ducking toggles the project's ducking in one undo step each and shows active", async () => {
    await renderBar();
    await fireEvent.press(btn("Audio"));
    expect(btn("Ducking")).not.toBeSelected();
    await fireEvent.press(btn("Ducking"));
    expect(st().project!.ducking).toBe(true);
    expect(btn("Ducking")).toBeSelected();
    expect(past()).toBe(1);
    await fireEvent.press(btn("Ducking"));
    expect(st().project!.ducking).toBe(false);
    expect(btn("Ducking")).not.toBeSelected();
    expect(past()).toBe(2);
  });

  test("with a track selected, Ducking and Beats are one tap away and keep it selected", async () => {
    withAudio();
    await renderBar();
    await act(() => { st().selectAudio("t1"); });
    await fireEvent.press(btn("Ducking"));
    expect(st().project!.ducking).toBe(true);
    expect(btn("Ducking")).toBeSelected();
    await fireEvent.press(btn("Beats"));
    expect(screen.getByRole("header", { name: "Beat markers" })).toBeTruthy();
    expect(st().selectedAudioId).toBe("t1");
  });

  test("with a track selected, Add audio opens the sheet without deselecting", async () => {
    withAudio();
    await renderBar();
    await act(() => { st().selectAudio("t1"); });
    expect(screen.queryByRole("header", { name: "Add audio" })).toBeNull();
    await fireEvent.press(btn("Add audio"));
    expect(screen.getByRole("header", { name: "Add audio" })).toBeTruthy();
    expect(st().selectedAudioId).toBe("t1");
  });

  test("Volume opens the selected track's volume sheet, Fade its fade sheet", async () => {
    withAudio();
    await renderBar();
    await act(() => { st().selectAudio("t2"); });
    expect(screen.queryByTestId("audio-volume")).toBeNull();
    await fireEvent.press(btn("Volume"));
    expect(screen.getByTestId("audio-volume")).toBeTruthy();
    expect(screen.getByText("Volume 120 %")).toBeTruthy();
    expect(screen.queryByTestId("volume-slider")).toBeNull();
    await fireEvent(screen.getByTestId("audio-volume"), "valueChange", 0.4);
    expect(tracks().map((t) => t.volume)).toEqual([1.2, 0.4]);
    await closeTool();
    await fireEvent.press(btn("Fade"));
    expect(screen.getByTestId("fade-in").props.maximumValue).toBe(2);
    await fireEvent(screen.getByTestId("fade-in"), "valueChange", 1);
    expect(tracks().map((t) => t.fadeIn)).toEqual([0, 1]);
  });

  test("Duplicate copies the track in one undo step and selects the copy", async () => {
    withAudio();
    await renderBar();
    await act(() => { st().selectAudio("t1"); });
    await fireEvent.press(btn("Duplicate"));
    expect(tracks().map((t) => t.id)).toEqual(["t1", "dup", "t2"]);
    expect(past()).toBe(1);
    expect(st().selectedAudioId).toBe("dup");
    expect(row()).toEqual(TRACK);
    expect(useToast.getState().message).toBeNull();
  });

  test("Duplicate at the track limit toasts and changes nothing", async () => {
    withAudio(AUDIO_LIMITS.maxTracks);
    await renderBar();
    await act(() => { st().selectAudio("t1"); });
    await fireEvent.press(btn("Duplicate"));
    expect(tracks()).toHaveLength(AUDIO_LIMITS.maxTracks);
    expect(past()).toBe(0);
    expect(st().selectedAudioId).toBe("t1");
    expect(useToast.getState().message).toBe("You've reached the audio track limit.");
  });

  test("Delete removes the track in one undo step, clears the selection and shows the main bar", async () => {
    withAudio();
    await renderBar();
    await act(() => { st().selectAudio("t1"); });
    await fireEvent.press(btn("Delete"));
    expect(tracks().map((t) => t.id)).toEqual(["t2"]);
    expect(past()).toBe(1);
    expect(st().selectedAudioId).toBeNull();
    expect(st().project!.clips).toHaveLength(1);
    expect(row()).toEqual(MAIN);
  });
});

describe("Animate and Keyframe", () => {
  const withOverlays = () => st().setProject(makeProject({
    clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 4 })],
    overlays: [makeOverlay({ id: "t1", start: 1, end: 3 }), makeSticker({ id: "s1", start: 1, end: 3 }), makeOverlay({ id: "c1", kind: "caption", start: 1, end: 3 })],
  }));
  const clipPins = (i = 0) => st().project!.clips[i].keyframes;
  const overlayPins = (id: string) => st().project!.overlays.find((o) => o.id === id)!.keyframes;
  const past = () => st().past.length;

  test("Edit: a selected clip enables Animate; Keyframe also needs the playhead on that clip", async () => {
    await renderBar();
    await act(() => { st().select("a"); st().seek(1); });
    expect(btn("Animate")).toBeEnabled();
    expect(btn("Keyframe")).toBeEnabled();
    await act(() => { st().seek(5); });
    expect(btn("Animate")).toBeEnabled();
    expect(btn("Keyframe")).toBeDisabled();
    await act(() => { st().select("b"); });
    expect(btn("Keyframe")).toBeEnabled();
  });

  test("Edit: Keyframe adds a pin then removes it, the diamond fills while on the pin, one undo step each", async () => {
    await renderBar();
    await act(() => { st().select("a"); st().seek(1); });
    expect(btn("Keyframe")).not.toBeSelected();
    await fireEvent.press(btn("Keyframe"));
    expect(clipPins()).toHaveLength(1);
    expect(clipPins()[0].t).toBeCloseTo(1);
    expect(past()).toBe(1);
    expect(btn("Keyframe")).toBeSelected();
    await act(() => { st().seek(2); });
    expect(btn("Keyframe")).not.toBeSelected();
    await act(() => { st().seek(1); });
    expect(btn("Keyframe")).toBeSelected();
    await fireEvent.press(btn("Keyframe"));
    expect(clipPins()).toHaveLength(0);
    expect(past()).toBe(2);
    expect(btn("Keyframe")).not.toBeSelected();
    await act(() => { st().undo(); });
    expect(clipPins()).toHaveLength(1);
  });

  test("Edit: Animate opens the clip animation sheet", async () => {
    await renderBar();
    await act(() => { st().select("a"); });
    expect(screen.queryByRole("button", { name: "Combo" })).toBeNull();
    await fireEvent.press(btn("Animate"));
    expect(btn("Combo")).toBeTruthy();
    await fireEvent.press(btn("Fade"));
    expect(st().project!.clips[0].animation.in).toEqual({ id: "fade", duration: 0.5 });
  });

  test("Text: a selected text enables both inside its range; Keyframe is off outside it", async () => {
    withOverlays();
    await renderBar();
    await act(() => { st().selectOverlay("t1"); st().seek(2); });
    expect(btn("Animate")).toBeEnabled();
    expect(btn("Keyframe")).toBeEnabled();
    await act(() => { st().seek(1); });
    expect(btn("Keyframe")).toBeEnabled();
    await act(() => { st().seek(3); });
    expect(btn("Keyframe")).toBeEnabled();
    await act(() => { st().seek(0.5); });
    expect(btn("Keyframe")).toBeDisabled();
    await act(() => { st().seek(5); });
    expect(btn("Keyframe")).toBeDisabled();
    expect(btn("Animate")).toBeEnabled();
  });

  test("Text: Keyframe toggles a pin on the text and Animate opens the overlay sheet", async () => {
    withOverlays();
    await renderBar();
    await act(() => { st().selectOverlay("t1"); st().seek(2); });
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
    expect(st().project!.overlays[0].animation.in).toEqual({ id: "pop", duration: 0.5 });
  });

  test("a caption selection has neither", async () => {
    withOverlays();
    await renderBar();
    await act(() => { st().selectOverlay("c1"); st().seek(2); });
    gone("Animate");
    gone("Keyframe");
  });

  test("Stickers: a selected sticker enables both and Keyframe pins the sticker", async () => {
    withOverlays();
    await renderBar();
    await act(() => { st().selectOverlay("s1"); st().seek(2); });
    expect(btn("Animate")).toBeEnabled();
    await fireEvent.press(btn("Keyframe"));
    expect(overlayPins("s1")).toHaveLength(1);
    expect(overlayPins("t1")).toHaveLength(0);
    await fireEvent.press(btn("Animate"));
    expect(btn("Loop")).toBeTruthy();
  });
});

describe("Select (multi-select)", () => {
  test("pressing Select replaces the toolbar with the action bar; Done brings the main bar back", async () => {
    await renderBar();
    await act(() => { st().select("a"); });
    await fireEvent.press(btn("Select"));
    expect(st()).toMatchObject({ multiSelect: ["a"], selectedClipId: null });
    expect(screen.getByRole("header", { name: "1 selected" })).toBeTruthy();
    expect(screen.queryByTestId("editor-toolbar")).toBeNull();
    for (const l of ["Delete", "Duplicate", "Filter", "Speed", "Volume", "Select all", "Done"]) expect(btn(l)).toBeTruthy();
    gone("Split");
    await fireEvent.press(btn("Done"));
    expect(st().multiSelect).toBeNull();
    expect(row()).toEqual(MAIN);
  });

  test("entering multi-select closes an open strip", async () => {
    await renderBar();
    await act(() => { st().select("a"); });
    await fireEvent.press(btn("Opacity"));
    await act(() => { st().enterMultiSelect(); });
    expect(useToolStrip.getState().open).toBeNull();
    expect(screen.getByRole("header", { name: "1 selected" })).toBeTruthy();   // the mode starts with the selected clip chosen
  });

  test("opening the Ratio strip in multi-select (the transport row's pill) leaves the mode and shows the strip", async () => {
    await renderBar();
    await act(() => { st().select("a"); st().enterMultiSelect(); });
    expect(screen.queryByTestId("editor-toolbar")).toBeNull();
    await act(() => { openStrip("ratio"); });
    expect(st().multiSelect).toBeNull();
    expect(useToolStrip.getState().open).toMatchObject({ id: "ratio", key: "none" });
    expect(screen.getByTestId("tool-strip")).toBeTruthy();
    await fireEvent.press(btn("1:1"));
    expect(st().project?.aspectRatio).toBe("1:1");
  });

  test("entering with clip a selected starts with it chosen", async () => {
    await renderBar();
    await act(() => { st().select("a"); });
    await fireEvent.press(btn("Select"));
    expect(screen.getByRole("header", { name: "1 selected" })).toBeTruthy();
    expect(st()).toMatchObject({ multiSelect: ["a"], selectedClipId: null });
  });
});
