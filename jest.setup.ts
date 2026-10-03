// @testing-library/react-native v14+ auto-registers its jest matchers when
// the main module is imported (e.g. via `render` in a test file), so no
// separate "extend-expect" import is needed here.

jest.mock("expo-font", () => ({ useFonts: () => [true, null], isLoaded: () => true }));
// Music feature deps: harmless defaults so suites that mount EditorToolbar (which always
// renders MusicSheet) don't need to know about them. MusicSheet.test.tsx overrides these
// per-module with jest.mock calls of its own, which take precedence over these.
jest.mock("expo-audio", () => ({
  useAudioPlayer: () => ({ play: () => {}, pause: () => {}, playing: false, replace: () => {}, seekTo: async () => {}, currentTime: 0, volume: 1 }),
  createAudioPlayer: () => ({ addListener: () => ({ remove: () => {} }), release: () => {} }),
  setAudioModeAsync: jest.fn(async () => {}),
}));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: async () => ({ canceled: true }) }));
jest.mock("expo-asset", () => ({ Asset: { fromModule: () => ({ downloadAsync: async () => {}, localUri: null, uri: "" }) } }));
jest.mock("@react-native-community/slider", () => {
  const { View } = require("react-native");
  return View;
});
// reanimated 4 pulls in react-native-worklets, whose native module does not exist under Jest.
jest.mock("react-native-worklets", () => require("react-native-worklets/lib/module/mock"));
jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));
// react-native-svg's real <Path> parses `fill` into a processColor object (like Mark.tsx's <Line
// stroke=.../> does, see Mark.test.tsx), but StickerView's test reads `props.fill` back as the
// literal hex string it passed in. Keep every other export (Svg, Line, …) real and only stub Path
// with a passthrough host view that keeps its props (fill, d, testID, …) exactly as given.
jest.mock("react-native-svg", () => {
  const real = jest.requireActual("react-native-svg");
  const { createElement } = require("react");
  const { View } = require("react-native");
  const PathPassthrough = (props: unknown) => createElement(View, props as object);
  return Object.assign({}, real, { Path: PathPassthrough, __esModule: true });
});
// Gesture objects chain like the real builders and record their callbacks in `handlers` (composed gestures
// keep their parts in `gestures`); GestureDetector passes its gesture to its single child as a `gesture` prop,
// so a test can read it off the rendered host and drive the callbacks.
jest.mock("react-native-gesture-handler", () => {
  const { View } = require("react-native");
  const { cloneElement, isValidElement } = require("react");
  const compose = (...gestures: unknown[]) => Object.assign(chain(), { gestures });
  return {
    GestureHandlerRootView: View,
    GestureDetector: ({ gesture, children }: { gesture: unknown; children: unknown }) =>
      (isValidElement(children) ? cloneElement(children, { gesture }) : children),
    Gesture: {
      Pan: () => chain(), Pinch: () => chain(), LongPress: () => chain(), Native: () => chain(),
      Simultaneous: compose, Race: compose, Rotation: () => chain(), Tap: () => chain(),
    },
  };
  function chain() {
    const handlers: Record<string, (...args: unknown[]) => unknown> = {};
    const g: Record<string, unknown> = { handlers };
    for (const k of ["onBegin", "onStart", "onUpdate", "onEnd", "onFinalize"]) {
      g[k] = (fn: (...args: unknown[]) => unknown) => { handlers[k] = fn; return g; };
    }
    for (const k of ["activeOffsetX", "minDistance", "activateAfterLongPress", "simultaneousWithExternalGesture",
      "blocksExternalGesture", "enabled", "hitSlop", "runOnJS", "numberOfTaps", "maxPointers"]) {
      g[k] = () => g;
    }
    return g;
  }
});

// The library's official Jest mock: zero insets unless a test wraps in SafeAreaProvider with initialMetrics.
jest.mock("react-native-safe-area-context", () => require("react-native-safe-area-context/jest/mock").default);

jest.mock("expo-linear-gradient", () => {
  const { View } = require("react-native");
  return { LinearGradient: View };
});
jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(async () => {}), notificationAsync: jest.fn(async () => {}),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium" }, NotificationFeedbackType: { Success: "success" },
}));
jest.mock("expo-sqlite/localStorage/install", () => {
  const m = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } };
  return {};
});
jest.mock("expo-apple-authentication", () => {
  const { View } = require("react-native");
  return { isAvailableAsync: jest.fn(async () => true), signInAsync: jest.fn(), AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
    AppleAuthenticationButton: View, AppleAuthenticationButtonType: { SIGN_IN: 0 }, AppleAuthenticationButtonStyle: { WHITE: 0 } };
});
jest.mock("expo-web-browser", () => ({ openAuthSessionAsync: jest.fn() }));
