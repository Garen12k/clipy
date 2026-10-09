import { requireOptionalNativeModule } from "expo-modules-core";
import { StatusBar } from "expo-status-bar";
import { useSyncExternalStore } from "react";
import { Appearance, AppState } from "react-native";
import { EDITOR_APPEARANCE, showAppearance, shownAppearance, theme, type AppAppearance } from "./theme";

export type { AppAppearance };

/**
 * Where the app is, as far as what iOS draws for it goes — said per route in `SYSTEM_SCOPE` (src/navigation/screenOptions.ts):
 * - `screen`: a screen in the app's own appearance. iOS follows the phone, and so do the status bar's glyphs (dark on cream).
 * - `editor`: the editor (and Crop inside it), dark whatever the phone says. iOS is TOLD dark, so its alerts, menus, keyboard and
 *   pickers are dark too; light glyphs.
 * - `overDark`: a screen in the app's appearance with something dark behind the status bar — the navy loading screen, and the
 *   Export sheet over the editor. iOS follows the phone; light glyphs.
 */
export type SystemScope = "screen" | "editor" | "overDark";

/** The loading screen continues the native launch screen, which is navy in both of the phone's settings (app.json): it is drawn dark, and fades to the app. */
export const LAUNCH_APPEARANCE: AppAppearance = "dark";

/** After the editor gives iOS its say back, how long the phone's own setting may take to come through. */
export const SETTLE_MS = 500;

let started = false;
let scope: SystemScope = "overDark";
/** iOS has been told "dark" (the editor is up). */
let told = false;
/** What iOS reports is the phone's own setting — false from the moment it is told "dark" until a moment after it is given its say back. */
let trusting = true;
let settle: ReturnType<typeof setTimeout> | null = null;
let bar: "light" | "dark" | null = null;
let backing: string | null = null;
const listeners = new Set<() => void>();

/** The phone's own setting, as far as it can be known now. Anything but a clear "light" is dark: that is the app the owner had. */
function phoneAppearance(): AppAppearance {
  try {
    return Appearance.getColorScheme() === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

/**
 * The appearance the screens are drawn in: the phone's — light is warm cream, dark is navy. (The editor is not asked: it is
 * `EDITOR_APPEARANCE`, dark in both.) LIGHT MODE HOOKS IN HERE AND NOWHERE ELSE: this file is the only one that asks the phone,
 * the only one that tells iOS anything, and the only writer of the appearance shown (`showAppearance` in theme.ts).
 */
export function appAppearance(): AppAppearance {
  return shownAppearance();
}

/** The screens take the phone's setting, if it is not the one they wear. Everything that reads `useSurfaces()` under the root is drawn again; nothing is remounted. */
function follow(): void {
  const next = phoneAppearance();
  if (next === shownAppearance()) return;
  showAppearance(next);
  dress();
  for (const tell of [...listeners]) tell();
}

function onPhoneChange(): void {
  // In the editor iOS says what it was told ("dark"), and it says nothing when the phone's real setting changes under that: a change
  // made meanwhile is picked up on leaving the editor. The screens under the editor keep the appearance they had — never half of each.
  if (!trusting) return;
  // Going to the background, iOS photographs the app in BOTH appearances and reports each: none of that is the user's choice.
  if (AppState.currentState !== "active") return;
  follow();
}

function start(): void {
  if (started) return;
  started = true;
  showAppearance(phoneAppearance());
  try {
    Appearance.addChangeListener(onPhoneChange);
    AppState.addEventListener("change", (state) => { if (state === "active" && trusting) follow(); });
  } catch {
    // An app that cannot listen still starts, in the appearance the phone had.
  }
}

/** The status bar's glyphs and the colour behind every screen (the root view), for where the app is now. Each is said only when it changes. */
function dress(): void {
  const glyphs = scope !== "screen" || shownAppearance() === "dark" ? "light" : "dark";
  if (glyphs !== bar) {
    bar = glyphs;
    try { StatusBar.setStyle(glyphs, false); } catch { /* the status bar keeps the system's choice */ }
  }
  // Behind a screen of the app's appearance: its page, so nothing navy shows around a cream screen as it is pushed or swiped back. Elsewhere, the navy it always was.
  const behind = scope === "screen" ? theme.screens[shownAppearance()].page : theme.screens[EDITOR_APPEARANCE].page;
  if (behind !== backing) {
    backing = behind;
    try {
      // expo-system-ui looks its native module up the moment it is imported: only load it where the module is.
      if (requireOptionalNativeModule("ExpoSystemUI")) (require("expo-system-ui") as typeof import("expo-system-ui")).setBackgroundColorAsync(behind).catch(() => {});
    } catch {
      // app.json's navy stays behind the app.
    }
  }
}

/**
 * THE one function that tells iOS what the app wears, so that everything the SYSTEM draws for it (alerts, action sheets, the
 * keyboard, the photo picker, the share sheet, menus, the status bar) matches what is on screen. First called at the top of
 * app/_layout.tsx, before anything is drawn — that call also reads the phone's setting, so the first frame already wears it — and
 * then by the layout's `SystemAppearance` whenever the focused route changes. It never changes the palette, and never throws:
 * an app that cannot say it still starts.
 */
export function applyAppearance(next: SystemScope): void {
  start();
  scope = next;
  try {
    if (next === "editor") {
      if (settle !== null) { clearTimeout(settle); settle = null; }
      trusting = false;
      if (!told) { told = true; Appearance.setColorScheme(EDITOR_APPEARANCE); }
    } else if (told) {
      told = false;
      Appearance.setColorScheme("unspecified");
      // iOS answers a moment later, and only if the phone's setting is not what it was told: until then its report is still our own
      // "dark". So nothing it says is believed until the moment has passed; then the phone's setting is read, and followed if it changed
      // while the editor was up.
      settle = setTimeout(() => { settle = null; trusting = true; follow(); }, SETTLE_MS);
    }
  } catch {
    told = false; trusting = true;
  }
  dress();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/**
 * The appearance the screens are drawn in, for the ONE component that hands it down: the root layout, which provides it as
 * `ShownContext` (src/ui/tone.ts). Everything else reads `useSurfaces()`.
 */
export function useShownAppearance(): AppAppearance {
  return useSyncExternalStore(subscribe, shownAppearance);
}
