import type { NativeStackNavigationOptions } from "expo-router";
import type { ExportState } from "@/src/export/useExport";
import type { SystemScope } from "@/src/theme/appearance";
import { theme, type AppAppearance } from "@/src/theme/theme";

/**
 * How screens come and go. Expo Router's Stack is the native stack (react-native-screens), and these are its own options — the
 * transitions are iOS's, not ours: nothing here is animated from JavaScript, and nothing re-renders or remounts a screen (the
 * editor's video keeps playing under the Export sheet). This file is pure, so the choices can be tested without mounting the app.
 */
const stack = (appearance: AppAppearance) => ({
  headerShown: false,
  /** What shows under a screen while it comes or goes: the page of every screen that is not the editor — navy, or cream when the phone is light. */
  contentStyle: { backgroundColor: theme.screens[appearance].page },
  /** The standard iOS push: in from the right, back with the swipe. (It was "fade".) */
  animation: "default",
} satisfies NativeStackNavigationOptions);
/**
 * Every screen's options, per appearance: two constant objects, so the Stack is handed a new one only when the phone's setting changes.
 * The editor's entry below overrides the background with its own slate, in both.
 */
export const STACK_OPTIONS = { dark: stack("dark"), light: stack("light") } as const;

/** One entry per screen file in app/ (the test checks both ways). */
export const ROUTE_OPTIONS = {
  /** Home. When Post or Accounts were opened by a link there is nothing to go back to and they `replace("/")`: show that as going back. */
  "index": { animationTypeForReplace: "pop" },
  /**
   * The editor: pushed. The back swipe starts at the left edge only — from iOS 26 the whole-screen swipe is on by default, and it
   * would compete with the timeline, the preview's gestures and the sliders. Swiping back is safe: leaving saves (useLoadProject).
   * Its own background is the editor's slate page, so no navy and no black shows behind it while it slides in or is swiped away.
   */
  "editor/[id]/index": { fullScreenGestureEnabled: false, contentStyle: { backgroundColor: theme.surfaces.editor.page } },
  /** Export: the standard sheet rising from the bottom, closed by swiping down — except while exporting (exportGesture). */
  "editor/[id]/export": { presentation: "modal" },
  /** Post: pushed. Its own leave guard (PostScreenBody) switches the swipe off while uploading. */
  "post": {},
  "accounts": {},
  /** A blank screen that redirects to Accounts: it should not slide in. */
  "oauth": { animation: "none" },
  /**
   * The sign-in page as a ROUTE: opened from Accounts or Post (or by a link). The standard sheet from the bottom, closed by its X,
   * "Not now" or the swipe down — one presentation for every way in, and it reads as a side step that returns to where it was opened.
   * On first launch the same screen is not this route at all: app/index.tsx draws it in place, as the root, with nothing to go back to.
   */
  "welcome": { presentation: "modal" },
  /**
   * The first-launch wizard shown AGAIN ("Show welcome again" on Accounts): it covers the whole screen, as it does on first launch
   * (there it is no route at all — app/index.tsx draws it in place), rises from the bottom and is closed by its X or by finishing.
   */
  "tour": { presentation: "fullScreenModal" },
} satisfies Record<string, NativeStackNavigationOptions>;

export type RouteName = keyof typeof ROUTE_OPTIONS;
export const ROUTE_NAMES = Object.keys(ROUTE_OPTIONS) as RouteName[];

/**
 * What iOS draws for each route while it is the focused one (`SystemScope` in src/theme/appearance.ts). The editor is dark whatever
 * the phone says, so there iOS is told dark — its keyboard, alerts and menus match — and gets its say back on leaving. Export is a
 * sheet of the app's own appearance over the editor: iOS follows the phone again, but the status bar sits over the dimmed editor, so
 * its glyphs stay light. The sign-in sheet rises over a screen of the same appearance: nothing special.
 */
export const SYSTEM_SCOPE = {
  "index": "screen",
  "editor/[id]/index": "editor",
  "editor/[id]/export": "overDark",
  "post": "screen",
  "accounts": "screen",
  "oauth": "screen",
  "welcome": "screen",
  "tour": "screen",
} satisfies Record<RouteName, SystemScope>;

/** The scope of the focused route, from Expo Router's segments (`[]` is Home; a folder's index has no segment of its own). An unknown route is a screen. */
export function scopeOf(segments: readonly string[]): SystemScope {
  const path = segments.join("/");
  const scopes: Record<string, SystemScope> = SYSTEM_SCOPE;
  return scopes[path] ?? scopes[path === "" ? "index" : `${path}/index`] ?? "screen";
}

/**
 * The Export sheet's swipe-down, per export state. While the video renders, closing the sheet would drop the screen's listener:
 * the render would carry on unseen and its file would never be offered. So the swipe is off (iOS then holds the sheet) and
 * Cancel is the way out; in every other state the sheet closes freely.
 */
export function exportGesture(status: ExportState["status"]): { gestureEnabled: boolean } {
  return { gestureEnabled: status !== "exporting" };
}
