import { StyleSheet } from "react-native";
import { act, render, screen, within } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-09T10:00:00.000Z" }));
jest.mock("@/src/projects/pickMedia", () => ({ pickMedia: jest.fn(async () => null) }));
// The outline's one drawn element, counted: a segment that renders again renders its Path again.
jest.mock("react-native-svg", () => {
  const real = jest.requireActual("react-native-svg");
  const { createElement } = require("react");
  const { View } = require("react-native");
  const drawn = { count: 0 };
  const Path = (props: unknown) => { drawn.count += 1; return createElement(View, props as object); };
  return Object.assign({}, real, { Path, __drawn: drawn, __esModule: true });
});
import { moveAudioTrack, updateAudioTrackById } from "@/src/editor/model/ops";
import { segmentMarks, segmentPath, WAVE, type Peaks } from "@/src/editor/model/peaks";
import { makeAudioTrack, makeClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { AudioLane } from "../components/AudioLane";
import { Timeline } from "../components/Timeline";
import { usePeaksFiles } from "../peaksFiles";

const drawn = (jest.requireMock("react-native-svg") as { __drawn: { count: number } }).__drawn;
const SONG = "file:///m/song.m4a", VOICE = "file:///m/voice.m4a", SFX = "file:///m/whoosh.wav";
const p = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 200 })], audioTracks: [
  makeAudioTrack({ id: "m1", sourceUri: SONG, title: "Song", sourceDuration: 180, start: 1, trimStart: 0, trimEnd: 60 }),
  makeAudioTrack({ id: "m2", sourceUri: SONG, title: "Song", sourceDuration: 180, start: 61, trimStart: 60, trimEnd: 120 }),
  makeAudioTrack({ id: "v1", kind: "voice", sourceUri: VOICE, title: "Voice-over 1", sourceDuration: 6, start: 2, trimStart: 1, trimEnd: 3 }),
  makeAudioTrack({ id: "s1", kind: "sfx", sourceUri: SFX, title: "Whoosh", sourceDuration: 1, start: 4 }),
  makeAudioTrack({ id: "s2", kind: "sfx", sourceUri: SFX, title: "Whoosh", sourceDuration: 1, start: 8, trimStart: 0, trimEnd: 0.5 }),
] });
const outline = (duration: number, value: (i: number) => number = (i) => ((i * 37) % 100) / 100): Peaks => {
  const levels = Uint8Array.from(Array.from({ length: Math.round(duration * 50) }, (_, i) => Math.round(value(i) * 255)));
  return { duration, levels, top: Math.max(0, ...levels) };
};
const song = outline(180), voice = outline(6), sfx = outline(1);
const give = (files: Record<string, Peaks>) => usePeaksFiles.setState({ files: Object.fromEntries(Object.entries(files).map(([uri, peaks]) => [uri, { status: "ready" as const, peaks }])) });
const st = () => useEditorStore.getState();
const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = { props: Record<string, any>; children: (Node | string)[] };
const kid = (n: unknown, i = 0): Node => (n as Node).children[i] as Node;
/** The one path inside a segment's picture (the Svg wraps it in a group). */
const pathOf = (n: Node): Node & { props: { d: string } } => (typeof n.props.d === "string" ? (n as Node & { props: { d: string } }) : pathOf(n.children[0] as Node));
/** The segments a bar draws: each one's place in the row and its path. */
const segments = (id: string) => within(screen.getByTestId(`bar-wave-${id}`)).getAllByTestId("bar-wave-segment").map((s) => s as unknown as Node).map((s) => ({
  left: (StyleSheet.flatten(s.props.style) as { left: number }).left, path: pathOf(s).props as { d: string; fill: unknown; stroke: unknown; strokeOpacity: unknown; strokeWidth: unknown },
}));
const row = (id: string) => StyleSheet.flatten(kid(screen.getByTestId(`bar-wave-${id}`)).props.style) as { left: number; width: number; transform?: { scaleX: number }[] };
const Lanes = () => <><AudioLane kind="music" /><AudioLane kind="voice" /><AudioLane kind="sfx" /></>;

beforeEach(() => { usePeaksFiles.setState({ files: {} }); st().reset(); st().setProject(p); st().setZoom(60); drawn.count = 0; });

