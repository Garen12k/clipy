jest.mock("@/src/editor/soundPeaks", () => ({ listenForPauses: jest.fn(), stopPauses: jest.fn(), heardPauses: jest.fn(() => null) }));
import { act, renderHook } from "@testing-library/react-native";
import { heardPauses, listenForPauses, stopPauses, type PauseListening } from "@/src/editor/soundPeaks";
import { makeClip } from "@/src/editor/model/types";
import { pauseOptions, pauseSaving, usePauseListening } from "../pauseFind";
import { usePauses } from "../pausesState";

const outline = { from: 0, to: 3, levels: new Float32Array(300) };
let finish: (r: PauseListening) => void = () => {};
beforeEach(() => { jest.clearAllMocks(); jest.mocked(listenForPauses).mockImplementation(() => new Promise((r) => { finish = r; })); });

test("the chips' OUTPUT seconds become source seconds through timeline.ts; the pad is the file's", () => {
  const clip = makeClip({ id: "c", sourceDuration: 20, speed: 2 });
  expect(pauseOptions(clip, { gap: "medium", quiet: "noisy" })).toEqual({ minGap: 1.2, minPiece: 0.6, pad: 0.1, quietDb: -25 });
  expect(pauseSaving(clip, [[2, 4], [6, 7]])).toBeCloseTo(1.5, 9);
});

test("the session's choice starts at 0.6 s and Quiet, and no shades", () => {
  expect(usePauses.getState()).toMatchObject({ choice: { gap: "medium", quiet: "quiet" }, shades: null });
});

test("no source: nothing; a source: listening, then ready; unmounting stops it", async () => {
  const { result, rerender, unmount } = await renderHook(({ s }: { s: { uri: string; from: number; to: number } | null }) => usePauseListening(s), { initialProps: { s: null as { uri: string; from: number; to: number } | null } });
  expect(result.current).toBeNull(); expect(listenForPauses).not.toHaveBeenCalled();
  await rerender({ s: { uri: "u", from: 0, to: 3 } });
  expect(result.current).toEqual({ status: "listening" });
  await act(async () => { finish({ status: "ready", outline }); });
  expect(result.current).toEqual({ status: "ready", outline });
  await unmount();
  expect(stopPauses).toHaveBeenCalled();
});

test("an outline already heard is ready at once; a stop while still shown reads as a failure", async () => {
  jest.mocked(heardPauses).mockImplementation((s) => (s.uri === "u" ? outline : null));
  const { result } = await renderHook(() => usePauseListening({ uri: "u", from: 0, to: 3 }));
  expect(result.current).toEqual({ status: "ready", outline });
  const other = await renderHook(() => usePauseListening({ uri: "v", from: 0, to: 3 }));
  await act(async () => { finish({ status: "stopped" }); });
  expect(other.result.current).toEqual({ status: "failed", reason: "failed" });
});
