jest.mock("expo-video-thumbnails", () => ({ getThumbnailAsync: jest.fn(async () => ({ uri: "file:///thumb.jpg" })) }));
import { act, render, screen } from "@testing-library/react-native";
import { makeClip } from "@/src/editor/model/types";
import { ClipThumbStrip } from "../components/ClipThumbStrip";
import { usePauses } from "../pausesState";
import { PAUSE_SHADE, pauseShades } from "../timelineMarks";

const clip = makeClip({ id: "c", sourceDuration: 20, trimStart: 2, trimEnd: 8, speed: 2 });   // 3 s on the timeline

test("pauseShades: each cut through sourceToOutput × zoom, clipped, at least 2 pt, at most 60", () => {
  expect(pauseShades(clip, [[3, 4]], 60)).toEqual([{ x: 30, width: 30 }]);
  expect(pauseShades(clip, [[7.99, 8]], 60)).toEqual([{ x: 178, width: 2 }]);
  expect(pauseShades(clip, [[1, 3]], 60)).toEqual([{ x: 0, width: 30 }]);
  expect(pauseShades(clip, Array.from({ length: 70 }, (_, i) => [2 + i * 0.08, 2.04 + i * 0.08] as const), 60)).toHaveLength(PAUSE_SHADE.most);
  expect(pauseShades(clip, [[3, 4]], 0)).toEqual([]);
});

test("only the clip the open strip is about shows its shades; no touches; gone when cleared", async () => {
  await render(<><ClipThumbStrip clip={clip} pixelsPerSecond={60} selected missing={false} onPress={() => {}} />
    <ClipThumbStrip clip={{ ...clip, id: "d" }} pixelsPerSecond={60} selected={false} missing={false} onPress={() => {}} /></>);
  expect(screen.queryAllByTestId("pause-shade")).toHaveLength(0);
  await act(() => { usePauses.setState({ shades: { clipId: "c", cuts: [[3, 4], [5, 6]] } }); });
  const shades = screen.getAllByTestId("pause-shade");
  expect(shades).toHaveLength(2);
  expect(shades[0].props.pointerEvents).toBe("none");
  await act(() => { usePauses.setState({ shades: null }); });
  expect(screen.queryAllByTestId("pause-shade")).toHaveLength(0);
});
