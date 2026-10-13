import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";
import { makeClip, makeProject, type Project } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { useToolStrip } from "@/src/editor/toolStrip";
import { useKeyboard } from "@/src/ui/keyboard";
import { useToast } from "@/src/ui/Toast";
import { usePanelPresence } from "@/src/ui/ToolPanel";
import { useStripPresence } from "@/src/ui/ToolStrip";
import { MessageBar } from "../components/MessageBar";

// The undo history kept with the project arrives a moment after the editor is on screen (historyKeeper.ts → the store's
// `restoreHistory`). What that means for a message that is up at that moment — spec §5 "What lights up".
jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));
const st = () => useEditorStore.getState();
const say = useToast.getState().show;
const shown = () => screen.queryByTestId("message-bar");
const named = (name: string): Project => makeProject({ id: "p1", name, clips: [makeClip({ id: "a", sourceDuration: 10 })] });
let announce: jest.SpyInstance;
let loaded: Project;

beforeEach(() => {
  jest.useFakeTimers();
  announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => {});
  useToolStrip.setState({ open: null });
  usePanelPresence.setState({ count: 0, size: "regular" });
  useStripPresence.setState({ count: 0 });
  useKeyboard.setState({ height: 0 });
  useToast.getState().clear();
  st().reset();
  loaded = named("Two");
  st().setProject(loaded);
});
afterEach(() => { announce.mockRestore(); jest.useRealTimers(); });

test("a message with Undo is up when the old history arrives: the history is refused, the message stays, and its Undo undoes its own step only", async () => {
  await render(<MessageBar />);
  await act(() => { st().apply((p) => ({ ...p, name: "Edited" })); say("Cut to 4 beats", { undo: true }); });
  const past = st().past;
  // An edit came first, so the stacks are no longer empty: nothing is restored …
  let restored = true;
  await act(() => { restored = st().restoreHistory(loaded, [named("Zero"), named("One")], [named("Three")]); });
  expect(restored).toBe(false);
  expect(st().past).toBe(past);                                       // … not even the array changes, so the bar hears of nothing
  expect(shown()).not.toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Undo" }));
  expect(st().project).toBe(loaded);                                  // exactly the step the message was about
  expect(st().past).toEqual([]);                                      // and no restored step is there to be undone next
  expect(shown()).toBeNull();
});

test("a message without a step is up when the history arrives: it goes, as with every change of the history", async () => {
  await render(<MessageBar />);
  await act(() => { say("Needs the latest build"); });
  expect(shown()).not.toBeNull();
  let restored = false;
  await act(() => { restored = st().restoreHistory(loaded, [named("Zero")], []); });
  expect(restored).toBe(true);
  expect(shown()).toBeNull();
  expect(st().project).toBe(loaded);
});
