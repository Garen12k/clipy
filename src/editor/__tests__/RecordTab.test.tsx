import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo, StyleSheet } from "react-native";
import type { VoiceRecorder } from "../useVoiceRecorder";
const mockRec: VoiceRecorder = { state: "idle", elapsed: 0, count: 0, begin: jest.fn(), cancelCount: jest.fn(), start: jest.fn(async () => {}), stop: jest.fn(async () => {}), cancel: jest.fn(async () => {}) };
let mockRenders = 0;
jest.mock("../useVoiceRecorder", () => ({ useVoiceRecorder: () => { mockRenders++; return mockRec; } }));
import { theme } from "@/src/theme/theme";
import { ToneContext } from "@/src/ui/tone";
import { unruled } from "@/src/ui/testing/textSize";
import { METER, RecordTab } from "../components/RecordTab";
import { VOICE_LEVEL } from "../model/voiceLevel";
import { useVoiceLive } from "../voiceLive";

const btn = (name: string) => screen.getByRole("button", { name });
const HINT = "Plays your video while you talk. Other sound is muted while recording.";
const QUIET = "Too quiet — check the microphone";
// The meter is hidden from VoiceOver, so the queries must be told to look at it.
const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style);
const flatOf = (node: { props: { style?: unknown } }) => StyleSheet.flatten(node.props.style as never) as Record<string, unknown>;
const tab = (guard?: { current: (() => boolean) | null }) => <ToneContext.Provider value="editor"><RecordTab onDone={() => {}} closeGuard={guard} /></ToneContext.Provider>;
const level = (bars: number, quiet = false) => act(async () => { useVoiceLive.getState().setLevel(bars, quiet); });
let announce: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(mockRec, { state: "idle", elapsed: 0, count: 0 });
  useVoiceLive.getState().reset();
  mockRenders = 0;
  announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => {});
});
afterEach(() => { announce.mockRestore(); });

test("idle: a record button, 0:00 and the hint; pressing begins the countdown — it does not start recording", async () => {
  await render(tab());
  expect(screen.getByText("0:00")).toBeTruthy();
  expect(screen.getByText(HINT)).toBeTruthy();
  expect(screen.queryByText("Recording…")).toBeNull();
  expect(screen.queryByText("Get ready")).toBeNull();
  expect(btn("Start recording")).toBeEnabled();
  expect(flat("record-button")).toMatchObject({ backgroundColor: theme.colors.danger, borderColor: theme.colors.text });
  await fireEvent.press(btn("Start recording"));
  expect(mockRec.begin).toHaveBeenCalledTimes(1);
  expect(mockRec.start).not.toHaveBeenCalled();
  expect(mockRec.stop).not.toHaveBeenCalled();
  expect(announce).not.toHaveBeenCalled();
});

test("counting: the number in a red outline ring with no fill, the timer 0:00 and muted, “Get ready”; pressing cancels", async () => {
  Object.assign(mockRec, { state: "counting", count: 3 });
  const view = await render(tab());
  const button = btn("Cancel countdown");
  expect(button).toBeEnabled();
  expect(flat("record-button")).toMatchObject({ backgroundColor: "transparent", borderColor: theme.colors.danger, opacity: 1 });
  expect(flatOf(screen.getByText("3"))).toMatchObject({ color: theme.colors.text });
  expect(flatOf(screen.getByText("0:00"))).toMatchObject({ color: theme.colors.textMuted });
  expect(screen.getByText("Get ready")).toBeTruthy();
  expect(screen.queryByTestId("voice-meter-bar-0", { includeHiddenElements: true })).toBeNull();
  Object.assign(mockRec, { count: 2 });
  await view.rerender(tab());
  expect(screen.getByText("2")).toBeTruthy();
  expect(screen.queryByText("3")).toBeNull();
  await fireEvent.press(btn("Cancel countdown"));
  expect(mockRec.cancelCount).toHaveBeenCalledTimes(1);
  expect(mockRec.begin).not.toHaveBeenCalled();
  expect(mockRec.start).not.toHaveBeenCalled();
  expect(mockRec.stop).not.toHaveBeenCalled();
});

