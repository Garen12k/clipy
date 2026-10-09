import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative, sep } from "path";

const root = join(__dirname, "..", "..", "..");

jest.mock("expo-status-bar", () => ({ StatusBar: { setStyle: jest.fn() } }));
jest.mock("expo-system-ui", () => ({ setBackgroundColorAsync: jest.fn(async () => {}) }));
jest.mock("expo-modules-core", () => ({ ...jest.requireActual("expo-modules-core"), requireOptionalNativeModule: jest.fn((name: string) => (name === "ExpoSystemUI" ? {} : null)) }));

type Scheme = "light" | "dark" | "unspecified" | null;

/** A fresh copy of the module (its state is the app's, for the life of the app) on a phone with the given setting. */
function boot(phone: Scheme, app: "active" | "background" | "inactive" = "active") {
  jest.resetModules();
  const RN = require("react-native") as typeof import("react-native");
  const state = { phone, reported: phone as Scheme, app };
  const changes: (() => void)[] = [];
  const actives: ((s: string) => void)[] = [];
  jest.spyOn(RN.Appearance, "getColorScheme").mockImplementation(() => state.reported as never);
  // What React Native does: telling iOS a scheme makes that the reported one; "unspecified" reads iOS again — which, for a moment, still says what it was told.
  const set = jest.spyOn(RN.Appearance, "setColorScheme").mockImplementation((s) => { if (s !== "unspecified") state.reported = s as Scheme; });
  jest.spyOn(RN.Appearance, "addChangeListener").mockImplementation((l) => { changes.push(l as () => void); return { remove() {} } as never; });
  jest.spyOn(RN.AppState, "addEventListener").mockImplementation(((_: string, l: (s: string) => void) => { actives.push(l); return { remove() {} }; }) as never);
  Object.defineProperty(RN.AppState, "currentState", { configurable: true, get: () => state.app });
  const ap = require("../appearance") as typeof import("../appearance");
  const th = require("../theme") as typeof import("../theme");
  const bar = (require("expo-status-bar") as { StatusBar: { setStyle: jest.Mock } }).StatusBar.setStyle;
  const backing = (require("expo-system-ui") as { setBackgroundColorAsync: jest.Mock }).setBackgroundColorAsync;
  return {
    ap, th, set, bar, backing, state,
    /** iOS reports a scheme (the phone's setting changed, or it answers what it was told). */
    report(s: Scheme) { state.reported = s; for (const l of changes) l(); },
    comeBack() { state.app = "active"; for (const l of actives) l("active"); },
  };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

test("at launch the app wears the phone's setting before anything is drawn — and iOS is told nothing: it follows the phone by itself", () => {
  const light = boot("light");
  expect(light.ap.appAppearance()).toBe("dark");                    // nothing asked the phone yet: the module does nothing on import
  light.ap.applyAppearance("overDark");                             // the top of app/_layout.tsx
  expect(light.ap.appAppearance()).toBe("light");
  expect(light.th.theme.screen).toBe(light.th.theme.screens.light);
  expect(light.set).not.toHaveBeenCalled();
  // The navy loading screen is up: light glyphs, navy behind.
  expect(light.bar.mock.calls).toEqual([["light", false]]);
  expect(light.backing.mock.calls).toEqual([["#0A1B33"]]);

  const dark = boot("dark");
  dark.ap.applyAppearance("overDark");
  expect(dark.ap.appAppearance()).toBe("dark");
  expect(dark.th.theme.screen).toBe(dark.th.theme.screens.dark);
  expect(dark.set).not.toHaveBeenCalled();
});

test("a phone that does not say (an old iOS, a test) is dark: the app the owner had", () => {
  for (const phone of [null, "unspecified"] as const) {
    const t = boot(phone);
    t.ap.applyAppearance("screen");
    expect(t.ap.appAppearance()).toBe("dark");
    expect(t.bar.mock.calls).toEqual([["light", false]]);
  }
});

test("the status bar and the colour behind the screens: dark glyphs on cream, light glyphs on navy, in the editor and over the dimmed editor — each said once, never animated", () => {
  const t = boot("light");
  t.ap.applyAppearance("overDark");
  t.ap.applyAppearance("screen");                                   // Home
  expect(t.bar.mock.calls).toEqual([["light", false], ["dark", false]]);
  expect(t.backing.mock.calls).toEqual([["#0A1B33"], ["#F7F1E3"]]);
  t.ap.applyAppearance("screen");                                   // Post, Accounts: nothing to say again
  expect(t.bar).toHaveBeenCalledTimes(2);
  expect(t.backing).toHaveBeenCalledTimes(2);
  t.ap.applyAppearance("editor");
  expect(t.bar.mock.calls[2]).toEqual(["light", false]);
  expect(t.backing.mock.calls[2]).toEqual(["#0A1B33"]);
  t.ap.applyAppearance("overDark");                                 // Export, over the editor: still light glyphs — no flicker on the way
  expect(t.bar).toHaveBeenCalledTimes(3);
  t.ap.applyAppearance("editor");
  expect(t.bar).toHaveBeenCalledTimes(3);
  t.ap.applyAppearance("screen");
  expect(t.bar.mock.calls[3]).toEqual(["dark", false]);

  const dark = boot("dark");
  for (const s of ["overDark", "screen", "editor", "overDark", "screen"] as const) dark.ap.applyAppearance(s);
  expect(dark.bar.mock.calls).toEqual([["light", false]]);          // a dark phone: light glyphs throughout
  expect(dark.backing.mock.calls).toEqual([["#0A1B33"]]);
});

test("the editor: iOS is told dark while it is up, once, and given its say back on leaving — the palette never hears of it", () => {
  const t = boot("light");
  t.ap.applyAppearance("screen");
  const told = jest.fn();
  // `useShownAppearance` is this store: subscribe as React does.
  const React = require("react") as typeof import("react");
  const sync = jest.spyOn(React, "useSyncExternalStore").mockImplementation(((sub: (l: () => void) => () => void, get: () => unknown) => { sub(told); return get(); }) as never);
  expect(t.ap.useShownAppearance()).toBe("light");
  sync.mockRestore();

  t.ap.applyAppearance("editor");
  expect(t.set.mock.calls).toEqual([["dark"]]);
  t.report("dark");                                                 // iOS answers what it was told
  expect(t.ap.appAppearance()).toBe("light");                       // Home, under the editor, is still cream
  expect(told).not.toHaveBeenCalled();
  t.ap.applyAppearance("editor");                                   // a re-focus says nothing twice
  expect(t.set).toHaveBeenCalledTimes(1);

  t.ap.applyAppearance("overDark");                                 // Export: the sheet is the app's appearance, so iOS follows the phone again
  expect(t.set.mock.calls[1]).toEqual(["unspecified"]);
  t.ap.applyAppearance("editor");                                   // … and back: told dark again, although the moment had not passed
  expect(t.set.mock.calls[2]).toEqual(["dark"]);
  jest.advanceTimersByTime(t.ap.SETTLE_MS * 2);
  expect(t.ap.appAppearance()).toBe("light");                       // the cancelled moment read nothing

  t.ap.applyAppearance("screen");                                   // back on Home
  expect(t.set.mock.calls[3]).toEqual(["unspecified"]);
  expect(t.ap.appAppearance()).toBe("light");                       // iOS still reports our "dark" for a moment: not believed
  t.report("light");                                                // the phone's own setting comes through
  jest.advanceTimersByTime(t.ap.SETTLE_MS);
  expect(t.ap.appAppearance()).toBe("light");
  expect(told).not.toHaveBeenCalled();
  expect(t.set).toHaveBeenCalledTimes(4);
});

test("the phone's setting changes while the app runs: on a screen it is followed at once; in the editor it waits until the editor is left", () => {
  const t = boot("light");
  t.ap.applyAppearance("screen");
  const told = jest.fn();
  const React = require("react") as typeof import("react");
  const sync = jest.spyOn(React, "useSyncExternalStore").mockImplementation(((sub: (l: () => void) => () => void, get: () => unknown) => { sub(told); return get(); }) as never);
  t.ap.useShownAppearance();
  sync.mockRestore();

  t.report("dark");                                                 // sunset, on Home
  expect(t.ap.appAppearance()).toBe("dark");
  expect(t.th.theme.screen).toBe(t.th.theme.screens.dark);
  expect(told).toHaveBeenCalledTimes(1);
  expect(t.bar.mock.calls.at(-1)).toEqual(["light", false]);
  expect(t.backing.mock.calls.at(-1)).toEqual(["#0A1B33"]);
  t.report("dark");                                                 // the same again: nothing is drawn twice
  expect(told).toHaveBeenCalledTimes(1);
  t.report("light");
  expect(t.ap.appAppearance()).toBe("light");
  expect(told).toHaveBeenCalledTimes(2);
  expect(t.bar.mock.calls.at(-1)).toEqual(["dark", false]);
  expect(t.set).not.toHaveBeenCalled();                             // following the phone never tells iOS anything

  // In the editor (iOS told dark) the phone turns dark for real: iOS has nothing new to report, and nothing changes.
  t.ap.applyAppearance("editor");
  t.report("dark");
  expect(t.ap.appAppearance()).toBe("light");
  expect(told).toHaveBeenCalledTimes(2);
  // Leaving: the say goes back; when the moment has passed the phone's setting is read — dark — and the screens follow.
  t.ap.applyAppearance("screen");
  expect(t.ap.appAppearance()).toBe("light");
  jest.advanceTimersByTime(t.ap.SETTLE_MS - 1);
  expect(t.ap.appAppearance()).toBe("light");
  jest.advanceTimersByTime(1);
  expect(t.ap.appAppearance()).toBe("dark");
  expect(told).toHaveBeenCalledTimes(3);
  expect(t.bar.mock.calls.at(-1)).toEqual(["light", false]);
});

test("going to the background iOS reports both appearances (its two snapshots): ignored; coming back, the phone's setting is read", () => {
  const t = boot("light");
  t.ap.applyAppearance("screen");
  t.state.app = "background";
  t.report("dark"); t.report("light"); t.report("dark");
  expect(t.ap.appAppearance()).toBe("light");
  t.state.reported = "light";
  t.comeBack();
  expect(t.ap.appAppearance()).toBe("light");
  // The setting really was changed while the app was away.
  t.state.app = "background";
  t.report("dark");
  t.comeBack();
  expect(t.ap.appAppearance()).toBe("dark");
  // Coming back INTO the editor reads nothing: what iOS says there is what it was told.
  const e = boot("light");
  e.ap.applyAppearance("screen");
  e.ap.applyAppearance("editor");
  e.state.app = "background";
  e.comeBack();
  expect(e.ap.appAppearance()).toBe("light");
});

test("an app that cannot ask, say or listen still starts — dark, as it always was", () => {
  const t = boot("light");
  const RN = require("react-native") as typeof import("react-native");
  jest.spyOn(RN.Appearance, "getColorScheme").mockImplementation(() => { throw new Error("no native appearance"); });
  jest.spyOn(RN.Appearance, "setColorScheme").mockImplementation(() => { throw new Error("no native appearance"); });
  jest.spyOn(RN.Appearance, "addChangeListener").mockImplementation(() => { throw new Error("no native appearance"); });
  t.bar.mockImplementation(() => { throw new Error("no status bar"); });
  t.backing.mockImplementation(() => { throw new Error("no system ui"); });
  for (const s of ["overDark", "screen", "editor", "screen"] as const) expect(() => t.ap.applyAppearance(s)).not.toThrow();
  expect(t.ap.appAppearance()).toBe("dark");
});

test("in an app without the system-ui module (an older build) the package is never loaded", () => {
  const t = boot("light");
  (require("expo-modules-core") as { requireOptionalNativeModule: jest.Mock }).requireOptionalNativeModule.mockReturnValue(null);
  t.ap.applyAppearance("screen");
  expect(t.backing).not.toHaveBeenCalled();
  expect(t.ap.appAppearance()).toBe("light");
});

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== "__tests__" && name !== "node_modules" && name !== "testing") walk(p, out); }
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}
const files = () => ["src", "app"].flatMap((d) => walk(join(root, d))).map((f) => ({ rel: relative(root, f).split(sep).join("/"), src: readFileSync(f, "utf8") }));
const who = (re: RegExp) => files().filter(({ src }) => re.test(src)).map((f) => f.rel).sort();

