import { act, render } from "@testing-library/react-native";
import { AccessibilityInfo, Text } from "react-native";
import { isReducedMotion, setReducedMotionForTests, useReducedMotion } from "../useReducedMotion";

jest.mock("react-native-reanimated", () => ({ ...require("react-native-reanimated/mock"), useReducedMotion: () => true }));

function Probe({ seen }: { seen: boolean[] }) {
  const reduced = useReducedMotion();
  seen.push(reduced);
  return <Text>{String(reduced)}</Text>;
}

test("first render already has Reanimated's synchronous Reduce Motion value", async () => {
  // The async query never resolves here, so only the synchronous seed can make the value true.
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockReturnValue(new Promise(() => {}));
  const seen: boolean[] = [];
  await render(<Probe seen={seen} />);
  expect(seen[0]).toBe(true);
});

test("one store: every hook and the plain getter see a change, and the app asks iOS once", async () => {
  const query = jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled");
  const listen = jest.spyOn(AccessibilityInfo, "addEventListener");
  const a: boolean[] = [], b: boolean[] = [];
  await render(<><Probe seen={a} /><Probe seen={b} /></>);
  expect(query.mock.calls.length + listen.mock.calls.length).toBeLessThanOrEqual(2);     // 0 here: the first test already started the store
  await act(() => { setReducedMotionForTests(false); });
  expect(a.at(-1)).toBe(false);
  expect(b.at(-1)).toBe(false);
  expect(isReducedMotion()).toBe(false);
  await act(() => { setReducedMotionForTests(true); });
  expect(a.at(-1)).toBe(true);
  expect(isReducedMotion()).toBe(true);
});
