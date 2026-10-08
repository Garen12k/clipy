jest.mock("@/src/editor/components/thumbnails", () => ({ getThumb: jest.fn(async () => "file:///thumb.jpg") }));
// Every time a player is MOUNTED (a new native player, a file loaded from nothing) — as against handed another file in place.
const mockMounts: string[] = [];
jest.mock("@/src/editor/components/LayerVideo", () => {
  const { View } = require("react-native");
  const { useEffect } = require("react");
  return { LayerVideo: ({ layer, offset }: { layer: { id: string; sourceUri: string; muted: boolean }; offset: number }) => {
    useEffect(() => { mockMounts.push(layer.id); }, []);
    return <View testID={`layer-video-${layer.id}`} accessibilityLabel={`${layer.sourceUri}|${layer.muted ? "muted" : "sound"}|${offset}`} />;
  } };
});
import { act, render, screen } from "@testing-library/react-native";
import { useEffect } from "react";
import { StyleSheet, Text } from "react-native";
import { useCutoutFiles, type CutoutFile } from "@/src/editor/cutoutFiles";
import { CUTOUT_PREVIEW } from "@/src/editor/model/cutout";
import { makeClip, makeLayer, makePhotoClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { ClipFrame } from "../components/ClipFrame";
import { CutoutFollower } from "../components/CutoutFollower";
import { LayerStack } from "../components/LayerStack";
import { cutoutNeedsTag, PreviewTag } from "../components/PreviewTag";

const W = 1080, H = 1920;
const MEDIA = "file:///doc/projects/p1/media", DIR = "file:///doc/projects/p1/cutout";
const style = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style);
const ready = (name: string): Record<string, CutoutFile> => ({ [name]: { status: "ready", uri: `${DIR}/${name}` } });
const video = makeClip({ id: "a", sourceDuration: 8, sourceUri: `${MEDIA}/abc.mov`, cutout: true, background: { type: "color", color: "#112233" } });
const photo = makePhotoClip({ id: "ph", sourceUri: `${MEDIA}/p.jpg`, cutout: true });
const layer = { ...makeLayer({ id: "L", sourceDuration: 6, sourceUri: `${MEDIA}/layer.mov` }), cutout: true as const };
const VIDEO = "abc-c1-0-8000.mov", PHOTO = "p-c1-photo.png", LAYER = "layer-c1-0-6000.mov";
const st = () => useEditorStore.getState();

/** The main picture as PreviewPlayer hands it over: counts how often it is mounted (the `VideoView` must never be). */
let pictureMounts = 0;
function Picture() {
  useEffect(() => { pictureMounts += 1; }, []);
  return <Text>video</Text>;
}

beforeEach(() => {
  mockMounts.length = 0;
  pictureMounts = 0;
  useCutoutFiles.setState({ files: {} });
  st().reset();
  CUTOUT_PREVIEW.layerVideo = true;
  CUTOUT_PREVIEW.mainVideo = true;
});

