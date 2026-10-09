import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";
import { withTiming } from "react-native-reanimated";
import { MESSAGE, messageAnchor } from "@/src/editor/messageBar";
import { makeAudioTrack, makeClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { CLIP_AREA_HEIGHT, laneLift, laneModel, timelineFrame } from "@/src/editor/timelineLayout";
import { closeStrip, openStrip, rekeyStrip, useToolStrip } from "@/src/editor/toolStrip";
import { theme } from "@/src/theme/theme";
import { useKeyboard } from "@/src/ui/keyboard";
import { EASE } from "@/src/ui/motion";
import { TOAST_MS, useToast } from "@/src/ui/Toast";
import { TOOLBAR } from "@/src/ui/ToolButton";
import { panelHeight, usePanelPresence } from "@/src/ui/ToolPanel";
import { BAR_HEIGHT, STRIP, TOOL_CARD, useStripPresence } from "@/src/ui/ToolStrip";
import { setReducedMotionForTests } from "@/src/ui/useReducedMotion";
import { MessageBar } from "../components/MessageBar";

jest.mock("react-native-reanimated", () => {
  const m = require("react-native-reanimated/mock");
  return { ...m, withTiming: jest.fn(m.withTiming) };
});
const T = withTiming as jest.Mock;
const st = () => useEditorStore.getState();
const say = useToast.getState().show;
const shown = () => screen.queryByTestId("message-bar");
const undoButton = () => screen.queryByRole("button", { name: "Undo" });
/** One undoable step: the first clip's volume. */
const edit = (volume: number) => st().apply((p) => ({ ...p, clips: p.clips.map((c, i) => (i === 0 ? { ...c, volume } : c)) }));
let announce: jest.SpyInstance;

beforeEach(() => {
  jest.useFakeTimers();
  setReducedMotionForTests(false);
  announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => {});
  useToolStrip.setState({ open: null });
  usePanelPresence.setState({ count: 0, size: "regular" });
  useStripPresence.setState({ count: 0 });
  useKeyboard.setState({ height: 0 });
  useToast.getState().clear();
  st().reset();
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 }), makeClip({ id: "b", sourceDuration: 10 })] }));
  T.mockClear();
});
afterEach(() => { announce.mockRestore(); jest.useRealTimers(); });

describe("what it shows", () => {
  test("nothing while there is no message", async () => {
    await render(<MessageBar />);
    expect(shown()).toBeNull();
  });

  test("the sentence on at most two lines in the body role, on the lifted slate step, with no shadow — and it is read out", async () => {
    await render(<MessageBar />);
    await act(() => say("Nothing more to cut."));
    const words = screen.getByText("Nothing more to cut.");
    expect(words.props.numberOfLines).toBe(2);
    expect(words).toHaveStyle({ fontSize: theme.type.body, color: theme.colors.text });
    expect(screen.getByTestId("message-bar")).toHaveStyle({ backgroundColor: theme.elevation.lifted, minHeight: theme.size.touch, borderRadius: theme.radius.card });
    expect(screen.getByTestId("message-bar").props.style).not.toEqual(expect.arrayContaining([expect.objectContaining({ shadowOpacity: expect.anything() })]));
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith("Nothing more to cut.");
  });

  test("a leading symbol says the kind: a check for something done, an alert for a problem, an i for plain information", async () => {
    await render(<MessageBar />);
    await act(() => say("Plain"));
    expect(screen.getByTestId("message-symbol-plain")).toBeTruthy();
    await act(() => say("Done", { kind: "done" }));
    expect(screen.getByTestId("message-symbol-done")).toBeTruthy();
    expect(screen.queryByTestId("message-symbol-plain")).toBeNull();
    await act(() => say("Wrong", { kind: "problem" }));
    expect(screen.getByTestId("message-symbol-problem")).toBeTruthy();
    expect(screen.queryByTestId("message-symbol-done")).toBeNull();
    // The same ink for all three: the symbol's shape says the kind, never a colour.
    expect(screen.getByTestId("message-symbol-problem")).toHaveStyle({ color: theme.colors.text, fontSize: theme.size.icon.md });
  });

  test("no Undo unless the caller asked for it — a kind alone never brings one", async () => {
    await render(<MessageBar />);
    await act(() => say("Saved", { kind: "done" }));
    expect(undoButton()).toBeNull();
    await act(() => say("Wrong", { kind: "problem" }));
    expect(undoButton()).toBeNull();
    await act(() => say("Cut", { kind: "done", undo: true }));
    expect(undoButton()).toBeTruthy();
    expect(screen.getByText("Undo")).toHaveStyle({ color: theme.colors.accent });
    // 36 pt high with 4 pt of slop each way, inside a bar at least 44 high: a 44-pt target.
    expect(undoButton()).toHaveStyle({ height: theme.size.controlCompact, minWidth: theme.size.touch });
    expect(undoButton()!.props.hitSlop).toEqual({ top: 4, bottom: 4 });
    // The next plain message has none again.
    await act(() => say("Plain"));
    expect(undoButton()).toBeNull();
  });

  test("it takes touches only on Undo: the anchor and the bar are box-none, the words take none", async () => {
    await render(<MessageBar />);
    await act(() => say("Cut", { kind: "done", undo: true }));
    expect(screen.getByTestId("message-anchor").props.pointerEvents).toBe("box-none");
    expect(screen.getByTestId("message-bar").props.pointerEvents).toBe("box-none");
    expect(screen.getByTestId("message-words").props.pointerEvents).toBe("none");
    // The button is the bar's own child, outside the words.
    expect(screen.getByTestId("message-words")).not.toContainElement(undoButton());
  });
});