test("counting: each number is said to VoiceOver once, as it appears; nothing is said in any other state", async () => {
  Object.assign(mockRec, { state: "counting", count: 3 });
  const view = await render(tab());
  expect(announce.mock.calls).toEqual([["3"]]);
  await view.rerender(tab());
  expect(announce).toHaveBeenCalledTimes(1);
  Object.assign(mockRec, { count: 2 });
  await view.rerender(tab());
  Object.assign(mockRec, { count: 1 });
  await view.rerender(tab());
  expect(announce.mock.calls).toEqual([["3"], ["2"], ["1"]]);
  Object.assign(mockRec, { state: "recording", count: 0 });
  await view.rerender(tab());
  Object.assign(mockRec, { state: "idle" });
  await view.rerender(tab());
  expect(announce).toHaveBeenCalledTimes(3);
});

test("the timer is in the label colour outside the countdown", async () => {
  await render(tab());
  expect(flatOf(screen.getByText("0:00"))).toMatchObject({ color: theme.colors.text });
});

test("recording: a stop button, the elapsed time and “Recording…”; pressing stops", async () => {
  Object.assign(mockRec, { state: "recording", elapsed: 65.4 });
  await render(tab());
  expect(screen.getByText("1:05")).toBeTruthy();
  expect(screen.getByText("Recording…")).toBeTruthy();
  expect(flat("record-button")).toMatchObject({ backgroundColor: theme.colors.danger, borderColor: theme.colors.text });
  await fireEvent.press(btn("Stop recording"));
  expect(mockRec.stop).toHaveBeenCalledTimes(1);
  expect(mockRec.start).not.toHaveBeenCalled();
  expect(mockRec.begin).not.toHaveBeenCalled();
});

test("the button is disabled while starting and while saving", async () => {
  Object.assign(mockRec, { state: "starting" });
  const view = await render(tab());
  expect(btn("Start recording")).toBeDisabled();
  Object.assign(mockRec, { state: "saving", elapsed: 3 });
  await view.rerender(tab());
  expect(btn("Stop recording")).toBeDisabled();
  expect(screen.getByText("Saving…")).toBeTruthy();
});

test("the close guard: free to close when idle; while recording it stops instead; while starting / saving it just holds", async () => {
  const guard: { current: (() => boolean) | null } = { current: null };
  const view = await render(tab(guard));
  expect(guard.current!()).toBe(false);
  Object.assign(mockRec, { state: "recording" });
  await view.rerender(tab(guard));
  expect(guard.current!()).toBe(true);
  expect(mockRec.stop).toHaveBeenCalledTimes(1);
  Object.assign(mockRec, { state: "saving" });
  await view.rerender(tab(guard));
  expect(guard.current!()).toBe(true);
  expect(mockRec.stop).toHaveBeenCalledTimes(1);
  Object.assign(mockRec, { state: "starting" });
  await view.rerender(tab(guard));
  expect(guard.current!()).toBe(true);
  expect(mockRec.cancelCount).not.toHaveBeenCalled();
  await view.unmount();
  expect(guard.current).toBeNull();
});

test("the close guard while counting: the countdown is cancelled and the host may close — a countdown is not a recording", async () => {
  const guard: { current: (() => boolean) | null } = { current: null };
  Object.assign(mockRec, { state: "counting", count: 2 });
  await render(tab(guard));
  expect(guard.current!()).toBe(false);
  expect(mockRec.cancelCount).toHaveBeenCalledTimes(1);
  expect(mockRec.stop).not.toHaveBeenCalled();
});

