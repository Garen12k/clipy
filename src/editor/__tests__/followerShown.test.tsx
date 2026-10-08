// The blink: a main clip's copy (cut-out / steady) plays in a second player. Until that player has PRESENTED a frame of the copy
// the clip is drawn as it always was — its own picture visible, no forced background, the follower unseen, the Preview tag on.
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-10T10:00:00.000Z" }));
jest.mock("@/modules/clipy-video", () => ({ ...jest.requireActual("@/modules/clipy-video"), isSteadyAvailable: jest.fn(() => true) }));
jest.mock("@/src/editor/components/thumbnails", () => ({ getThumb: jest.fn(async () => "file:///thumb.jpg") }));
// The player, as the follower sees it: the file it was handed, and the handler it reports a presented frame to.
const mockPlayer: { uri: string | null; onShown: ((uri: string) => void) | undefined; mounts: number } = { uri: null, onShown: undefined, mounts: 0 };
jest.mock("@/src/editor/components/LayerVideo", () => {
  const { View } = require("react-native");
  const { useEffect } = require("react");
  return { LayerVideo: ({ layer, onShown }: { layer: { id: string; sourceUri: string }; onShown?: (uri: string) => void }) => {
    mockPlayer.uri = layer.sourceUri; mockPlayer.onShown = onShown;
    useEffect(() => { mockPlayer.mounts += 1; }, []);
    return <View testID={`layer-video-${layer.id}`} />;
  } };
});
import { act, render, screen } from "@testing-library/react-native";
import { useEffect } from "react";
import { StyleSheet, Text } from "react-native";
import { useCutoutFiles, type CutoutFile } from "@/src/editor/cutoutFiles";
import { useFollowerShown } from "@/src/editor/followerShown";
import { CUTOUT_PREVIEW } from "@/src/editor/model/cutout";
import { STEADY_PREVIEW } from "@/src/editor/model/steady";
import { makeClip, makeProject } from "@/src/editor/model/types";
import { useSteadyFiles } from "@/src/editor/steadyFiles";
import { useEditorStore } from "@/src/editor/store";
import { ClipFrame } from "../components/ClipFrame";
import { PreviewTag } from "../components/PreviewTag";

const W = 1080, H = 1920;
const MEDIA = "file:///doc/projects/p1/media", CUT = "file:///doc/projects/p1/cutout", STEADY = "file:///doc/projects/p1/steady";
const style = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style);
const cutReady = (name: string): Record<string, CutoutFile> => ({ [name]: { status: "ready", uri: `${CUT}/${name}` } });
const video = makeClip({ id: "a", sourceDuration: 8, sourceUri: `${MEDIA}/abc.mov`, cutout: true, background: { type: "color", color: "#112233" } });
const VIDEO = "abc-c1-0-8000.mov", OTHER = "abc-c1-0-9000.mov";
const steadied = makeClip({ id: "s", sourceDuration: 8, sourceUri: "file:///media/a.mp4", stabilize: "medium" });
const SNAME = "a-s1-2-0-0-8000.mov";
const plain = makeClip({ id: "plain", sourceDuration: 3, sourceUri: `${MEDIA}/plain.mov` });
const st = () => useEditorStore.getState();
/** The follower's player presents a frame of the file it holds right now. */
const present = () => act(() => { mockPlayer.onShown?.(mockPlayer.uri as string); });

let pictureMounts = 0, frameRenders = 0;
function Picture() {
  useEffect(() => { pictureMounts += 1; }, []);
  return <Text>video</Text>;
}
/** ClipFrame, counting how often it is drawn. */
function Counted(props: Parameters<typeof ClipFrame>[0]) { frameRenders += 1; return <ClipFrame {...props} />; }

beforeEach(() => {
  Object.assign(mockPlayer, { uri: null, onShown: undefined, mounts: 0 });
  pictureMounts = 0; frameRenders = 0;
  useCutoutFiles.setState({ files: {} });
  useSteadyFiles.setState({ files: {} });
  useFollowerShown.setState({ uri: null });
  st().reset();
  CUTOUT_PREVIEW.mainVideo = true; STEADY_PREVIEW.mainVideo = true;
});