describe("Undo", () => {
  test("calls the store's undo exactly once, and the bar is gone", async () => {
    const real = st().undo;
    const undo = jest.fn(real);
    useEditorStore.setState({ undo });
    await render(<MessageBar />);
    const before = st().project;
    await act(() => { edit(0.5); say("Cut", { kind: "done", undo: true }); });
    const button = undoButton()!;
    await fireEvent.press(button);
    expect(undo).toHaveBeenCalledTimes(1);
    expect(st().project).toBe(before);
    expect(st().past).toHaveLength(0);
    expect(shown()).toBeNull();
    expect(useToast.getState()).toMatchObject({ message: null, undo: false, kind: null });
    // A second press that was already on its way does nothing.
    await act(() => { button.props.onPress?.(); });
    expect(undo).toHaveBeenCalledTimes(1);
    useEditorStore.setState({ undo: real });
  });

  test("after another edit the old bar and its Undo are gone, so it can never undo a different step", async () => {
    await render(<MessageBar />);
    await act(() => { edit(0.5); say("Cut", { kind: "done", undo: true }); });
    expect(undoButton()).toBeTruthy();
    await act(() => { edit(0.25); });
    expect(shown()).toBeNull();
    expect(undoButton()).toBeNull();
    expect(st().past).toHaveLength(2);
  });
});

describe("how long it stays", () => {
  test("2.5 s without an action: it eases in, eases out over its last moments, and is gone", async () => {
    await render(<MessageBar />);
    await act(() => say("Plain"));
    expect(T).toHaveBeenLastCalledWith(1, { duration: theme.motion.base, easing: EASE });
    await act(() => { jest.advanceTimersByTime(TOAST_MS - theme.motion.fast - 1); });
    expect(T).toHaveBeenCalledTimes(1);
    await act(() => { jest.advanceTimersByTime(1); });
    expect(T).toHaveBeenLastCalledWith(0, { duration: theme.motion.fast, easing: EASE });
    expect(shown()).toBeTruthy();
    await act(() => { jest.advanceTimersByTime(theme.motion.fast); });
    expect(shown()).toBeNull();
  });

  test("5 s with Undo", async () => {
    expect(MESSAGE.undoMs).toBe(5000);
    await render(<MessageBar />);
    await act(() => say("Cut", { kind: "done", undo: true }));
    await act(() => { jest.advanceTimersByTime(TOAST_MS); });
    expect(undoButton()).toBeTruthy();
    await act(() => { jest.advanceTimersByTime(MESSAGE.undoMs - TOAST_MS - 1); });
    expect(undoButton()).toBeTruthy();
    await act(() => { jest.advanceTimersByTime(1); });
    expect(shown()).toBeNull();
  });

  test("a second message takes the first one's place and starts the clock again", async () => {
    await render(<MessageBar />);
    await act(() => say("First"));
    await act(() => { jest.advanceTimersByTime(2000); });
    jest.setSystemTime(Date.now() + 1);
    await act(() => say("Second"));
    expect(screen.queryByText("First")).toBeNull();
    expect(screen.getAllByTestId("message-bar")).toHaveLength(1);
    await act(() => { jest.advanceTimersByTime(TOAST_MS - 1); });
    expect(screen.getByText("Second")).toBeTruthy();
    await act(() => { jest.advanceTimersByTime(1); });
    expect(shown()).toBeNull();
    expect(announce).toHaveBeenCalledTimes(2);
  });

  test("with Reduce Motion: shown and removed without animating", async () => {
    setReducedMotionForTests(true);
    await render(<MessageBar />);
    await act(() => say("Plain"));
    await act(() => { jest.advanceTimersByTime(TOAST_MS - 1); });
    expect(shown()).toBeTruthy();
    await act(() => { jest.advanceTimersByTime(1); });
    expect(shown()).toBeNull();
    expect(T).not.toHaveBeenCalled();
  });
});

