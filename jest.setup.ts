// @testing-library/react-native v14+ auto-registers its jest matchers when
// the main module is imported (e.g. via `render` in a test file), so no
// separate "extend-expect" import is needed here.

jest.mock("expo-font", () => ({ useFonts: () => [true, null], isLoaded: () => true }));
jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));
jest.mock("react-native-gesture-handler", () => {
  const View = require("react-native").View;
  return {
    GestureHandlerRootView: View,
    GestureDetector: ({ children }: { children: unknown }) => children,
    Gesture: {
      Pan: () => chain(), Pinch: () => chain(), LongPress: () => chain(), Native: () => chain(),
      Simultaneous: () => chain(), Race: () => chain(),
    },
  };
  function chain(): Record<string, () => unknown> {
    const g: Record<string, () => unknown> = {};
    for (const k of ["onBegin", "onStart", "onUpdate", "onEnd", "onFinalize", "activeOffsetX", "minDistance",
      "activateAfterLongPress", "simultaneousWithExternalGesture", "blocksExternalGesture", "enabled", "hitSlop"]) {
      g[k] = () => g;
    }
    return g;
  }
});