describe("a cut-out on the main track", () => {
  test("the copy is ready on disk but its player has shown nothing yet: the clip is drawn as it was, the follower unseen", async () => {
    st().setProject(makeProject({ clips: [video] }));
    useCutoutFiles.setState({ files: cutReady(VIDEO) });
    await render(<ClipFrame clip={video} frameW={W} frameH={H}><Picture /></ClipFrame>);
    expect(mockPlayer.uri).toBe(`${CUT}/${VIDEO}`);                          // the second player is loading the copy …
    expect(style("clip-content").opacity).toBeUndefined();                    // … under the clip's own picture, still visible
    expect(screen.queryByTestId("clip-background")).toBeNull();               // no background-only frame
    expect(style("clip-cutout").opacity).toBe(0);
  });

  test("once the player presents a frame of the copy: the own picture is hidden, the background drawn, the copy seen — nothing remounts", async () => {
    st().setProject(makeProject({ clips: [video] }));
    useCutoutFiles.setState({ files: cutReady(VIDEO) });
    await render(<ClipFrame clip={video} frameW={W} frameH={H}><Picture /></ClipFrame>);
    await present();
    expect(style("clip-content").opacity).toBe(0);
    expect(style("clip-background").backgroundColor).toBe("#112233");
    expect(style("clip-cutout").opacity).toBeUndefined();
    expect(pictureMounts).toBe(1);
    expect(mockPlayer.mounts).toBe(1);
  });

  test("another ready copy: the original shows again until THAT copy has presented a frame (the old report does not count)", async () => {
    useCutoutFiles.setState({ files: cutReady(VIDEO) });
    await render(<ClipFrame clip={video} frameW={W} frameH={H}><Picture /></ClipFrame>);
    await present();
    await act(() => { useCutoutFiles.setState({ files: cutReady(OTHER) }); });
    expect(mockPlayer.uri).toBe(`${CUT}/${OTHER}`);
    expect(style("clip-content").opacity).toBeUndefined();
    expect(style("clip-cutout").opacity).toBe(0);                              // never the old copy's last frame over the new clip
    expect(screen.queryByTestId("clip-background")).toBeNull();
    await present();
    expect(style("clip-content").opacity).toBe(0);
    expect(style("clip-cutout").opacity).toBeUndefined();
    expect(mockPlayer.mounts).toBe(1);
  });

  test("back to the first copy before the second was shown: the first must present again — a remembered report is not a picture", async () => {
    useCutoutFiles.setState({ files: cutReady(VIDEO) });
    await render(<ClipFrame clip={video} frameW={W} frameH={H}><Picture /></ClipFrame>);
    await present();
    await act(() => { useCutoutFiles.setState({ files: cutReady(OTHER) }); });
    await act(() => { useCutoutFiles.setState({ files: cutReady(VIDEO) }); });
    expect(style("clip-content").opacity).toBeUndefined();
    await present();
    expect(style("clip-content").opacity).toBe(0);
  });

  test("the two halves of a split share a copy: from one to the other the copy stays shown", async () => {
    useCutoutFiles.setState({ files: cutReady(VIDEO) });
    const view = await render(<ClipFrame clip={video} frameW={W} frameH={H}><Picture /></ClipFrame>);
    await present();
    await view.rerender(<ClipFrame clip={{ ...video, id: "b", trimStart: 4 }} frameW={W} frameH={H}><Picture /></ClipFrame>);
    expect(style("clip-content").opacity).toBe(0);
    expect(style("clip-cutout").opacity).toBeUndefined();
  });

  test("the copy goes and comes back (the follower was unmounted): shown starts over", async () => {
    useCutoutFiles.setState({ files: cutReady(VIDEO) });
    await render(<ClipFrame clip={video} frameW={W} frameH={H}><Picture /></ClipFrame>);
    await present();
    await act(() => { useCutoutFiles.setState({ files: {} }); });
    expect(useFollowerShown.getState().uri).toBeNull();
    await act(() => { useCutoutFiles.setState({ files: cutReady(VIDEO) }); });
    expect(style("clip-content").opacity).toBeUndefined();
    expect(style("clip-cutout").opacity).toBe(0);
    expect(pictureMounts).toBe(1);
  });

  test("entering a cut-out clip from a clip without one: the new clip's own picture shows until its copy does", async () => {
    useCutoutFiles.setState({ files: cutReady(VIDEO) });
    const view = await render(<ClipFrame clip={plain} frameW={W} frameH={H}><Picture /></ClipFrame>);
    expect(screen.queryByTestId("clip-cutout")).toBeNull();
    await view.rerender(<ClipFrame clip={video} frameW={W} frameH={H}><Picture /></ClipFrame>);
    expect(style("clip-content").opacity).toBeUndefined();
    expect(screen.queryByTestId("clip-background")).toBeNull();
    await present();
    expect(style("clip-content").opacity).toBe(0);
    expect(pictureMounts).toBe(1);
  });

  test("the playhead moving draws the frame no more often for it, and a second report of the same copy draws nothing", async () => {
    st().setProject(makeProject({ clips: [video] }));
    useCutoutFiles.setState({ files: cutReady(VIDEO) });
    await render(<Counted clip={video} frameW={W} frameH={H}><Picture /></Counted>);
    await present();
    const drawn = frameRenders, held = useFollowerShown.getState();
    await act(() => { st().seek(1); });
    await act(() => { st().seek(2); });
    await present();
    expect(frameRenders).toBe(drawn);
    expect(useFollowerShown.getState()).toBe(held);
    expect(style("clip-content").opacity).toBe(0);
  });
});

