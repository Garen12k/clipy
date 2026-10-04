import { fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { makeClip, makeKeyframe, makeOverlay, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { ClipThumbStrip } from "../components/ClipThumbStrip";
import { KeyframeDots } from "../components/KeyframeDots";
import { OverlayPill } from "../components/OverlayPill";

beforeEach(() => useEditorStore.getState().reset());

test("KeyframeDots places diamonds at t*pps and drops those outside [0, width]", async () => {
  const onPress = jest.fn();
  await render(<KeyframeDots times={[0, 1, 5]} width={100} pps={50} onPress={onPress} />);
  expect(screen.getByTestId("keyframe-dot-0")).toBeTruthy();
  expect(screen.getByTestId("keyframe-dot-1")).toBeTruthy();
  expect(screen.queryByTestId("keyframe-dot-2")).toBeNull();
  expect(screen.getByTestId("keyframe-dot-0")).toHaveStyle({ left: -4 });       // centred on t·pps (the diamond is 8 wide)
  expect(screen.getByTestId("keyframe-dot-1")).toHaveStyle({ left: 1 * 50 - 4 });
  await fireEvent.press(screen.getByTestId("keyframe-dot-1"));
  expect(onPress).toHaveBeenCalledWith(1);
});

test("a clip at speed 2 shows its pins at half their source distance and a press seeks to the output time", async () => {
  // Source 2…6 at 2× = 2 s on the timeline (100 px at 50 px/s): pins at source 3 and 5 sit at output 0.5 and 1.5; source 9 is outside.
  const clip = clipFixture({ speed: 2 });
  await render(<ClipThumbStrip clip={clip} pixelsPerSecond={50} selected missing={false} onPress={() => {}} />);
  expect(screen.getByLabelText("Clip b")).toHaveStyle({ width: 100 });
  expect(screen.getByTestId("keyframe-dot-0")).toHaveStyle({ left: 0.5 * 50 - 4 });
  expect(screen.getByTestId("keyframe-dot-1")).toHaveStyle({ left: 1.5 * 50 - 4 });
  expect(screen.queryByTestId("keyframe-dot-2")).toBeNull();
  await fireEvent.press(screen.getByTestId("keyframe-dot-1"));
  expect(useEditorStore.getState().playhead).toBe(3 + 1.5);
});

function clipFixture(over = {}) {
  const clip = makeClip({ id: "b", sourceDuration: 10, trimStart: 2, trimEnd: 6, keyframes: [makeKeyframe({ t: 3 }), makeKeyframe({ t: 5 }), makeKeyframe({ t: 9 })], ...over });
  useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 3 }), clip] }));
  return clip;
}

test("selected clip strip shows pins in range and a press seeks to clip start + offset", async () => {
  const clip = clipFixture();
  await render(<ClipThumbStrip clip={clip} pixelsPerSecond={50} selected missing={false} onPress={() => {}} />);
  expect(screen.getByTestId("keyframe-dot-0")).toBeTruthy();
  expect(screen.getByTestId("keyframe-dot-1")).toBeTruthy();
  expect(screen.queryByTestId("keyframe-dot-2")).toBeNull();
  await fireEvent.press(screen.getByTestId("keyframe-dot-1"));
  expect(useEditorStore.getState().playhead).toBe(3 + 3);
  expect(useEditorStore.getState().selectedClipId).toBeNull();
});

test("reversed clip mirrors pin positions", async () => {
  const clip = clipFixture({ reversed: true });
  await render(<ClipThumbStrip clip={clip} pixelsPerSecond={50} selected missing={false} onPress={() => {}} />);
  await fireEvent.press(screen.getByTestId("keyframe-dot-0"));
  // sources 5 then 3 -> offsets 1 then 3; sorted display order index 0 is the first pin (t=3 -> offset 3)
  expect(useEditorStore.getState().playhead).toBe(3 + 3);
});

test("no dots when unselected or without pins", async () => {
  const clip = clipFixture();
  await render(<ClipThumbStrip clip={clip} pixelsPerSecond={50} selected={false} missing={false} onPress={() => {}} />);
  expect(screen.queryByTestId("keyframe-dot-0")).toBeNull();
  const plain = makeClip({ id: "c", sourceDuration: 4 });
  await render(<ClipThumbStrip clip={plain} pixelsPerSecond={50} selected missing={false} onPress={() => {}} />);
  expect(screen.queryByTestId("keyframe-dot-0")).toBeNull();
});

test("selected overlay pill shows pins and press seeks to start + t", async () => {
  const o = makeOverlay({ id: "o1", text: "Hi", start: 2, end: 6, keyframes: [makeKeyframe({ t: 1 })] });
  useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })], overlays: [o] }));
  await render(<OverlayPill overlay={o} selected onPress={() => {}} />);
  await fireEvent.press(screen.getByTestId("keyframe-dot-0"));
  expect(useEditorStore.getState().playhead).toBe(3);
});

test("unselected pill shows none", async () => {
  const o = makeOverlay({ id: "o1", text: "Hi", start: 2, end: 6, keyframes: [makeKeyframe({ t: 1 })] });
  await render(<OverlayPill overlay={o} selected={false} onPress={() => {}} />);
  expect(screen.queryByTestId("keyframe-dot-0")).toBeNull();
});

test("dots do not change the strip or pill width", async () => {
  const clip = clipFixture();
  await render(<ClipThumbStrip clip={clip} pixelsPerSecond={50} selected missing={false} onPress={() => {}} />);
  const withDots = screen.getByLabelText("Clip b");
  expect(withDots).toHaveStyle({ width: 200 });
  const o = makeOverlay({ id: "o1", text: "Hi", start: 2, end: 6, keyframes: [makeKeyframe({ t: 1 })] });
  await render(<OverlayPill overlay={o} selected onPress={() => {}} />);
  expect(screen.getByTestId("overlay-pill-o1")).toHaveStyle({ width: 4 * useEditorStore.getState().pixelsPerSecond });
});