describe("no outline", () => {
  test("not known yet, failed, or a missing file: the bar's tree is the one it has with nothing known — no outline, no backing", async () => {
    const { toJSON, rerender } = await render(<Lanes />);
    const bare = JSON.stringify(toJSON());
    expect(screen.queryByTestId(/^bar-wave/)).toBeNull();
    expect(screen.queryByTestId(/^bar-label/)).toBeNull();
    await act(async () => { usePeaksFiles.setState({ files: { [SONG]: { status: "failed" }, [VOICE]: { status: "failed" }, [SFX]: { status: "failed" } } }); });
    expect(JSON.stringify(toJSON())).toBe(bare);
    // Outlines for other files change nothing either.
    await act(async () => { give({ "file:///m/other.m4a": song }); });
    await rerender(<Lanes />);
    expect(JSON.stringify(toJSON())).toBe(bare);
    expect(drawn.count).toBe(0);
  });
  test("a missing file keeps its mark and gets no outline even when one is known", async () => {
    st().setProject(p, [VOICE]);
    give({ [SONG]: song, [VOICE]: voice });
    await render(<Lanes />);
    expect(screen.getByTestId("audio-bar-v1-missing")).toBeTruthy();
    expect(screen.queryByTestId("bar-wave-v1")).toBeNull();
    expect(screen.queryByTestId("bar-label-v1")).toBeNull();
    expect(screen.getByTestId("bar-wave-m1")).toBeTruthy();
  });
});

describe("the outline in a bar", () => {
  test("appears when the file's outline arrives, with no animation: the first child of the bar, clipped to it, never a touch target", async () => {
    await render(<Lanes />);
    await act(async () => { give({ [VOICE]: voice }); });
    const bar = screen.getByTestId("audio-bar-v1"), wave = screen.getByTestId("bar-wave-v1");
    expect(kid(bar).props.testID).toBe("bar-wave-v1");
    expect(wave.props.pointerEvents).toBe("none");
    expect(flat("bar-wave-v1")).toMatchObject({ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, overflow: "hidden" });
    // The bar itself is where and what it was.
    expect(bar).toHaveStyle({ position: "absolute", left: 120, width: 120, height: 28, backgroundColor: theme.colors.kindVoice, borderWidth: 2, borderColor: theme.colors.kindVoice });
    expect(screen.queryByTestId("bar-wave-m1")).toBeNull();   // the song's is not there yet
  });

  test("thin marks in the bar's own ink, see-through, as one path a segment — never a view a mark", async () => {
    give({ [VOICE]: voice });
    await render(<Lanes />);
    const [seg] = segments("v1");
    expect(seg.path).toMatchObject({ fill: "none", stroke: theme.colors.onKind, strokeOpacity: theme.wave.opacity, strokeWidth: WAVE.mark });
    expect(theme.wave).toEqual({ ink: theme.colors.onKind, opacity: 0.32 });
    expect(seg.path.d).toBe(segmentPath(segmentMarks(voice, 60, 0), 24));
    expect(seg.path.d.split("M").length - 1).toBe(100);
    expect(drawn.count).toBe(1);   // the bar plays 1 … 3 s of its file — 60 … 180 pt: the file's first segment, one path
  });

  test("glued to the sound: a moment of the file stands where the bar's own time → x puts it, whatever the trim", async () => {
    give({ [VOICE]: voice, [SONG]: song });
    await render(<Lanes />);
    // The voice-over plays its file from 1 s: the file's start is 60 pt left of the bar's edge (and 2 pt more: the row is inside the border).
    expect(row("v1")).toMatchObject({ left: -62, width: 0 });
    expect(segments("v1").map((s) => s.left)).toEqual([0]);
    await act(async () => { st().seek(62); });
    // The second half of the split song plays from 60 s = 3600 pt into the file: its row starts there, and the segments are the file's 12th, 13th …
    expect(row("m2").left).toBe(-3602);
    const m2 = segments("m2");
    expect(m2[0].left).toBe(3600);
    expect(m2[0].path.d).toBe(segmentPath(segmentMarks(song, 60, 12), 24));
    // So the file's second 61 (mark 20 of segment 12) is 60 pt into the bar: (61 − 60) × 60. The bar's inside starts 2 pt in.
    expect(2 + row("m2").left + m2[0].left + 20 * WAVE.pitch).toBe((61 - 60) * 60);
  });

  test("only the segments near the screen are there: a three-minute song is a few pictures, wherever it is scrolled to", async () => {
    give({ [SONG]: outline(180) });
    st().apply((q) => updateAudioTrackById(q, "m1", { trimEnd: 180 }));
    await render(<AudioLane kind="music" />);
    const at = () => segments("m1").map((s) => s.left / WAVE.segment);
    expect(at()).toEqual([0, 1, 2]);                 // the screen is 750 pt wide here: 375 + 300 beside the playhead
    await act(async () => { st().seek(90); });
    expect(at()).toEqual([15, 16, 17, 18, 19, 20]);
    expect(at().length).toBeLessThanOrEqual(WAVE.most);
  });

  test("a very narrow bar still shows its outline; silence is a flat thin line", async () => {
    give({ [SFX]: outline(1, () => 0) });
    st().apply((q) => updateAudioTrackById(q, "s2", { trimEnd: 0.1 }));
    await render(<AudioLane kind="sfx" />);
    expect(screen.getByTestId("audio-bar-s2")).toHaveStyle({ width: 12 });
    const [seg] = segments("s2");
    expect(seg.path.d.startsWith("M1 11.5V12.5M4 11.5V12.5")).toBe(true);
    expect(screen.queryByTestId("bar-glyph-s2")).toBeNull();
  });
});

