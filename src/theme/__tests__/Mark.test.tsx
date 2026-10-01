import { render } from "@testing-library/react-native";
import { processColor } from "react-native";
import { Mark } from "../Mark";
import { theme } from "../theme";

test("Mark renders three slashes in the accent color by default", async () => {
  const { getAllByTestId } = await render(<Mark size={32} />);
  const slashes = getAllByTestId("mark-slash");
  expect(slashes).toHaveLength(3);
  // react-native-svg's host component resolves the `stroke` prop through
  // RN's color processing, so the queried host element exposes the
  // processed color rather than the original hex string.
  expect((slashes[0].props.stroke as { payload: number }).payload).toBe(
    processColor(theme.colors.accent),
  );
});

test("theme exposes the core design tokens", () => {
  expect(theme.colors.accent).toBe("#C8102E");
  expect(theme.colors.bg).toBe("#0B0B0D");
  expect(theme.fonts.heading).toBe("Bangers_400Regular");
  expect(theme.projectsWallpaper).toBeNull();
});
