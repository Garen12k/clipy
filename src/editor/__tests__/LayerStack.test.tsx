import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@/src/editor/components/thumbnails", () => ({ getThumb: jest.fn(async () => "file:///thumb.jpg") }));
// One fake expo-video player per component that calls useVideoPlayer (as the real hook keeps one per mount). Every native write
// lands, in order, in the player's `calls`. Like the real hook, the player is released in the hook's own unmount cleanup — which
// runs before the component's — and a released player throws on every call.
jest.mock("expo-video", () => {
  const React = require("react");
  const { View } = require("react-native");
  const players: unknown[] = [];
  const make = () => {
    let time = 0, rate = 1, volume = 1, muted = false;
    const listeners: Record<string, (e: unknown) => void> = {};
    const alive = () => { if (p.released) throw new Error("the player was released"); };
    const p = {
      calls: [] as unknown[][],
      uri: null as string | null,
      listeners,
      released: false,
      playing: false, loop: true, audioMixingMode: "auto", preservesPitch: false,
      get currentTime() { alive(); return time; },
      set currentTime(v: number) { alive(); time = v; p.calls.push(["seek", v]); },
      get playbackRate() { return Math.fround(rate); },
      set playbackRate(v: number) { alive(); rate = v; p.calls.push(["rate", v]); },
      get volume() { return volume; },
      set volume(v: number) { alive(); volume = v; p.calls.push(["volume", v]); },
      get muted() { return muted; },
      set muted(v: boolean) { alive(); muted = v; p.calls.push(["muted", v]); },
      play: jest.fn(() => { alive(); p.playing = true; p.calls.push(["play"]); }),
      pause: jest.fn(() => { alive(); p.playing = false; p.calls.push(["pause"]); }),
      replaceAsync: jest.fn(async (source: { uri: string }) => { p.uri = source.uri; p.calls.push(["replace", source.uri]); }),
      addListener: jest.fn((event: string, fn: (e: unknown) => void) => {
        listeners[event] = fn;
        return { remove: () => { alive(); delete listeners[event]; } };
      }),
    };
    return p;
  };
  return {
    __players: players,
    useVideoPlayer: (_source: unknown, setup?: (p: unknown) => void) => {
      const ref = React.useRef(null);
      if (!ref.current) { ref.current = make(); setup?.(ref.current); ref.current.calls.length = 0; players.push(ref.current); }
      React.useEffect(() => () => { ref.current.released = true; }, []);
      return ref.current;
    },
    VideoView: View,
  };
});
import { StyleSheet } from "react-native";
import { FILTERS } from "@/src/editor/effects";
import { maskRadius, placeClip } from "@/src/editor/model/clipLayout";
import { setClipSpeedCurve, setClipTransform } from "@/src/editor/model/ops";
import { DEFAULT_ADJUST, makeClip, makeKeyframe, makeLayer, makePhotoClip, makeProject, type LayerClip } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { LayerStack } from "../components/LayerStack";

type FakePlayer = {
  calls: unknown[][]; uri: string | null; released: boolean; playing: boolean; loop: boolean; audioMixingMode: string; preservesPitch: boolean;
  currentTime: number; play: jest.Mock; pause: jest.Mock; replaceAsync: jest.Mock; listeners: Record<string, (e: unknown) => void>;
};
const players = (jest.requireMock("expo-video") as { __players: FakePlayer[] }).__players;
const st = () => useEditorStore.getState();
const W = 270, H = 480;
const small = { scale: 0.4, x: 0.2, y: -0.1, rotation: 0, flipH: false, flipV: false };
const photoLayer = (id: string, over: Partial<LayerClip> = {}): LayerClip => ({ ...makePhotoClip({ id, seconds: 3 }), transform: small, start: 0, ...over });
/** A 10 s project (one main clip) carrying `layers`. */
const load = (layers: LayerClip[], missing: string[] = []) =>
  st().setProject(makeProject({ clips: [makeClip({ id: "main", sourceDuration: 10 })], layers }), missing);
const seek = (t: number) => act(() => { st().seek(t); });
const setPlaying = (b: boolean) => act(() => { st().setPlaying(b); });
const box = (id: string) => StyleSheet.flatten(within(screen.getByTestId(`layer-${id}`)).getByTestId("clip-box").props.style);
const of = (p: FakePlayer, kind: string) => p.calls.filter((c) => c[0] === kind).map((c) => c[1]);
const ready = (p: FakePlayer) => act(() => { p.listeners.statusChange?.({ status: "readyToPlay" }); });