describe("what takes it away at once", () => {
  const up = async () => { await act(() => { edit(0.5); say("Cut", { kind: "done", undo: true }); }); expect(shown()).toBeTruthy(); };

  test("a new undoable step, the start of a drag's step, an undo and a redo", async () => {
    await render(<MessageBar />);
    await up();
    await act(() => { edit(0.3); });
    expect(shown()).toBeNull();
    await up();
    await act(() => { st().beginTransaction(); });
    expect(shown()).toBeNull();
    await up();
    await act(() => { st().undo(); });
    expect(shown()).toBeNull();
    await act(() => { say("Plain"); });
    await act(() => { st().redo(); });
    expect(shown()).toBeNull();
  });

  test("playback starting — but not a pause, a seek or a selection", async () => {
    await render(<MessageBar />);
    await act(() => { st().setPlaying(true); });
    await up();
    await act(() => { st().setPlaying(false); st().seek(2); st().select("b"); });
    expect(shown()).toBeTruthy();
    await act(() => { st().setPlaying(true); });
    expect(shown()).toBeNull();
  });

  test("a tool opening, a tool closing and one tool taking another's place — but not a tool re-keyed onto a new selection", async () => {
    await render(<MessageBar />);
    await up();
    await act(() => { openStrip("speed"); });
    expect(shown()).toBeNull();
    await up();
    await act(() => { st().select("b"); rekeyStrip(); });
    expect(shown()).toBeTruthy();
    await act(() => { openStrip("filter"); });
    expect(shown()).toBeNull();
    await up();
    await act(() => { closeStrip(); });
    expect(shown()).toBeNull();
  });

  test("a message said in the same call, right after the tool closed or the edit was applied, stays", async () => {
    await render(<MessageBar />);
    await act(() => { openStrip("speed"); });
    await act(() => { closeStrip(); say("That speed doesn't fit this layer."); });
    expect(shown()).toBeTruthy();
    await act(() => { edit(0.1); say("Cut", { kind: "done", undo: true }); });
    expect(undoButton()).toBeTruthy();
  });

  test("another project being loaded, and leaving the editor", async () => {
    const view = await render(<MessageBar />);
    await up();
    await act(() => { st().setProject(makeProject({ clips: [makeClip({ id: "z", sourceDuration: 3 })] })); });
    expect(shown()).toBeNull();
    await act(() => say("Plain"));
    await view.unmount();
    expect(useToast.getState().message).toBeNull();
    // Nothing of it is left behind: no timer and no subscription takes a later message (another screen's toast) away.
    await act(() => { say("Later"); edit(0.9); openStrip("speed"); });
    await act(() => { jest.advanceTimersByTime(60000); });
    expect(useToast.getState().message).toBe("Later");
  });
});