describe("ClipFrame", () => {
  test("a clip whose copy is not ready is drawn exactly as before: no background, the picture visible, no second player", async () => {
    await render(<ClipFrame clip={video} frameW={W} frameH={H}><Text>video</Text></ClipFrame>);
    expect(screen.queryByTestId("clip-background")).toBeNull();
    expect(screen.queryByTestId("clip-cutout")).toBeNull();
    expect(style("clip-content").opacity).toBeUndefined();
    await act(() => { useCutoutFiles.setState({ files: { [VIDEO]: { status: "busy", progress: 0.4 } } }); });
    expect(screen.queryByTestId("clip-cutout")).toBeNull();
  });

  test("a main video with a ready copy: its own picture is hidden (not removed), the copy plays in its place, the background is drawn", async () => {
    st().setProject(makeProject({ clips: [video] }));
    useCutoutFiles.setState({ files: ready(VIDEO) });
    await render(<ClipFrame clip={video} frameW={W} frameH={H}><Text>video</Text></ClipFrame>);
    expect(screen.getByText("video")).toBeTruthy();                           // still mounted: the player keeps the sound and the clock
    expect(style("clip-content").opacity).toBe(0);
    expect(style("clip-background").backgroundColor).toBe("#112233");
    const box = style("clip-cutout"), own = style("clip-content");
    expect([box.left, box.top, box.width, box.height]).toEqual([own.left, own.top, own.width, own.height]);
    expect(screen.getByTestId("layer-video-a").props.accessibilityLabel).toBe(`${DIR}/${VIDEO}|muted|0`);
  });

  test("the copy coming and going never remounts the main picture, and the copy is laid after it in the same box", async () => {
    st().setProject(makeProject({ clips: [video] }));
    await render(<ClipFrame clip={video} frameW={W} frameH={H}><Picture /></ClipFrame>);
    await act(() => { useCutoutFiles.setState({ files: { [VIDEO]: { status: "busy", progress: 0.99 } } }); });
    await act(() => { useCutoutFiles.setState({ files: ready(VIDEO) }); });
    expect(style("clip-content").opacity).toBe(0);
    const box = screen.getByTestId("clip-box").children as { props: { testID?: string } }[];
    expect(box.map((c) => c.props.testID)).toEqual(["clip-content", "clip-cutout"]);
    await act(() => { useCutoutFiles.setState({ files: {} }); });               // the copy is gone (switched off, or trimmed past it)
    expect(screen.queryByTestId("clip-cutout")).toBeNull();
    expect(style("clip-content").opacity).toBeUndefined();
    await act(() => { useCutoutFiles.setState({ files: ready(VIDEO) }); });
    expect(pictureMounts).toBe(1);
  });

  test("from one copy to another, and from one cut-out clip to the next, the one second player stays and is handed the other file", async () => {
    const other = "abc-c1-0-9000.mov";
    useCutoutFiles.setState({ files: ready(VIDEO) });
    const view = await render(<ClipFrame clip={video} frameW={W} frameH={H}><Picture /></ClipFrame>);
    await act(() => { useCutoutFiles.setState({ files: ready(other) }); });
    expect(screen.getByTestId("layer-video-a").props.accessibilityLabel).toBe(`${DIR}/${other}|muted|0`);
    const half = { ...video, id: "b", trimStart: 4 };                           // the second half of a split: the same copy
    await view.rerender(<ClipFrame clip={half} frameW={W} frameH={H}><Picture /></ClipFrame>);
    expect(screen.getByTestId("layer-video-b").props.accessibilityLabel).toBe(`${DIR}/${other}|muted|0`);
    expect(mockMounts).toEqual(["a"]);
    expect(pictureMounts).toBe(1);
  });

  test("with the main-video preview switched off the clip is drawn as before", async () => {
    CUTOUT_PREVIEW.mainVideo = false;
    useCutoutFiles.setState({ files: ready(VIDEO) });
    await render(<ClipFrame clip={video} frameW={W} frameH={H}><Text>video</Text></ClipFrame>);
    expect(screen.queryByTestId("clip-cutout")).toBeNull();
    expect(style("clip-content").opacity).toBeUndefined();
  });

  test("a photo with a ready copy draws the PNG; on the main track its background is drawn, on a layer there is none", async () => {
    useCutoutFiles.setState({ files: ready(PHOTO) });
    const main = await render(<ClipFrame clip={photo} frameW={W} frameH={H} />);
    expect(screen.getByTestId("clip-photo").props.source).toEqual({ uri: `${DIR}/${PHOTO}` });
    expect(screen.getByTestId("clip-background")).toBeTruthy();
    expect(screen.queryByTestId("clip-cutout")).toBeNull();
    await main.unmount();
    await render(<ClipFrame clip={photo} frameW={W} frameH={H} transparent />);
    expect(screen.getByTestId("clip-photo").props.source).toEqual({ uri: `${DIR}/${PHOTO}` });
    expect(screen.queryByTestId("clip-background")).toBeNull();
  });

  test("a photo whose switch is off, or whose copy is not ready, draws its own file", async () => {
    await render(<ClipFrame clip={photo} frameW={W} frameH={H} />);
    expect(screen.getByTestId("clip-photo").props.source).toEqual({ uri: `${MEDIA}/p.jpg` });
  });

  test("a layer's video gets no second player here (its own plays the copy)", async () => {
    useCutoutFiles.setState({ files: ready(LAYER) });
    await render(<ClipFrame clip={layer} frameW={W} frameH={H} transparent><Text>video</Text></ClipFrame>);
    expect(screen.queryByTestId("clip-cutout")).toBeNull();
    expect(style("clip-content").opacity).toBeUndefined();
  });
});

test("CutoutFollower: a silent player on the copy, at the clip's offset under the playhead", async () => {
  st().setProject(makeProject({ clips: [makeClip({ id: "first", sourceDuration: 3 }), video] }));
  await act(() => { st().seek(4.5); });
  await render(<CutoutFollower clip={video} uri={`${DIR}/${VIDEO}`} />);
  expect(screen.getByTestId("layer-video-a").props.accessibilityLabel).toBe(`${DIR}/${VIDEO}|muted|1.5`);
  await act(() => { st().seek(1); });                                         // another clip is under the playhead: it stands at the start
  expect(screen.getByTestId("layer-video-a").props.accessibilityLabel).toBe(`${DIR}/${VIDEO}|muted|0`);
});

