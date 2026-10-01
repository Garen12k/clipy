// @testing-library/react-native v14+ auto-registers its jest matchers when
// the main module is imported (e.g. via `render` in a test file), so no
// separate "extend-expect" import is needed here.

jest.mock("expo-font", () => ({ useFonts: () => [true, null], isLoaded: () => true }));
// Music feature deps: harmless defaults so suites that mount EditorToolbar (which always
// renders MusicSheet) don't need to know about them. MusicSheet.test.tsx overrides these
// per-module with jest.mock calls of its own, which take precedence over these.
jest.mock("expo-audio", () => ({
  useAudioPlayer: () => ({ play: () => {}, pause: () => {}, playing: false, replace: () => {} }),
  createAudioPlayer: () => ({ addListener: () => ({ remove: () => {} }), release: () => {} }),
}));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: async () => ({ canceled: true }) }));
jest.mock("expo-asset", () => ({ Asset: { fromModule: () => ({ downloadAsync: async () => {}, localUri: null, uri: "" }) } }));
jest.mock("@react-native-community/slider", () => {
  const { View } = require("react-native");
  return View;
});
jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));
jest.mock("react-native-gesture-handler", () => {
  const View = require("react-native").View;
  return {
    GestureHandlerRootView: View,
    GestureDetector: ({ children }: { children: unknown }) => children,
    Gesture: {
      Pan: () => chain(), Pinch: () => chain(), LongPress: () => chain(), Native: () => chain(),
      Simultaneous: () => chain(), Race: () => chain(), Rotation: () => chain(), Tap: () => chain(),
    },
  };
  function chain(): Record<string, () => unknown> {
    const g: Record<string, () => unknown> = {};
    for (const k of ["onBegin", "onStart", "onUpdate", "onEnd", "onFinalize", "activeOffsetX", "minDistance",
      "activateAfterLongPress", "simultaneousWithExternalGesture", "blocksExternalGesture", "enabled", "hitSlop", "runOnJS",
      "numberOfTaps"]) {
      g[k] = () => g;
    }
    return g;
  }
});
