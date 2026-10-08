import { render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-10T10:00:00.000Z" }));
jest.mock("../components/LayerVideo", () => {
  const { View } = jest.requireActual("react-native");
  return { LayerVideo: ({ layer }: { layer: { id: string; sourceUri: string; muted: boolean } }) => <View testID={`player-${layer.id}`} accessibilityLabel={`${layer.sourceUri}|${layer.muted ? "silent" : "sound"}`} /> };
});
jest.mock("../components/thumbnails", () => ({ getThumb: jest.fn(async () => "file:///thumb.jpg") }));
import { Text } from "react-native";
import { STEADY_PREVIEW } from "@/src/editor/model/steady";
import { makeClip, makeLayer, makeProject } from "@/src/editor/model/types";
import { useSteadyFiles } from "@/src/editor/steadyFiles";
import { useEditorStore } from "@/src/editor/store";
import { ClipFrame } from "../components/ClipFrame";
import { LayerStack } from "../components/LayerStack";
import { steadyNeedsTag } from "../components/PreviewTag";

const DIR = "file:///doc/projects/p1/steady";
const main = makeClip({ id: "a", sourceDuration: 8, sourceUri: "file:///media/a.mp4", stabilize: "medium" });
const NAME = "a-s1-2-0-0-8000.mov";
const layer = makeLayer({ id: "L", sourceDuration: 6, sourceUri: "file:///media/l.mp4", speed: 0.5, smooth: true });
const LNAME = "l-s1-0-60-0-6000.mov";
const ready = (name: string) => ({ [name]: { status: "ready" as const, uri: `${DIR}/${name}` } });
const st = () => useEditorStore.getState();
const flat = (id: string) => { const s = screen.getByTestId(id).props.style; return Array.isArray(s) ? Object.assign({}, ...s) : s; };

beforeEach(() => { useSteadyFiles.setState({ files: {} }); st().reset(); STEADY_PREVIEW.mainVideo = true; STEADY_PREVIEW.layerVideo = true; });

test("a main clip without a ready copy is drawn exactly as before: no follower, no forced background", async () => {
  st().setProject(makeProject({ id: "p1", clips: [main] }));
  useSteadyFiles.setState({ files: { [NAME]: { status: "busy", progress: 0.5 } } });
  await render(<ClipFrame clip={main} frameW={300} frameH={533}><Text>own picture</Text></ClipFrame>);
  expect(screen.queryByTestId("clip-steady")).toBeNull();
  expect(screen.queryByTestId("clip-cutout")).toBeNull();
  expect(screen.getByText("own picture")).toBeTruthy();
});

test("a main clip with a ready copy: a silent follower plays the copy OVER the clip's own picture, which stays visible underneath", async () => {
  st().setProject(makeProject({ id: "p1", clips: [main] }));
  useSteadyFiles.setState({ files: ready(NAME) });
  await render(<ClipFrame clip={main} frameW={300} frameH={533}><Text>own picture</Text></ClipFrame>);
  expect(screen.getByTestId("clip-steady")).toBeTruthy();
  expect(screen.getByTestId("player-a").props.accessibilityLabel).toBe(`${DIR}/${NAME}|silent`);
  expect(flat("clip-content").opacity).toBeUndefined();                // not hidden: an opaque copy covers it, and it shows until the copy has loaded
  expect(screen.queryByTestId("clip-background")).toBeNull();          // a steady copy is not see-through
});

test("with the main preview switched off the clip plays its own file", async () => {
  STEADY_PREVIEW.mainVideo = false;
  st().setProject(makeProject({ id: "p1", clips: [main] }));
  useSteadyFiles.setState({ files: ready(NAME) });
  await render(<ClipFrame clip={main} frameW={300} frameH={533}><Text>own picture</Text></ClipFrame>);
  expect(screen.queryByTestId("clip-steady")).toBeNull();
});

test("a layer's one player is handed the copy once it is ready, with its sound", async () => {
  st().setProject(makeProject({ id: "p1", clips: [makeClip({ id: "m", sourceDuration: 20 })], layers: [layer] }));
  const view = await render(<LayerStack frameW={300} frameH={533} />);
  expect(screen.getByTestId("player-L").props.accessibilityLabel).toBe("file:///media/l.mp4|sound");
  useSteadyFiles.setState({ files: ready(LNAME) });
  await view.rerender(<LayerStack frameW={300} frameH={533} />);
  expect(screen.getByTestId("player-L").props.accessibilityLabel).toBe(`${DIR}/${LNAME}|sound`);
});

test("the Preview tag: shown while a clip on screen has a setting whose copy the preview is not showing", () => {
  const p = makeProject({ id: "p1", clips: [main], layers: [{ ...layer, start: 0 }] });
  expect(steadyNeedsTag(makeProject({ clips: [makeClip({ id: "x", sourceDuration: 5 })] }), 1, {})).toBe(false);
  expect(steadyNeedsTag(p, 1, {})).toBe(true);
  expect(steadyNeedsTag(p, 1, ready(NAME))).toBe(true);                // the layer's copy is still missing
  expect(steadyNeedsTag(p, 1, { ...ready(NAME), ...ready(LNAME) })).toBe(false);
  STEADY_PREVIEW.mainVideo = false;
  expect(steadyNeedsTag(p, 1, { ...ready(NAME), ...ready(LNAME) })).toBe(true);
});

test("a stored clip with BOTH a cut-out and a strength: the steady side is idle — no steady follower and no tag for it", async () => {
  const both = { ...main, cutout: true as const };
  st().setProject(makeProject({ id: "p1", clips: [both] }));
  useSteadyFiles.setState({ files: ready(NAME) });
  await render(<ClipFrame clip={both} frameW={300} frameH={533}><Text>own picture</Text></ClipFrame>);
  expect(screen.queryByTestId("clip-steady")).toBeNull();
  expect(flat("clip-content").opacity).toBeUndefined();
  expect(steadyNeedsTag(makeProject({ id: "p1", clips: [both] }), 1, {})).toBe(false);
});