describe("LayerStack", () => {
  const open = async () => {
    st().setProject(makeProject({ clips: [makeClip({ id: "main", sourceDuration: 10 })], layers: [layer] }));
    await render(<LayerStack frameW={W} frameH={H} />);
  };

  test("a layer plays its own file until the copy is ready, then the copy (with the copy's sound)", async () => {
    await open();
    expect(screen.getByTestId("layer-video-L").props.accessibilityLabel).toBe(`${MEDIA}/layer.mov|sound|0`);
    await act(() => { useCutoutFiles.setState({ files: ready(LAYER) }); });
    expect(screen.getByTestId("layer-video-L").props.accessibilityLabel).toBe(`${DIR}/${LAYER}|sound|0`);
  });

  test("the layer keeps its one player when the copy comes, goes and is replaced", async () => {
    await open();
    await act(() => { useCutoutFiles.setState({ files: ready(LAYER) }); });
    await act(() => { useCutoutFiles.setState({ files: ready("layer-c1-0-7000.mov") }); });
    expect(screen.getByTestId("layer-video-L").props.accessibilityLabel).toBe(`${DIR}/layer-c1-0-7000.mov|sound|0`);
    await act(() => { useCutoutFiles.setState({ files: {} }); });
    expect(screen.getByTestId("layer-video-L").props.accessibilityLabel).toBe(`${MEDIA}/layer.mov|sound|0`);
    expect(mockMounts).toEqual(["L"]);
  });

  test("with the layer-video preview switched off it keeps its own file", async () => {
    CUTOUT_PREVIEW.layerVideo = false;
    useCutoutFiles.setState({ files: ready(LAYER) });
    await open();
    expect(screen.getByTestId("layer-video-L").props.accessibilityLabel).toBe(`${MEDIA}/layer.mov|sound|0`);
  });
});

describe("the Preview tag", () => {
  const p = makeProject({ clips: [video], layers: [layer] });
  const both = { ...ready(VIDEO), ...ready(LAYER) };

  test("no cut-out on screen: no tag from here", () => {
    expect(cutoutNeedsTag(makeProject({ clips: [makeClip({ id: "x", sourceDuration: 5 })] }), 1, {})).toBe(false);
  });

  test("a copy that is not ready, failed or cannot be made: the preview shows the clip as it was, so the tag shows", () => {
    expect(cutoutNeedsTag(p, 1, {})).toBe(true);
    expect(cutoutNeedsTag(p, 1, ready(VIDEO))).toBe(true);                   // the layer's is missing
    expect(cutoutNeedsTag(p, 1, { ...both, [LAYER]: { status: "failed", message: "x" } })).toBe(true);
    expect(cutoutNeedsTag(p, 1, both)).toBe(false);
  });

  test("the switches and a blur background", () => {
    CUTOUT_PREVIEW.mainVideo = false;
    expect(cutoutNeedsTag(p, 1, both)).toBe(true);
    CUTOUT_PREVIEW.mainVideo = true;
    CUTOUT_PREVIEW.layerVideo = false;
    expect(cutoutNeedsTag(p, 1, both)).toBe(true);
    CUTOUT_PREVIEW.layerVideo = true;
    const blurred = makeProject({ clips: [{ ...video, background: { type: "blur" } }] });
    expect(cutoutNeedsTag(blurred, 1, ready(VIDEO))).toBe(true);            // the export blurs the cut-out picture: not what the preview shows
    const photoMain = makeProject({ clips: [photo] });
    expect(cutoutNeedsTag(photoMain, 1, ready(PHOTO))).toBe(false);
  });

  test("the component shows the tag for a pending cut-out even when nothing else asks for it, and hides it once the copy is there", async () => {
    st().setProject(p);
    await render(<PreviewTag visible={false} />);
    expect(screen.getByTestId("preview-tag")).toBeTruthy();
    await act(() => { useCutoutFiles.setState({ files: both }); });
    expect(screen.queryByTestId("preview-tag")).toBeNull();
    await act(() => { st().seek(7); });                                         // past the layer (6 s): only the main clip, ready
    expect(screen.queryByTestId("preview-tag")).toBeNull();
    await act(() => { useCutoutFiles.setState({ files: ready(LAYER) }); });     // the main clip has lost its copy
    expect(screen.getByTestId("preview-tag")).toBeTruthy();
  });

  test("the component still shows the tag when the preview asks for it, and nothing without a project", async () => {
    const view = await render(<PreviewTag visible={false} />);
    expect(screen.queryByTestId("preview-tag")).toBeNull();
    await view.rerender(<PreviewTag visible />);
    expect(screen.getByTestId("preview-tag")).toBeTruthy();
  });
});
