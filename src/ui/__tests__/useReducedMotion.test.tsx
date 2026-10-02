import { render } from "@testing-library/react-native";
import { AccessibilityInfo, Text } from "react-native";
import { useReducedMotion } from "../useReducedMotion";

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