type Json = { props: { testID?: string }; children: (Json | string)[] | null };
const ids = (node: Json | Json[] | string | null, out: string[] = []): string[] => {
  if (!node || typeof node === "string") return out;
  if (Array.isArray(node)) { node.forEach((n) => ids(n, out)); return out; }
  if (node.props.testID) out.push(node.props.testID);
  for (const c of node.children ?? []) ids(c, out);
  return out;
};

beforeEach(() => {
  jest.clearAllMocks();
  players.length = 0;
  st().reset();
});

describe("what is drawn", () => {
  test("a project without layers, or with none at the playhead, renders nothing", async () => {
    load([]);
    const view = await render(<LayerStack frameW={W} frameH={H} />);
    expect(view.toJSON()).toBeNull();
    await act(() => { load([photoLayer("p", { start: 4 })]); });
    expect(view.toJSON()).toBeNull();
    expect(players).toHaveLength(0);
  });

  test("a photo layer is an image placed by placeClip, with no background node, and takes no touches", async () => {
    const layer = photoLayer("p");
    load([layer]);
    await render(<LayerStack frameW={W} frameH={H} />);
    const placed = placeClip({ width: layer.width, height: layer.height }, layer.crop, small, W, H);
    const b = box("p");
    expect(b.left).toBeCloseTo(placed.centerX - placed.width / 2, 10);
    expect(b.top).toBeCloseTo(placed.centerY - placed.height / 2, 10);
    expect(b.width).toBeCloseTo(W * 0.4, 10);
    expect(b.height).toBeCloseTo(H * 0.4, 10);
    expect("opacity" in b).toBe(false);
    expect("borderRadius" in b).toBe(false);
    expect(within(screen.getByTestId("layer-p")).getByTestId("clip-photo").props.source).toEqual({ uri: layer.sourceUri });
    expect(screen.queryByTestId("clip-background")).toBeNull();
    expect(screen.getByTestId("layer-stack").props.pointerEvents).toBe("none");
    expect(screen.getByTestId("layer-p").props.pointerEvents).toBe("none");
    expect(players).toHaveLength(0); // a photo needs no player
  });

  test("a see-through, masked, rotated layer still has no background: what is beneath shows", async () => {
    load([photoLayer("p", { opacity: 0.5, mask: "circle", transform: { ...small, rotation: 30 } })]);
    await render(<LayerStack frameW={W} frameH={H} />);
    const b = box("p");
    expect(b.opacity).toBe(0.5);
    expect(b.borderRadius).toBeCloseTo(maskRadius({ width: W * 0.4, height: H * 0.4 }, "circle"), 10);
    expect(b.borderRadius).toBeCloseTo((W * 0.4) / 2, 10);
    expect(b.overflow).toBe("hidden");
    expect(screen.queryByTestId("clip-background")).toBeNull();
  });

  test("layers are drawn in list order (later = on top)", async () => {
    load([photoLayer("one"), photoLayer("two"), photoLayer("three")]);
    const view = await render(<LayerStack frameW={W} frameH={H} />);
    expect(ids(view.toJSON() as unknown as Json).filter((id) => id.startsWith("layer-"))).toEqual(["layer-stack", "layer-one", "layer-two", "layer-three"]);
  });

  test("a layer's motion is taken at time − start; its static opacity multiplies the motion's", async () => {
    load([photoLayer("p", { start: 2, opacity: 0.5, keyframes: [makeKeyframe({ t: 0, x: 0, scale: 0.4 }), makeKeyframe({ t: 2, x: 0.4, scale: 0.4, opacity: 0.5 })] })]);
    st().seek(2);
    await render(<LayerStack frameW={W} frameH={H} />);
    const left0 = W / 2 - (W * 0.4) / 2;
    expect(box("p").left).toBeCloseTo(left0, 10);
    expect(box("p").opacity).toBeCloseTo(0.5, 10);
    await seek(3); // one second into the layer: smooth(0.5) = 0.5
    expect(box("p").left).toBeCloseTo(left0 + 0.2 * W, 10);
    expect(box("p").opacity).toBeCloseTo(0.75 * 0.5, 10);
  });

  test("a layer's own filter and adjust sit inside its picture box (so its mask clips them), above the picture", async () => {
    load([photoLayer("p", { mask: "rounded", filter: "vintage", filterIntensity: 0.5, adjust: { ...DEFAULT_ADJUST, brightness: 1 } })]);
    const view = await render(<LayerStack frameW={W} frameH={H} />);
    const inBox = within(within(screen.getByTestId("layer-p")).getByTestId("clip-box"));
    expect(inBox.getByTestId("filter-tint")).toHaveStyle({ opacity: FILTERS.vintage.preview.tintOpacity * 0.5 });
    expect(inBox.getByTestId("adjust-layer")).toBeTruthy();
    const all = ids(view.toJSON() as unknown as Json);
    const order = ["clip-box", "clip-photo", "filter-tint", "adjust-layer"];
    expect(order.map((id) => all.indexOf(id))).toEqual([...order.map((id) => all.indexOf(id))].sort((x, y) => x - y));
    expect(order.filter((id) => !all.includes(id))).toEqual([]);
    // A plain layer adds no look nodes at all.
    await act(() => { load([photoLayer("p")]); });
    expect(ids(view.toJSON() as unknown as Json).filter((id) => /^(filter-|adjust-)/.test(id))).toEqual([]);
  });

  test("the caller's style (the timeline-effect transform) goes on the stack", async () => {
    load([photoLayer("p")]);
    const transform = [{ translateX: 3 }, { translateY: -2 }, { scale: 1.06 }];
    await render(<LayerStack frameW={W} frameH={H} style={{ transform }} />);
    expect(StyleSheet.flatten(screen.getByTestId("layer-stack").props.style).transform).toEqual(transform);
  });
});

