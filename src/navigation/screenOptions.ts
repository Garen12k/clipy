import type { NativeStackNavigationOptions } from "expo-router";
import type { ExportState } from "@/src/export/useExport";
import { theme } from "@/src/theme/theme";

/**
 * How screens come and go. Expo Router's Stack is the native stack (react-native-screens), and these are its own options — the
 * transitions are iOS's, not ours: nothing here is animated from JavaScript, and nothing re-renders or remounts a screen (the
 * editor's video keeps playing under the Export sheet). This file is pure, so the choices can be tested without mounting the app.
 */
export const STACK_OPTIONS = {
  headerShown: false,
  contentStyle: { backgroundColor: theme.colors.bg },
  /** The standard iOS push: in from the right, back with the swipe. (It was "fade".) */
  animation: "default",
} satisfies NativeStackNavigationOptions;

/** One entry per screen file in app/ (the test checks both ways). */
export const ROUTE_OPTIONS = {
  /** Home. When Post or Accounts were opened by a link there is nothing to go back to and they `replace("/")`: show that as going back. */
  "index": { animationTypeForReplace: "pop" },
  /**
   * The editor: pushed. The back swipe starts at the left edge only — from iOS 26 the whole-screen swipe is on by default, and it
   * would compete with the timeline, the preview's gestures and the sliders. Swiping back is safe: leaving saves (useLoadProject).
   */
  "editor/[id]/index": { fullScreenGestureEnabled: false },
  /** Export: the standard sheet rising from the bottom, closed by swiping down — except while exporting (exportGesture). */
  "editor/[id]/export": { presentation: "modal" },
  /** Post: pushed. Its own leave guard (PostScreenBody) switches the swipe off while uploading. */
  "post": {},
  "accounts": {},
  /** A blank screen that redirects to Accounts: it should not slide in. */
  "oauth": { animation: "none" },
} satisfies Record<string, NativeStackNavigationOptions>;

export type RouteName = keyof typeof ROUTE_OPTIONS;
export const ROUTE_NAMES = Object.keys(ROUTE_OPTIONS) as RouteName[];

/**
 * The Export sheet's swipe-down, per export state. While the video renders, closing the sheet would drop the screen's listener:
 * the render would carry on unseen and its file would never be offered. So the swipe is off (iOS then holds the sheet) and
 * Cancel is the way out; in every other state the sheet closes freely.
 */
export function exportGesture(status: ExportState["status"]): { gestureEnabled: boolean } {
  return { gestureEnabled: status !== "exporting" };
}