describe("the words on a bar with an outline", () => {
  beforeEach(() => give({ [SONG]: song, [VOICE]: voice, [SFX]: sfx }));
  test("the glyph, the percent and the title keep a solid backing of the kind's own colour, only as wide as they are", async () => {
    await render(<Lanes />);
    for (const [id, color, title] of [["m1", theme.colors.kindMusic, "Song"], ["v1", theme.colors.kindVoice, "Voice-over 1"]] as const) {
      const label = screen.getByTestId(`bar-label-${id}`);
      expect(label).toHaveStyle({ backgroundColor: color, flexDirection: "row", flexShrink: 1 });
      expect(StyleSheet.flatten(label.props.style).flex).toBeUndefined();
      expect(within(label).getByTestId(`bar-glyph-${id}`)).toBeTruthy();
      expect(within(label).getByText("100%")).toHaveStyle({ color: theme.colors.onKind, fontVariant: ["tabular-nums"] });
      expect(within(label).getByText(title)).toHaveStyle({ color: theme.colors.onKind, flexShrink: 1 });
      // After the outline in the bar: drawn above it.
      const kids = (screen.getByTestId(`audio-bar-${id}`).children as { props: { testID?: string } }[]).map((c) => c.props.testID);
      expect(kids.indexOf(`bar-label-${id}`)).toBeGreaterThan(kids.indexOf(`bar-wave-${id}`));
    }
  });
  test("a narrow bar leaves out the words first, then the glyph, as before — the outline stays", async () => {
    await render(<AudioLane kind="sfx" />);
    // 60 pt: the glyph only (its backing with it).
    expect(within(screen.getByTestId("bar-label-s1")).getByTestId("bar-glyph-s1")).toBeTruthy();
    expect(screen.queryByText("Whoosh")).toBeNull();
    // 30 pt: neither, and no empty backing.
    expect(screen.queryByTestId("bar-label-s2")).toBeNull();
    expect(screen.queryByTestId("bar-glyph-s2")).toBeNull();
    expect(screen.getByTestId("bar-wave-s2")).toBeTruthy();
    expect(screen.getAllByLabelText("Sound effect Whoosh")).toHaveLength(2);
  });
  test("a selected bar keeps its white border, and its handles lie above the outline", async () => {
    st().selectAudio("v1");
    await render(<AudioLane kind="voice" />);
    const bar = screen.getByTestId("audio-bar-v1");
    expect(bar).toHaveStyle({ borderColor: theme.colors.text, zIndex: 1 });
    const kids = bar.children as { props: { testID?: string; accessibilityLabel?: string } }[];
    const wave = kids.findIndex((c) => c.props.testID === "bar-wave-v1");
    const handles = kids.map((c, i) => (c.props.accessibilityLabel?.endsWith("handle") ? i : -1)).filter((i) => i >= 0);
    expect(wave).toBe(0);
    expect(handles).toHaveLength(2);
    for (const i of handles) expect(i).toBeGreaterThan(wave);
    expect(screen.getByLabelText("Voice start handle")).toHaveStyle({ backgroundColor: theme.colors.text });
  });
});

