import { StyleSheet } from "react-native";
import { act, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-10T10:00:00.000Z" }));
jest.mock("@/modules/clipy-video", () => ({ ...jest.requireActual("@/modules/clipy-video"), isSteadyAvailable: jest.fn(() => true) }));
import { isSteadyAvailable } from "@/modules/clipy-video";
import { useCutoutFiles } from "@/src/editor/cutoutFiles";
import { useFollowerShown } from "@/src/editor/followerShown";
import { setClipSpeedCurve } from "@/src/editor/model/ops";
import { DEFAULT_ADJUST, makeClip, makeEffect, makeLayer, makeProject, type Clip, type LayerClip, type Project } from "@/src/editor/model/types";
import { useSteadyFiles } from "@/src/editor/steadyFiles";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { TOOL_META } from "../toolGroups";
import { ClipGestures } from "../components/ClipGestures";
import { needsPreviewTag, previewReason, PreviewTag, REASON, steadyReason, tagReasonNow } from "../components/PreviewTag";

const st = () => useEditorStore.getState();
const one = (over: Partial<Clip>) => makeProject({ id: "p1", clips: [makeClip({ id: "a", sourceDuration: 4, sourceUri: "file:///media/a.mp4", ...over })] });
const withLayer = (over: Partial<LayerClip>, clip: Partial<Clip> = {}) =>
  makeProject({ clips: [makeClip({ id: "a", sourceDuration: 8, ...clip })], layers: [makeLayer({ id: "l", sourceDuration: 2, start: 2, ...over })] });
const small = { scale: 0.5, x: 0, y: 0, rotation: 0, flipH: false, flipV: false };
const chroma = { color: "#00FF00", similarity: 0.4, smoothness: 0.1, spill: 0.5 } as unknown as NonNullable<Clip["chroma"]>;

beforeEach(() => {
  st().reset();
  useCutoutFiles.setState({ files: {} }); useSteadyFiles.setState({ files: {} }); useFollowerShown.setState({ uri: null });
  jest.mocked(isSteadyAvailable).mockReturnValue(true);
});

describe("the reason, for each condition the tag has always checked (the fixtures of PreviewTag.test)", () => {
  const curved = setClipSpeedCurve(one({}), "a", "hero");
  const transition = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4, transitionOut: { type: "fade", duration: 1 } }), makeClip({ id: "b", sourceDuration: 4 })] });
  const effect = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 })], effects: [makeEffect({ id: "e", type: "glitch", start: 1, end: 2 })] });
  const table: [string, Project, number, string | null][] = [
    ["a plain clip", one({}), 1, null],
    ["a filter", one({ filter: "vintage" }), 1, "Filter"],
    ["a filter at strength 0", one({ filter: "vintage", filterIntensity: 0 }), 1, null],
    ["a reversed clip", one({ reversed: true }), 1, "Reversed"],
    ["a speed curve", curved, 1, "Speed curve"],
    ["a constant speed", one({ speed: 2 }), 1, null],
    ["inside a transition window", transition, 4.2, "Transition"],
    ["outside it", transition, 2, null],
    ["an Adjust value", one({ adjust: { ...DEFAULT_ADJUST, contrast: 0.2 } }), 1, "Adjust"],
    ["an effect over the playhead", effect, 1, "Effect"],
    ["an effect elsewhere", effect, 0.5, null],
    ["a filter on a layer", withLayer({ filter: "vintage" }), 3, "Filter"],
    ["an Adjust value on a layer", withLayer({ adjust: { ...DEFAULT_ADJUST, contrast: 0.2 } }), 3, "Adjust"],
    ["a reversed layer", withLayer({ reversed: true }), 3, "Reversed"],
    ["a speed curve on a layer", setClipSpeedCurve(withLayer({}), "l", "hero"), 2.5, "Speed curve"],
    ["a layer that is not on screen", withLayer({ filter: "vintage" }), 1, null],
    ["a green screen on the clip", one({ chroma }), 1, "Green screen"],
    ["a green screen on a layer", withLayer({ chroma }), 3, "Green screen"],
    ["a blend mode on a layer", withLayer({ blend: "screen" }), 3, "Blend"],
    ["a blur background that shows", one({ background: { type: "blur" }, width: 1920, height: 1080, transform: small }), 1, "Blur background"],
    ["a blur background the picture covers", one({ background: { type: "blur" } }), 1, null],
    ["a colour background", one({ background: { type: "color", color: "#FF0000" }, transform: small }), 1, null],
    ["an empty project", makeProject(), 0, null],
  ];
  test.each(table)("%s", (_name, project, playhead, reason) => {
    expect(previewReason(project, playhead)).toBe(reason);
    expect(needsPreviewTag(project, playhead)).toBe(reason !== null);     // the yes / no the preview asks is the same rule
  });

  test("when several apply, the first in the order of the checks is the one named", () => {
    expect(previewReason(one({ filter: "vintage", reversed: true, adjust: { ...DEFAULT_ADJUST, contrast: 0.2 } }), 1)).toBe("Filter");
    expect(previewReason(one({ filter: "vintage", filterIntensity: 0, reversed: true }), 1)).toBe("Reversed");
    expect(previewReason(setClipSpeedCurve(one({ adjust: { ...DEFAULT_ADJUST, contrast: 0.2 } }), "a", "hero"), 1)).toBe("Speed curve");
    expect(previewReason({ ...effect, clips: [makeClip({ id: "a", sourceDuration: 4, adjust: { ...DEFAULT_ADJUST, contrast: 0.2 } })] }, 1)).toBe("Adjust");
    expect(previewReason(withLayer({ filter: "vintage" }, { reversed: true }), 3)).toBe("Reversed");     // the clip before its layers
    expect(previewReason(withLayer({ blend: "screen", filter: "vintage" }), 3)).toBe("Filter");
    expect(previewReason(withLayer({ blend: "screen" }, { chroma }), 3)).toBe("Green screen");
  });

  test("the words are the tools' own names", () => {
    expect(REASON.filter).toBe(TOOL_META.filter.label);
    expect(REASON.adjust).toBe(TOOL_META.adjust.label);
    expect(REASON.transition).toBe(TOOL_META.transition.label);
    expect(REASON.blend).toBe(TOOL_META.blend.label);
    expect(REASON.chroma).toBe(TOOL_META.chroma.label);
    expect(REASON.stabilize).toBe(TOOL_META.stabilize.label);
    expect(REASON).toMatchObject({ reversed: "Reversed", curve: "Speed curve", effect: "Effect", blur: "Blur background", cutout: "Remove background", slow: "Slow motion" });
  });
});