describe("where it stands", () => {
  // The test safe area has no bottom inset: the bottom area's own padding is its floor, 8.
  const PAD = theme.space.sm;
  const anchor = () => screen.getByTestId("message-anchor");

  test("above the toolbar's capsule, with the capsule's side margin", async () => {
    await render(<MessageBar />);
    await act(() => say("Plain"));
    expect(anchor()).toHaveStyle({ position: "absolute", bottom: PAD + TOOLBAR.height + MESSAGE.gap, left: theme.space.xs, right: theme.space.xs });
    expect(anchor()).toHaveStyle({ bottom: 76 });
    // The band of page colour over the capsule is not enough for it: the rest it takes from the timeline's lowest rows, not from the capsule.
    expect(BAR_HEIGHT - TOOLBAR.height).toBeLessThan(MESSAGE.minHeight);
  });

  test("above an open strip's card, with the card's side margin — in multi-select too", async () => {
    await render(<MessageBar />);
    await act(() => { useStripPresence.setState({ count: 1 }); say("Plain"); });
    expect(anchor()).toHaveStyle({ bottom: PAD + STRIP.height + MESSAGE.gap, left: TOOL_CARD.margin, right: TOOL_CARD.margin });
    expect(anchor()).toHaveStyle({ bottom: 166 });
    // Multi-select's bar never sits on a keyboard: its strip is where it was.
    await act(() => { st().enterMultiSelect(); useKeyboard.setState({ height: 300 }); });
    expect(anchor()).toHaveStyle({ bottom: 166 });
  });

  test("an open panel reaches the play row, so the bar lies inside its card, at the lower edge — never over Play, Undo, Redo and the time", async () => {
    await render(<MessageBar />);
    await act(() => { usePanelPresence.setState({ count: 1, size: "regular" }); say("Plain"); });
    expect(anchor()).toHaveStyle({ bottom: PAD + theme.space.sm, left: TOOL_CARD.margin + theme.space.sm, right: TOOL_CARD.margin + theme.space.sm });
    expect(anchor()).toHaveStyle({ bottom: 16 });
    // Its top edge stays under the panel's header on the smallest phone, for either size.
    for (const size of ["regular", "compact"] as const) expect(16 + MESSAGE.twoLines).toBeLessThan(PAD + panelHeight(size, 667) - 44);
    // With the keyboard the panel stands on it, and so does the bar.
    await act(() => { useKeyboard.setState({ height: 300 }); });
    expect(anchor()).toHaveStyle({ bottom: 300 + theme.space.sm });
  });

  test("the rule as numbers: the safe area, the keyboard under a strip, no keyboard without a tool", () => {
    const base = { panel: false, strip: false, keyboard: 0, multi: false, insetBottom: 34 };
    expect(messageAnchor(base)).toEqual({ bottom: 34 + 64 + 4, side: 4, inside: false });
    expect(messageAnchor({ ...base, strip: true })).toEqual({ bottom: 34 + 154 + 4, side: 8, inside: false });
    expect(messageAnchor({ ...base, panel: true })).toEqual({ bottom: 34 + 8, side: 16, inside: true });
    // A strip that has the keyboard has the timeline's place: nothing is free above it.
    expect(messageAnchor({ ...base, strip: true, keyboard: 291 })).toEqual({ bottom: 291 + 8, side: 16, inside: true });
    // A keyboard that belongs to something else (the rename prompt) moves nothing.
    expect(messageAnchor({ ...base, keyboard: 291 })).toEqual(messageAnchor(base));
    // A hardware keyboard's bar is lower than the safe area: the safe area wins, as in the toolbar.
    expect(messageAnchor({ ...base, panel: true, keyboard: 20 }).bottom).toBe(34 + 8);
  });

  test("two lines stay clear of the play row on a 667-pt-high screen, over the toolbar and over a strip", () => {
    expect(MESSAGE.twoLines).toBe(48);
    const pad = theme.space.sm;   // a 667-pt phone has no home indicator
    for (const project of [
      makeProject({ clips: [makeClip({ id: "a", sourceDuration: 5 })] }),                                                    // no row under the clips
      makeProject({ clips: [makeClip({ id: "a", sourceDuration: 5 })], audioTracks: [makeAudioTrack({ id: "m", sourceDuration: 5 })] }),   // one row
    ]) {
      const model = laneModel(project);
      const timeline = timelineFrame(model, 667).height;
      expect(timeline).toBeGreaterThanOrEqual(CLIP_AREA_HEIGHT);
      // The toolbar: the play row ends where the timeline begins.
      const playRowEnd = pad + BAR_HEIGHT + timeline;
      const top = messageAnchor({ panel: false, strip: false, keyboard: 0, multi: false, insetBottom: 0 }).bottom + MESSAGE.twoLines;
      expect(top).toBe(124);
      expect(playRowEnd - top).toBeGreaterThanOrEqual(84);
      // A strip rises over the rows only (`laneLift`); the rest of its height pushes the timeline up with it.
      const withStrip = pad + STRIP.height - laneLift(model, STRIP.lift) + timeline;
      const topOverStrip = messageAnchor({ panel: false, strip: true, keyboard: 0, multi: false, insetBottom: 0 }).bottom + MESSAGE.twoLines;
      expect(withStrip - topOverStrip).toBeGreaterThanOrEqual(48);
    }
  });
});