describe("what draws an outline again — and what does not", () => {
  beforeEach(() => give({ [SONG]: song, [VOICE]: voice, [SFX]: sfx }));
  test("a playhead tick, a selection, a move and a trim draw no segment again", async () => {
    await render(<Lanes />);
    const first = drawn.count;
    expect(first).toBeGreaterThan(0);
    // Playback: ticks that stay inside the segments on screen.
    for (let i = 1; i <= 10; i++) await act(async () => { st().seek(i * 0.033); });
    expect(drawn.count).toBe(first);
    // Selecting and unselecting bars.
    await act(async () => { st().selectAudio("m1"); });
    await act(async () => { st().selectAudio("v1"); });
    await act(async () => { st().selectAudio(null); });
    expect(drawn.count).toBe(first);
    // A bar is dragged along the timeline, frame by frame.
    await act(async () => { st().beginTransaction(); });
    for (let i = 1; i <= 10; i++) await act(async () => { st().applyTransient((q) => moveAudioTrack(q, "v1", 2 + i * 0.01)); });
    expect(drawn.count).toBe(first);
    // Its start is trimmed, frame by frame: the same segments, the row shifted under the bar's edge.
    const paths = segments("v1").map((s) => s.path.d);
    for (let i = 1; i <= 10; i++) await act(async () => { st().applyTransient((q) => updateAudioTrackById(q, "v1", { trimStart: 1 + i * 0.05 })); });
    expect(drawn.count).toBe(first);
    expect(row("v1").left).toBe(-(1.5 * 60) - 2);
    expect(segments("v1").map((s) => s.path.d)).toEqual(paths);
    // And its end.
    for (let i = 1; i <= 10; i++) await act(async () => { st().applyTransient((q) => updateAudioTrackById(q, "v1", { trimEnd: 3 + i * 0.05 })); });
    expect(drawn.count).toBe(first);
  });

  test("scrolling on mounts the segments that come near and draws none of the others again", async () => {
    st().apply((q) => updateAudioTrackById(q, "m1", { trimEnd: 180 }));
    await render(<AudioLane kind="music" />);
    const first = drawn.count;
    const before = segments("m1").length;
    await act(async () => { st().seek(6.5); });   // 390 pt on: one more segment of the song comes within reach
    const after = segments("m1").length;
    expect(after).toBeGreaterThan(before);
    expect(drawn.count - first).toBe(after - before);
  });

  test("a new zoom builds the segments at that zoom", async () => {
    await render(<AudioLane kind="voice" />);
    await act(async () => { st().setZoom(120); });
    expect(row("v1")).toMatchObject({ left: -122 });
    expect(row("v1").transform).toBeUndefined();
    expect(segments("v1")[0].path.d).toBe(segmentPath(segmentMarks(voice, 120, 0), 24));
  });

  test("during a pinch the outline stretches with the bar and is built again a step away and when the pinch ends — as the ruler", async () => {
    type Pinch = { handlers: Record<"onBegin" | "onStart" | "onUpdate" | "onFinalize", (e?: { scale: number }) => void> };
    const pinch = () => (screen.getByTestId("timeline-root").props.gesture as Pinch).handlers;
    await render(<Timeline />);
    const at60 = segments("v1")[0].path.d;
    const first = drawn.count;
    await act(async () => { pinch().onBegin(); pinch().onStart(); });
    for (const scale of [1.05, 1.1, 1.2, 1.25]) {
      await act(async () => { pinch().onUpdate({ scale }); });
      expect(row("v1").transform).toEqual([{ scaleX: scale }]);
      // Stretched about the file's own start, which is where the zoom of now puts it: every mark stays on its time.
      expect(row("v1").left).toBeCloseTo(-(1 * 60 * scale) - 2, 6);
      expect(segments("v1")[0].path.d).toBe(at60);
    }
    expect(drawn.count).toBe(first);
    await act(async () => { pinch().onUpdate({ scale: 1.5 }); });     // a step away: built at 90
    expect(row("v1").transform).toBeUndefined();
    expect(segments("v1")[0].path.d).toBe(segmentPath(segmentMarks(voice, 90, 0), 24));
    await act(async () => { pinch().onUpdate({ scale: 1.6 }); });
    expect(row("v1").transform).toEqual([{ scaleX: 96 / 90 }]);
    await act(async () => { pinch().onFinalize(); });                   // the pinch ends: built at the zoom it ended on
    expect(row("v1").transform).toBeUndefined();
    expect(segments("v1")[0].path.d).toBe(segmentPath(segmentMarks(voice, 96, 0), 24));
  });
});
