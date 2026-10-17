import { act, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-17T10:00:00.000Z" }));
jest.mock("@/src/editor/captionLanguage", () => ({ fillersSpoken: () => true }));
jest.mock("@/modules/clipy-video", () => ({ isNativeAvailable: () => true, transcribe: jest.fn(), cancelTranscribe: jest.fn() }));
// Count the planner's calls: it is the panel's per-change work (a sort of every caption word and a dry run of the op per clip).
jest.mock("@/src/editor/model/fillers", () => {
  const actual = jest.requireActual("@/src/editor/model/fillers");
  return { ...actual, fillerPlan: jest.fn(actual.fillerPlan) };
});
import { fillerPlan } from "@/src/editor/model/fillers";
import { makeClip, makeOverlay, makeProject, type CaptionWord, type TextOverlay } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { CaptionsSheet } from "../components/CaptionsSheet";

const st = () => useEditorStore.getState();
const plan = fillerPlan as jest.Mock;
const W = (text: string, start: number, end: number): CaptionWord => ({ text, start, end });
const WORDS = [W("so", 0, 0.3), W("um", 0.5, 0.8), W("we", 1, 1.3)];
const cap = (start: number): TextOverlay => makeOverlay({ id: "c", kind: "caption", start, end: start + 3, text: "so um we", words: WORDS });
const sticker = (start: number) => makeOverlay({ id: "s", kind: "text", text: "Hi", start, end: start + 1 });
const load = () => { st().reset(); st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })], overlays: [cap(1), sticker(5)] })); };
/** A drag: one transient project per frame, as `applyTransient` writes them. */
const drag = async () => {
  for (let i = 1; i <= 5; i++) await act(async () => { st().applyTransient((p) => ({ ...p, overlays: [p.overlays[0], sticker(5 + i * 0.1)] })); });
};
beforeEach(() => { plan.mockClear(); });

test("closed panel: no filler work at all, not on the first draw and not on any frame of a drag", async () => {
  load();
  await render(<CaptionsSheet visible={false} onClose={jest.fn()} />);
  await drag();
  expect(plan).toHaveBeenCalledTimes(0);
});

test("open panel: the plan follows the project (and stops the moment the panel is hidden)", async () => {
  load();
  const view = await render(<CaptionsSheet visible onClose={jest.fn()} />);
expect(screen.getByTestId("filler-words")).toBeTruthy();
  expect(plan.mock.calls.length).toBeGreaterThan(0);
  plan.mockClear();
  await drag();
  expect(plan.mock.calls.length).toBeGreaterThan(0);
  await view.rerender(<CaptionsSheet visible={false} onClose={jest.fn()} />);
  plan.mockClear();
  await drag();
  expect(plan).toHaveBeenCalledTimes(0);
});
