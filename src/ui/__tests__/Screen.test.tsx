import { render, screen } from "@testing-library/react-native";
import { StyleSheet, Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { theme } from "@/src/theme/theme";
import { Screen, type Edge } from "../Screen";

const metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, bottom: 34, left: 0, right: 0 } };

async function renderScreen(edges?: Edge[]) {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <Screen edges={edges}><Text testID="child">hi</Text></Screen>
    </SafeAreaProvider>,
  );
  return StyleSheet.flatten(screen.getByTestId("child").parent?.props.style) as { paddingTop?: number; paddingBottom?: number };
}

test("pads the top edge by the safe-area inset plus theme spacing by default", async () => {
  const style = await renderScreen();
  expect(style.paddingTop).toBe(59 + theme.space.sm);
  expect(style.paddingBottom).toBeUndefined();
});

test("bottom edge and full-bleed opt-out", async () => {
  expect((await renderScreen(["bottom"])).paddingBottom).toBe(34 + theme.space.sm);
  const bleed = await renderScreen([]);
  expect(bleed.paddingTop).toBeUndefined();
  expect(bleed.paddingBottom).toBeUndefined();
});