test("ONE place: only appearance.ts asks the phone, tells iOS, sets the status bar or the root colour, or writes the appearance shown", () => {
  const OWN = "src/theme/appearance.ts";
  expect(who(/\bAppearance\.(getColorScheme|setColorScheme|addChangeListener)\b/)).toEqual([OWN]);
  expect(who(/\buseColorScheme\b/)).toEqual([]);
  expect(who(/from "expo-status-bar"|require\("expo-status-bar"\)|\bStatusBar\b/)).toEqual([OWN]);
  expect(who(/expo-system-ui/)).toEqual([OWN]);
  expect(who(/\bshowAppearance\(/)).toEqual([OWN, "src/theme/theme.ts"]);
  const own = readFileSync(join(root, OWN), "utf8");
  expect(own.split("setColorScheme(").length - 1).toBe(2);          // "dark" for the editor, "unspecified" on leaving it
  expect(own).not.toMatch(/setColorScheme\("light"\)/);              // the app never forces light: light is the phone's
  expect(own).not.toMatch(/import .* from "expo-system-ui"/);        // loaded lazily, behind the check for its native module
  // The store is read by the root layout alone; everything else reads `useSurfaces()`.
  expect(who(/\buseShownAppearance\(/)).toEqual(["app/_layout.tsx", OWN]);
  expect(who(/ShownContext\.Provider/)).toEqual(["app/_layout.tsx"]);
});

test("the layout says it first — before the splash is held, before anything is drawn — and then only as the focused route changes", () => {
  const layout = readFileSync(join(root, "app", "_layout.tsx"), "utf8");
  expect(layout.split("applyAppearance(").length - 1).toBe(2);
  expect(layout.indexOf('applyAppearance("overDark");')).toBeGreaterThan(-1);
  expect(layout.indexOf('applyAppearance("overDark");')).toBeLessThan(layout.indexOf("SplashScreen.preventAutoHideAsync()"));
  expect(layout.indexOf('applyAppearance("overDark");')).toBeLessThan(layout.indexOf("export default function RootLayout"));
  expect(layout).toContain("useEffect(() => { applyAppearance(next); }, [next]);");
  expect(who(/\bapplyAppearance\(/)).toEqual(["app/_layout.tsx", "src/theme/appearance.ts"]);
  // No wrapper view, no key: the Stack sits where it always sat, under a provider that draws nothing.
  expect(layout).not.toMatch(/<Stack\s[^>]*\bkey=/);
  expect(layout).not.toMatch(/key=\{shown\}/);
});

test("the installed app follows the phone, and what is behind the app while it starts is navy in both settings", () => {
  const app = JSON.parse(readFileSync(join(root, "app.json"), "utf8")).expo;
  expect(app.userInterfaceStyle).toBe("automatic");
  expect(app.backgroundColor).toBe("#0A1B33");                       // the root view (needs expo-system-ui, a dependency)
  expect(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).dependencies["expo-system-ui"]).toBeDefined();
  expect(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).dependencies["expo-status-bar"]).toBeDefined();
  const splash = (app.plugins as unknown[]).find((p) => Array.isArray(p) && p[0] === "expo-splash-screen") as [string, { backgroundColor: string; dark: { backgroundColor: string; image: string } }];
  expect(splash[1].backgroundColor).toBe("#0A1B33");
  expect(splash[1].dark).toEqual({ image: "./assets/splash-icon.png", backgroundColor: "#0A1B33" });
  // So the loading screen, which continues the launch screen, is drawn navy whatever the phone says.
  expect((require("../appearance") as typeof import("../appearance")).LAUNCH_APPEARANCE).toBe("dark");
});