describe("the copies", () => {
  test("Stabilize names itself; Smooth slow motion alone is Slow motion", () => {
    expect(steadyReason(one({ stabilize: "medium" }), 1, {})).toBe("Stabilize");
    expect(steadyReason(one({ smooth: true, speed: 0.5 }), 1, {})).toBe("Slow motion");
    expect(steadyReason(one({ stabilize: "low", smooth: true, speed: 0.5 }), 1, {})).toBe("Stabilize");
    expect(steadyReason(one({ smooth: true }), 1, {})).toBeNull();                // not slowed: the switch does not count
    expect(steadyReason(one({}), 1, {})).toBeNull();
  });
  test("what the tag says now: the frame's own reason first, then Remove background, then the steady copy; nothing when nothing applies", () => {
    st().setProject(one({}));
    expect(tagReasonNow(false)).toBeNull();
    st().setProject(one({ cutout: true }));
    expect(tagReasonNow(false)).toBe("Remove background");
    st().setProject(one({ cutout: true, filter: "vintage" }));
    expect(tagReasonNow(true)).toBe("Filter");
    st().setProject(one({ stabilize: "medium" }));
    expect(tagReasonNow(false)).toBe("Stabilize");
    jest.mocked(isSteadyAvailable).mockReturnValue(false);                        // a build without the tool: exported as previewed
    expect(tagReasonNow(false)).toBeNull();
    expect(tagReasonNow(true)).toBe("");                                          // asked to show with nothing to name: the bare tag
  });
});