describe("a steady copy on the main track", () => {
  test("the follower is unseen over the still-visible original until it presents a frame, then it covers it", async () => {
    st().setProject(makeProject({ id: "p1", clips: [steadied] }));
    useSteadyFiles.setState({ files: { [SNAME]: { status: "ready", uri: `${STEADY}/${SNAME}` } } });
    await render(<ClipFrame clip={steadied} frameW={300} frameH={533}><Picture /></ClipFrame>);
    expect(style("clip-steady").opacity).toBe(0);
    expect(style("clip-content").opacity).toBeUndefined();
    await present();
    expect(style("clip-steady").opacity).toBeUndefined();
    expect(style("clip-content").opacity).toBeUndefined();                    // covered, never hidden
    expect(screen.queryByTestId("clip-background")).toBeNull();
  });
});

describe("the Preview tag", () => {
  test("cut-out: it stays while the ready copy has not been shown, and goes with the first presented frame", async () => {
    st().setProject(makeProject({ clips: [video] }));
    useCutoutFiles.setState({ files: cutReady(VIDEO) });
    await render(<><ClipFrame clip={video} frameW={W} frameH={H}><Picture /></ClipFrame><PreviewTag visible={false} /></>);
    expect(screen.getByTestId("preview-tag")).toBeTruthy();
    await present();
    expect(screen.queryByTestId("preview-tag")).toBeNull();
    await act(() => { useCutoutFiles.setState({ files: cutReady(OTHER) }); });  // another copy: the original is on screen again
    expect(screen.getByTestId("preview-tag")).toBeTruthy();
    await present();
    expect(screen.queryByTestId("preview-tag")).toBeNull();
  });

  test("steady: the same", async () => {
    st().setProject(makeProject({ id: "p1", clips: [steadied] }));
    useSteadyFiles.setState({ files: { [SNAME]: { status: "ready", uri: `${STEADY}/${SNAME}` } } });
    await render(<><ClipFrame clip={steadied} frameW={300} frameH={533}><Picture /></ClipFrame><PreviewTag visible={false} /></>);
    expect(screen.getByTestId("preview-tag")).toBeTruthy();
    await present();
    expect(screen.queryByTestId("preview-tag")).toBeNull();
  });

  test("a clip with no follower asks nothing of it: no copy at all, or the main preview switched off (that tag is the old rule's)", async () => {
    st().setProject(makeProject({ clips: [plain] }));
    await render(<PreviewTag visible={false} />);
    expect(screen.queryByTestId("preview-tag")).toBeNull();
  });
});