describe("mounting follows the playhead", () => {
  test("a layer outside the playhead is not mounted; entering / leaving mounts / unmounts only itself", async () => {
    load([makeLayer({ id: "v", sourceDuration: 6, start: 0, transform: small }), photoLayer("p", { start: 2 })]); // v 0–6, p 2–5
    await render(<LayerStack frameW={W} frameH={H} />);
    expect(screen.getByTestId("layer-v")).toBeTruthy();
    expect(screen.queryByTestId("layer-p")).toBeNull();
    expect(players).toHaveLength(1);
    const video = screen.getByTestId("layer-video-v");
    await seek(3);
    expect(screen.getByTestId("layer-p")).toBeTruthy();
    expect(screen.getByTestId("layer-video-v")).toBe(video);
    await seek(5.5);
    expect(screen.queryByTestId("layer-p")).toBeNull();
    expect(screen.getByTestId("layer-video-v")).toBe(video);
    expect(players).toHaveLength(1);
    expect(players[0].replaceAsync).toHaveBeenCalledTimes(1);
    await seek(7);
    expect(screen.queryByTestId("layer-stack")).toBeNull();
    expect(players[0].released).toBe(true);
    await seek(10); // the project's end: neither was still running
    expect(screen.queryByTestId("layer-stack")).toBeNull();
  });

  test("a layer still running at the project's end stays drawn on the project's last frame; one that ended earlier does not", async () => {
    load([photoLayer("late", { start: 8 }), photoLayer("early", { start: 2 })]); // late 8–11 (the project ends at 10), early 2–5
    st().seek(10);
    await render(<LayerStack frameW={W} frameH={H} />);
    expect(screen.getByTestId("layer-late")).toBeTruthy();
    expect(screen.queryByTestId("layer-early")).toBeNull();
  });

  test("two video layers each get their own player and file", async () => {
    load([makeLayer({ id: "v1", sourceDuration: 4, transform: small }), makeLayer({ id: "v2", sourceDuration: 4, transform: small })]);
    await render(<LayerStack frameW={W} frameH={H} />);
    expect(players.map((p) => p.uri)).toEqual(["file:///media/v1.mp4", "file:///media/v2.mp4"]);
  });

  test("a video layer whose file is missing gets no player and no video view", async () => {
    load([makeLayer({ id: "v", sourceDuration: 4, transform: small })], ["file:///media/v.mp4"]);
    await render(<LayerStack frameW={W} frameH={H} />);
    expect(screen.getByTestId("layer-v")).toBeTruthy();
    expect(screen.queryByTestId("layer-video-v")).toBeNull();
    expect(players).toHaveLength(0);
  });
});

