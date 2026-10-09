import { Appearance } from "react-native";

/** The appearances the app can be drawn in. Dark is the only one built so far (`PALETTES` in theme.ts). */
export type AppAppearance = "light" | "dark";

/**
 * The appearance the app is drawn in. The installed app follows the phone (app.json: `"userInterfaceStyle": "automatic"`), but
 * only the dark palette exists, so this answers "dark" whatever the phone says. LIGHT MODE HOOKS IN HERE AND NOWHERE ELSE: when
 * the light palette is built, this function becomes the phone's own setting (and `applyAppearance` stops forcing one).
 */
export function appAppearance(): AppAppearance {
  return "dark";
}

/**
 * Tells iOS which appearance the app wears, so that everything the SYSTEM draws for it (alerts, the photo picker, the keyboard,
 * menus, the status bar) matches what the app draws. Called once, at the top of app/_layout.tsx, before anything is on screen.
 * Never throws: an app that cannot say it still starts.
 */
export function applyAppearance(): void {
  try {
    Appearance.setColorScheme(appAppearance());
  } catch {
    // Nothing to do: the app draws its own dark colours either way.
  }
}
