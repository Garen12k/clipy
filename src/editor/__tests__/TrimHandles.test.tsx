import { act, render, screen } from "@testing-library/react-native";
import * as Haptics from "expo-haptics";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { makeClip, makeOverlay, makePhotoClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { TrimHandles, trimFromDrag } from "../components/TrimHandles";
import { useSnapGuide } from "../snapping";

beforeEach(() => { useEditorStore.getState().reset(); });

test("a video clip shows both trim handles", async () => {
  const clip = makeClip({ id: "a", sourceDuration: 4 });
  useEditorStore.getState().setProject(makeProject({ clips: [clip] }));
  await render(<TrimHandles clip={clip} />);
  expect(screen.getByLabelText("Trim start handle")).toBeTruthy();
  expect(screen.getByLabelText("Trim end handle")).toBeTruthy();
});

test("a photo clip shows only the end handle", async () => {
  const clip = makePhotoClip({ id: "p" });
  useEditorStore.getState().setProject(makeProject({ clips: [clip] }));
  await render(<TrimHandles clip={clip} />);
  expect(screen.queryByLabelText("Trim start handle")).toBeNull();
  expect(screen.getByLabelText("Trim end handle")).toBeTruthy();
});

describe("snapping", () => {
  // One clip a 0–8, a beat at 5.37, the playhead at 2, zoom 80 → the clip's end within 0.1 s of the beat or the playhead snaps.
  const a = makeClip({ id: "a", sourceDuration: 8 });
  const buzz = Haptics.impactAsync as jest.Mock;
  const guide = () => useSnapGuide.getState().time;
  const st = () => useEditorStore.getState();
  const clip = (id = "a") => st().project!.clips.find((c) => c.id === id)!;
  type G = { handlers: { onStart: () => void; onUpdate: (e: { translationX: number }) => void; onFinalize: () => void } };
  const handle = (edge: "start" | "end") => screen.getByLabelText(`Trim ${edge} handle`).props.gesture as G;
  const drag = async (g: G, ...seconds: number[]) => {
    await act(() => { g.handlers.onStart(); for (const s of seconds) g.handlers.onUpdate({ translationX: s * 80 }); });
    const held = { guide: guide(), buzzes: buzz.mock.calls.length };
    await act(() => { g.handlers.onFinalize(); });
    expect(guide()).toBeNull();
    expect(st().past).toHaveLength(1);
    return held;
  };
  const open = async (project = makeProject({ clips: [a], beatMarkers: [5.37] }), playhead = 2) => {
    st().setProject(project); st().seek(playhead); st().setZoom(80);
    useSnapGuide.setState({ time: null }); buzz.mockClear();
    await render(<TrimHandles clip={project.clips[0]} />);
  };

  test("the end handle snaps the clip's end to the beat, unrounded", async () => {
    await open();
    const held = await drag(handle("end"), -2.6);   // end 5.4 → 0.03 from 5.37
    expect(clip().trimEnd).toBeCloseTo(5.37, 9);
    expect(clip().trimStart).toBe(0);
    expect(held).toEqual({ guide: 5.37, buzzes: 1 });
  });

  test("the end handle away from the targets keeps today's 0.1 s rounding", async () => {
    await open();
    const held = await drag(handle("end"), -1.26);   // 6.74
    expect(clip().trimEnd).toBe(6.7);
    expect(held).toEqual({ guide: null, buzzes: 0 });
  });

  test("the start handle snaps the clip's END (the track ripples): the end lands on the beat", async () => {
    await open();
    const held = await drag(handle("start"), 2.6);   // the end would be 8 − 2.6 = 5.4 → 5.37
    expect(clip().trimStart).toBeCloseTo(2.63, 9);
    expect(clip().trimEnd).toBe(8);
    expect(held).toEqual({ guide: 5.37, buzzes: 1 });
  });

  test("the drag is output seconds: a 2× clip's end snaps to the beat through timeline.ts", async () => {
    await open(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 16, speed: 2 })], beatMarkers: [5.37] }));   // 0–8 on the timeline
    const held = await drag(handle("end"), -2.6);
    expect(clip().trimEnd).toBeCloseTo(10.74, 9);   // 5.37 s of output
    expect(held).toEqual({ guide: 5.37, buzzes: 1 });
  });

  test("cuts and other bars are not targets for a main-clip trim", async () => {
    // a's end comes to 6.24: 0.02 from the text's end at 6.26 — not a target, so the 0.1 s rounding applies.
    await open(makeProject({ clips: [a, makeClip({ id: "b", sourceDuration: 4 })], overlays: [makeOverlay({ id: "o", start: 1, end: 6.26 })], beatMarkers: [5.37] }), 11);
    const held = await drag(handle("end"), -1.76);
    expect(clip().trimEnd).toBe(6.2);
    expect(held).toEqual({ guide: null, buzzes: 0 });
  });

  test("a snap the minimum length would clamp away is not taken", async () => {
    await open(makeProject({ clips: [a], beatMarkers: [0.04] }), 8);
    const held = await drag(handle("end"), -7.93);   // end 0.07 → the beat at 0.04, shorter than a clip may be
    expect(clip().trimEnd).toBe(0.1);
    expect(held).toEqual({ guide: null, buzzes: 0 });
  });

  test("holding the snap over several frames buzzes once; a gesture that is interrupted clears the guide", async () => {
    await open();
    const g = handle("end");
    await act(() => { g.handlers.onStart(); for (const s of [-2.58, -2.6, -2.62, -2.65]) g.handlers.onUpdate({ translationX: s * 80 }); });
    expect(clip().trimEnd).toBeCloseTo(5.37, 9);
    expect(buzz).toHaveBeenCalledTimes(1);
    expect(guide()).toBe(5.37);
    await act(() => { g.handlers.onFinalize(); });
    expect(guide()).toBeNull();
  });

  test("trimFromDrag: `exact` skips the 0.1 s rounding of the dragged value, not the bounds", () => {
    expect(trimFromDrag(a, "end", 8, -2.63 * 80, 80).trimEnd).toBe(5.4);
    expect(trimFromDrag(a, "end", 8, -2.63 * 80, 80, true).trimEnd).toBeCloseTo(5.37, 9);
    expect(trimFromDrag(a, "start", 0, 2.63 * 80, 80, true)).toEqual({ trimStart: expect.closeTo(2.63, 9), trimEnd: 8 });
    expect(trimFromDrag(a, "end", 8, -7.99 * 80, 80, true).trimEnd).toBe(0.1);
    expect(trimFromDrag(a, "start", 0, 7.99 * 80, 80, true).trimStart).toBe(7.9);
    expect(trimFromDrag(a, "end", 8, 80, 80, true).trimEnd).toBe(8);
  });
});
