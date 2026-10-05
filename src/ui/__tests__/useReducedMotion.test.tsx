import { act, render } from "@testing-library/react-native";
import { AccessibilityInfo, Text } from "react-native";
import { isReducedMotion, setReducedMotionForTests, useReducedMotion } from "../useReducedMotion";

jest.mock("react-native-reanimated", () => ({ ...require("react-native-reanimated/mock"), useReducedMotion: () => true }));

// Spied before the first use of the store in this file, and never cleared: the counts below cover the whole file.
// The query never resolves, so only the synchronous seed (and the tests' own setter) decide the value.
const query = jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockReturnValue(new Promise(() => {}));
const listen = jest.spyOn(AccessibilityInfo, "addEventListener");
const listeners = () => listen.mock.calls.filter(([event]) => (event as string) === "reduceMotionChanged").length;

function Probe({ seen }: { seen: boolean[] }) {
  const reduced = useReducedMotion();
  seen.push(reduced);
  return <Text>{String(reduced)}</Text>;
}

test("first render already has Reanimated's synchronous Reduce Motion value", async () => {
  expect(query).not.toHaveBeenCalled();                                                   // nothing asked before the first use
  expect(listeners()).toBe(0);
  const seen: boolean[] = [];
  await render(<Probe seen={seen} />);
  expect(seen[0]).toBe(true);
  expect(query).toHaveBeenCalledTimes(1);
  expect(listeners()).toBe(1);
});

test("one store: every hook and the plain getter see a change, and the app asks iOS exactly once and listens exactly once", async () => {
  const a: boolean[] = [], b: boolean[] = [];
  await render(<><Probe seen={a} /><Probe seen={b} /></>);
  await act(() => { setReducedMotionForTests(false); });
  expect(a.at(-1)).toBe(false);
  expect(b.at(-1)).toBe(false);
  expect(isReducedMotion()).toBe(false);
  await act(() => { setReducedMotionForTests(true); });
  expect(a.at(-1)).toBe(true);
  expect(isReducedMotion()).toBe(true);
  // Three hooks, two plain reads and several re-renders later: still the one query and the one listener of the first use.
  expect(query).toHaveBeenCalledTimes(1);
  expect(listeners()).toBe(1);
});