describe("the tag on screen", () => {
  const words = () => screen.getByTestId("preview-tag-text").props.children;
  test("says Preview, a middle dot and the reason, behind a small info symbol, on the solid scrim", async () => {
    st().setProject(one({ filter: "vintage" })); st().seek(1);
    await render(<PreviewTag visible />);
    expect(words()).toBe("Preview · Filter");
    expect(screen.getByTestId("preview-tag")).toHaveStyle({ backgroundColor: theme.colors.scrimStrong, borderRadius: theme.radius.pill, flexDirection: "row" });
    expect(screen.getByTestId("preview-tag-info")).toHaveStyle({ color: theme.colors.accent });
    expect(screen.getByTestId("preview-tag-text")).toHaveStyle({ color: theme.colors.text, fontSize: theme.type.micro });
    expect(screen.getByTestId("preview-tag-text").props.numberOfLines).toBe(1);
  });
  test("it is not a button: it and everything in it take no touches", async () => {
    st().setProject(one({ reversed: true }));
    await render(<PreviewTag visible />);
    const tag = screen.getByTestId("preview-tag");
    expect(tag.props.pointerEvents).toBe("none");
    expect(tag.parent!.props.pointerEvents).toBe("none");
    expect(screen.queryByRole("button")).toBeNull();
    expect(tag.props.onPress).toBeUndefined();
  });
  test("one reason at a time: it changes with the frame and goes when nothing applies", async () => {
    const p = makeProject({ id: "p1", clips: [makeClip({ id: "a", sourceDuration: 4, reversed: true, filter: "vintage" }), makeClip({ id: "b", sourceDuration: 4, reversed: true }), makeClip({ id: "c", sourceDuration: 4 })] });
    st().setProject(p); st().seek(1);
    const Host = () => { const s = useEditorStore(); return <PreviewTag visible={!!s.project && needsPreviewTag(s.project, s.playhead)} />; };
    await render(<Host />);
    expect(words()).toBe("Preview · Filter");
    await act(() => { st().seek(5); });
    expect(words()).toBe("Preview · Reversed");
    await act(() => { st().seek(9); });
    expect(screen.queryByTestId("preview-tag")).toBeNull();
  });
  test("a copy that is not there yet is named too; shown with nothing to name, it says only Preview", async () => {
    st().setProject(one({ cutout: true })); st().seek(1);
    const view = await render(<PreviewTag visible={false} />);
    expect(words()).toBe("Preview · Remove background");
    await act(() => { st().setProject(one({ stabilize: "medium" })); });
    expect(words()).toBe("Preview · Stabilize");
    await act(() => { st().setProject(one({})); });
    expect(screen.queryByTestId("preview-tag")).toBeNull();
    await view.rerender(<PreviewTag visible />);
    expect(words()).toBe("Preview");
  });
});

describe("the corner squares of the selected clip in the preview", () => {
  const W = 270, H = 480;
  type Host = { props: { style?: unknown; pointerEvents?: string; gesture?: unknown }; parent: unknown };
  const corners = (): Host[] => { const frame = screen.queryByTestId("clip-selection-frame"); return frame ? (frame.children as unknown as Host[]) : []; };
  const at = (c: Host) => StyleSheet.flatten(c.props.style as object) as Record<string, number>;
  test("four white squares with a gold edge on the corners of the selection frame, inside it (so they turn with it), taking no touches", async () => {
    st().setProject(one({ transform: { ...small, rotation: 30 } })); st().select("a"); st().seek(1);
    await render(<ClipGestures frameW={W} frameH={H} />);
    const frame = screen.getByTestId("clip-selection-frame");
    expect(frame.props.pointerEvents).toBe("none");
    expect(StyleSheet.flatten(frame.props.style).transform).toEqual([{ rotate: "30deg" }]);
    expect(corners()).toHaveLength(4);
    for (const c of corners()) {
      expect(c.parent).toBe(frame);
      expect(c.props.pointerEvents).toBe("none");
      expect(at(c)).toMatchObject({ position: "absolute", width: 8, height: 8, backgroundColor: theme.colors.text, borderWidth: 1, borderColor: theme.colors.accent });
      expect(c.props.gesture).toBeUndefined();
    }
    // One on each corner, centred on the frame's line.
    const place = (c: Host) => (["left", "right", "top", "bottom"] as const).filter((k) => at(c)[k] === -4.5).join(" ");
    expect(corners().map(place)).toEqual(["left top", "right top", "left bottom", "right bottom"]);
    // The gestures are where they were: on the area under the frame, not on the frame or its corners.
    expect(screen.getByTestId("clip-gesture-area").props.gesture).toBeDefined();
    expect(frame.props.gesture).toBeUndefined();
  });
  test("a selected layer gets them too; nothing selected, none", async () => {
    st().setProject(withLayer({})); st().seek(3);
    await render(<ClipGestures frameW={W} frameH={H} />);
    expect(corners()).toHaveLength(0);
    await act(() => { st().select("l"); });
    expect(corners()).toHaveLength(4);
    await act(() => { st().seek(6); });                                           // the layer is no longer on screen
    expect(corners()).toHaveLength(0);
  });
});