describe("the level meter", () => {
  const bars = () => Array.from({ length: VOICE_LEVEL.bars }, (_, i) => flat(`voice-meter-bar-${i}`).backgroundColor);
  const lit = (n: number) => Array.from({ length: VOICE_LEVEL.bars }, (_, i) => (i < n ? theme.colors.text : theme.colors.track));

  test("its row is there, at one height, in every state — the bars only while recording", async () => {
    const view = await render(tab());
    for (const state of ["idle", "counting", "starting", "recording", "saving"] as const) {
      Object.assign(mockRec, { state, count: state === "counting" ? 3 : 0 });
      await view.rerender(tab());
      expect(flat("voice-meter")).toMatchObject({ height: METER.height });
      expect(screen.queryAllByTestId(/^voice-meter-bar-/, { includeHiddenElements: true })).toHaveLength(state === "recording" ? 8 : 0);
    }
  });

  test("the layout around it is the same list of rows in every state: timer, button, meter, line, hint", async () => {
    const shape = () => { const json = screen.toJSON() as unknown as { children: unknown[]; props: { style: unknown } }; return { rows: json.children.length, style: StyleSheet.flatten(json.props.style as never) }; };
    const view = await render(<RecordTab onDone={() => {}} />);
    const idle = shape();
    expect(idle.rows).toBe(5);
    for (const state of ["counting", "starting", "recording", "saving"] as const) {
      Object.assign(mockRec, { state, count: state === "counting" ? 1 : 0 });
      await view.rerender(<RecordTab onDone={() => {}} />);
      expect(shape()).toEqual(idle);
    }
  });

  test("bars at or below the level are lit (the label colour), the rest dim (the track colour) — plain style values", async () => {
    Object.assign(mockRec, { state: "recording" });
    await render(tab());
    expect(bars()).toEqual(lit(0));
    await level(3);
    expect(bars()).toEqual(lit(3));
    await level(8);
    expect(bars()).toEqual(lit(8));
    await level(0);
    expect(bars()).toEqual(lit(0));
    for (let i = 0; i < 8; i++) expect(flat(`voice-meter-bar-${i}`)).toMatchObject({ width: METER.bar, height: METER.height });
    expect(theme.colors.track).not.toBe(theme.colors.hairline);
  });

  test("VoiceOver does not read the meter", async () => {
    Object.assign(mockRec, { state: "recording" });
    await render(tab());
    expect(screen.getByTestId("voice-meter", { includeHiddenElements: true }).props).toMatchObject({ accessibilityElementsHidden: true, importantForAccessibility: "no-hide-descendants" });
  });

  test("“Too quiet — check the microphone” takes the place of “Recording…” while the level says so, and gives it back", async () => {
    Object.assign(mockRec, { state: "recording" });
    await render(tab());
    expect(screen.getByText("Recording…")).toBeTruthy();
    await level(0, true);
    expect(screen.getByText(QUIET)).toBeTruthy();
    expect(screen.queryByText("Recording…")).toBeNull();
    await level(4, false);
    expect(screen.getByText("Recording…")).toBeTruthy();
    expect(screen.queryByText(QUIET)).toBeNull();
  });

  test("the quiet line is only ever a recording's: saving, counting and idle keep their own words", async () => {
    await act(async () => { useVoiceLive.getState().setLevel(0, true); });
    const view = await render(tab());
    for (const [state, words] of [["saving", "Saving…"], ["counting", "Get ready"]] as const) {
      Object.assign(mockRec, { state, count: 1 });
      await view.rerender(tab());
      expect(screen.getByText(words)).toBeTruthy();
      expect(screen.queryByText(QUIET)).toBeNull();
    }
  });

  test("PROOF — a level change draws the meter (and the line) again, never the tab: the recorder hook is not read again", async () => {
    Object.assign(mockRec, { state: "recording", elapsed: 2 });
    await render(tab());
    const before = mockRenders;
    expect(before).toBeGreaterThan(0);
    for (const n of [1, 5, 8, 2, 0]) await level(n);
    await level(0, true);
    await level(6, false);
    expect(bars()).toEqual(lit(6));
    expect(mockRenders).toBe(before);
  });

  test("the same level twice is not a change", async () => {
    const seen: number[] = [];
    const off = useVoiceLive.subscribe((s) => { seen.push(s.bars); });
    useVoiceLive.getState().setLevel(4, false);
    useVoiceLive.getState().setLevel(4, false);
    useVoiceLive.getState().setLevel(4, false);
    off();
    expect(seen).toEqual([4]);
  });
});

test("text size: every text is ruled by the kit (the editor's cap), in every state", async () => {
  const view = await render(tab());
  for (const state of ["idle", "counting", "recording", "saving"] as const) {
    Object.assign(mockRec, { state, count: state === "counting" ? 3 : 0 });
    await view.rerender(tab());
    expect(unruled()).toEqual([]);
  }
});