describe("a video layer's player", () => {
  // The layer shows source 1–4 at project time 2–5: playhead t → source t − 1.
  const video = (over: Partial<LayerClip> = {}) => makeLayer({ id: "v", sourceDuration: 4, trimStart: 1, start: 2, transform: small, ...over });
  const mount = async (over: Partial<LayerClip> = {}, at = 2) => {
    load([video(over)]);
    st().seek(at);
    const view = await render(<LayerStack frameW={W} frameH={H} />);
    return { view, p: players[0] };
  };

  test("it is set up once: no loop, mixes with other sound, keeps the pitch", async () => {
    const { p } = await mount();
    expect(p).toMatchObject({ loop: false, audioMixingMode: "mixWithOthers", preservesPitch: true });
    expect(screen.getByTestId("layer-video-v").props).toMatchObject({ contentFit: "fill", nativeControls: false });
  });

  test("it loads the file once and seeks only when the file is ready — to where the playhead is by then", async () => {
    const { p } = await mount();
    expect(of(p, "replace")).toEqual(["file:///media/v.mp4"]);
    await seek(3);
    expect(of(p, "seek")).toEqual([]); // still loading
    await ready(p);
    expect(of(p, "seek")).toEqual([2]);
    expect(p.play).not.toHaveBeenCalled();
    expect(p.pause).not.toHaveBeenCalled();
    await ready(p); // a later readyToPlay (after buffering) does nothing
    expect(of(p, "seek")).toEqual([2]);
    expect(of(p, "replace")).toHaveLength(1);
  });

  test("paused: each new playhead seeks once; edits that leave the source time alone write nothing at all", async () => {
    const { p } = await mount();
    await ready(p);
    p.calls.length = 0;
    await seek(3);
    await seek(3.5);
    expect(p.calls).toEqual([["seek", 2], ["seek", 2.5]]);
    p.calls.length = 0;
    for (const x of [0.1, 0.2, 0.3]) await act(() => { st().applyTransient((pr) => setClipTransform(pr, "v", { x })); });
    await act(() => { st().applyTransient((pr) => setClipTransform(pr, "main", { x: 0.1 })); });
    expect(p.calls).toEqual([]);
    expect(players).toHaveLength(1);
  });

  test("playing: one seek and one play() on entry, nothing per tick, a re-seek only past 0.25 s of drift, one pause()", async () => {
    const { p } = await mount();
    await ready(p);
    p.calls.length = 0;
    await setPlaying(true);
    expect(p.calls).toEqual([["seek", 1], ["play"]]);
    p.calls.length = 0;
    p.currentTime = 1.1; p.calls.length = 0; // the player moved on by itself
    await seek(2.1);
    await seek(2.3); // 0.2 s ahead of the player: inside the tolerance
    expect(p.calls).toEqual([]);
    await seek(2.5); // 0.4 s ahead
    expect(p.calls).toEqual([["seek", 1.5]]);
    p.calls.length = 0;
    await setPlaying(false);
    expect(p.calls).toEqual([["pause"], ["seek", 1.5]]);
    p.calls.length = 0;
    await seek(2.75);
    expect(p.calls).toEqual([["seek", 1.75]]); // paused scrubbing: no second pause
  });

  test("play pressed while the file is still loading starts it once it is ready", async () => {
    const { p } = await mount();
    await setPlaying(true);
    expect(p.calls.filter((c) => c[0] !== "replace" && c[0] !== "volume")).toEqual([]);
    await ready(p);
    expect(p.calls.filter((c) => c[0] === "seek" || c[0] === "play")).toEqual([["seek", 1], ["play"]]);
    await setPlaying(false);
  });

  test("a layer the playhead enters while playing starts by itself", async () => {
    load([video()]);
    await render(<LayerStack frameW={W} frameH={H} />);
    await setPlaying(true);
    expect(players).toHaveLength(0);
    await seek(2.25);
    const p = players[0];
    await ready(p);
    expect(p.calls.filter((c) => c[0] === "seek" || c[0] === "play")).toEqual([["seek", 1.25], ["play"]]);
    await setPlaying(false);
  });

  test("the rate is written once, before play(), and never while paused or for a 1× layer", async () => {
    const { p } = await mount({ speed: 2 }); // source 1–4 over 1.5 s
    await ready(p);
    await seek(2.5);
    expect(of(p, "rate")).toEqual([]);
    p.calls.length = 0;
    await setPlaying(true);
    expect(p.calls).toEqual([["seek", 2], ["rate", 2], ["play"]]);
    p.currentTime = 2.1;
    await seek(2.55);
    await setPlaying(false);
    await setPlaying(true);
    expect(of(p, "rate")).toEqual([2]);
    await setPlaying(false);
  });

  test("a 1× layer never writes the rate", async () => {
    const { p } = await mount();
    await ready(p);
    await setPlaying(true);
    p.currentTime = 1.05;
    await seek(2.05);
    await setPlaying(false);
    expect(of(p, "rate")).toEqual([]);
  });

  test("on a speed curve the rate follows the step under the playhead while playing", async () => {
    // Hero over source 0–8: 1 s slices at 1, 2, 3, 0.5 … → output boundaries 1, 1.5, 1.833.
    st().setProject(setClipSpeedCurve(makeProject({ clips: [makeClip({ id: "main", sourceDuration: 20 })], layers: [makeLayer({ id: "v", sourceDuration: 8, start: 0, transform: small })] }), "v", "hero"));
    await render(<LayerStack frameW={W} frameH={H} />);
    const p = players[0];
    await ready(p);
    await seek(1.2); // paused in the 2× step: nothing written
    expect(of(p, "rate")).toEqual([]);
    await setPlaying(true);
    expect(of(p, "rate")).toEqual([2]);
    p.currentTime = 1.6;
    await seek(1.3); // source 1.6, same step
    expect(of(p, "rate")).toEqual([2]);
    p.currentTime = 2.3;
    await seek(1.6); // source 2.3: the 3× step
    expect(of(p, "rate")).toEqual([2, 3]);
    await setPlaying(false);
  });

  test("a reversed layer previews forwards and silent", async () => {
    const { p } = await mount({ reversed: true }, 3);
    await ready(p);
    expect(of(p, "seek")).toEqual([2]); // forwards: source 1 + 1
    expect(of(p, "volume")).toEqual([0]);
    expect(of(p, "muted")).toEqual([true]);
  });

  test("the volume is the layer's gain at the playhead, capped at 1, and is not rewritten when nothing changed", async () => {
    const { p } = await mount({ volume: 0.8, fadeIn: 2 });
    await ready(p);
    expect(of(p, "volume")).toEqual([0]); // the very start of the fade-in
    await seek(3);
    await seek(4.5);
    await seek(4.6);
    const v = of(p, "volume") as number[];
    expect(v).toHaveLength(3);
    expect(v[1]).toBeCloseTo(0.4, 10);
    expect(v[2]).toBeCloseTo(0.8, 10);
    expect(of(p, "muted")).toEqual([]);
  });

  test("a loud layer is capped at 1 and written once; a muted layer sits at 0", async () => {
    const { p, view } = await mount({ volume: 1.5 });
    await ready(p);
    await seek(3);
    await seek(4);
    expect(of(p, "volume")).toEqual([1]);
    await view.unmount();
    players.length = 0;
    const m = await mount({ muted: true });
    expect(of(m.p, "volume")).toEqual([0]);
    expect(of(m.p, "muted")).toEqual([true]);
  });

  test("recording silences the layer and gives its sound back afterwards, with no seek, play or pause", async () => {
    const { p } = await mount({ volume: 0.8 });
    await ready(p);
    p.calls.length = 0;
    await act(() => { st().setRecording(true); });
    await act(() => { st().setRecording(false); });
    expect(p.calls).toEqual([["volume", 0], ["muted", true], ["volume", 0.8], ["muted", false]]);
  });

  test("replacing the layer's file loads the new one and seeks when it is ready", async () => {
    const { p } = await mount({}, 3);
    await ready(p);
    p.calls.length = 0;
    await act(() => { st().apply((pr) => ({ ...pr, layers: pr.layers.map((l) => ({ ...l, sourceUri: "file:///media/new.mp4" })) })); });
    expect(p.calls).toEqual([["replace", "file:///media/new.mp4"]]);
    await ready(p);
    expect(p.calls).toEqual([["replace", "file:///media/new.mp4"], ["seek", 2]]);
    expect(players).toHaveLength(1);
  });

  test("unmounting — the playhead leaving while playing, or the whole stack going — never throws on the released player", async () => {
    const { p, view } = await mount();
    await ready(p);
    await setPlaying(true);
    await seek(6); // past the layer's end: it unmounts, its player already released by the hook
    expect(p.released).toBe(true);
    expect(screen.queryByTestId("layer-v")).toBeNull();
    await seek(3); // back in: a fresh player
    expect(players).toHaveLength(2);
    await ready(players[1]);
    await view.unmount();
    expect(players[1].released).toBe(true);
    st().setPlaying(false);
  });
});

test("no touches reach the layers: pressing them does nothing", async () => {
  load([photoLayer("p")]);
  await render(<LayerStack frameW={W} frameH={H} />);
  await fireEvent.press(screen.getByTestId("layer-p"));
  expect(st().selectedClipId).toBeNull();
});
