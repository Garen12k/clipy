import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join, relative, sep } from "path";
import { theme } from "@/src/theme/theme";
import { exportGesture, ROUTE_NAMES, ROUTE_OPTIONS, scopeOf, STACK_OPTIONS, SYSTEM_SCOPE } from "../screenOptions";

const APP = join(__dirname, "..", "..", "..", "app");
/** The native-stack options this app uses, and the values react-native-screens knows for them (node_modules/react-native-screens/lib/typescript/types.d.ts). */
const KNOWN: Record<string, readonly unknown[] | null> = {
  headerShown: [true, false], contentStyle: null,
  animation: ["default", "fade", "fade_from_bottom", "flip", "none", "simple_push", "slide_from_bottom", "slide_from_right", "slide_from_left", "ios_from_right", "ios_from_left"],
  presentation: ["card", "modal", "transparentModal", "containedModal", "containedTransparentModal", "fullScreenModal", "formSheet", "pageSheet"],
  gestureEnabled: [true, false], fullScreenGestureEnabled: [true, false], animationTypeForReplace: ["push", "pop"],
};

function screens(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) screens(p, out);
    else if (/\.tsx$/.test(name) && name !== "_layout.tsx") out.push(relative(APP, p).split(sep).join("/").replace(/\.tsx$/, ""));
  }
  return out;
}

test("every screen: no header, its own page behind it — navy, or cream when the phone is light — and the standard iOS transition, not a fade", () => {
  expect(STACK_OPTIONS.dark).toEqual({ headerShown: false, contentStyle: { backgroundColor: "#0A1B33" }, animation: "default" });
  expect(STACK_OPTIONS.light).toEqual({ headerShown: false, contentStyle: { backgroundColor: "#F7F1E3" }, animation: "default" });
  expect(STACK_OPTIONS.dark.contentStyle.backgroundColor).toBe(theme.screens.dark.page);
  expect(STACK_OPTIONS.light.contentStyle.backgroundColor).toBe(theme.screens.light.page);
  // Behind the editor it is the editor's slate in both: its own entry wins over these.
  expect(ROUTE_OPTIONS["editor/[id]/index"].contentStyle).toEqual({ backgroundColor: "#10151F" });
});

test("what iOS draws, per focused route: dark in the editor, the phone's own elsewhere; light glyphs over the dimmed editor behind Export", () => {
  expect(SYSTEM_SCOPE).toEqual({ "index": "screen", "editor/[id]/index": "editor", "editor/[id]/export": "overDark", "post": "screen", "accounts": "screen", "oauth": "screen", "welcome": "screen" });
  expect(Object.keys(SYSTEM_SCOPE).sort()).toEqual([...ROUTE_NAMES].sort());
  // From Expo Router's segments (dynamic parts keep their brackets; Home has none).
  expect(scopeOf([])).toBe("screen");
  expect(scopeOf(["editor", "[id]"])).toBe("editor");
  expect(scopeOf(["editor", "[id]", "export"])).toBe("overDark");
  for (const s of [["post"], ["accounts"], ["oauth"], ["welcome"], ["+not-found"], ["somewhere", "else"]]) expect(scopeOf(s)).toBe("screen");
});

test("per screen: the editor is pushed and swipes back from the edge only; Export is the standard modal; home is 'gone back to' when replaced; the redirect does not slide", () => {
  expect(ROUTE_OPTIONS).toEqual({
    "index": { animationTypeForReplace: "pop" },
    "editor/[id]/index": { fullScreenGestureEnabled: false, contentStyle: { backgroundColor: theme.surfaces.editor.page } },   // no navy behind the editor while it slides
    "editor/[id]/export": { presentation: "modal" },
    "post": {},
    "accounts": {},
    "oauth": { animation: "none" },
    "welcome": { presentation: "modal" },
  });
  // Nothing switches the back swipe off for good, and no screen is given a custom transition or a duration.
  for (const o of Object.values(ROUTE_OPTIONS)) { expect(o).not.toHaveProperty("gestureEnabled"); expect(o).not.toHaveProperty("animationDuration"); }
});

test("every route named is a screen file in app/, and every screen file is named", () => {
  for (const name of ROUTE_NAMES) expect(existsSync(join(APP, `${name}.tsx`))).toBe(true);
  expect([...ROUTE_NAMES].sort()).toEqual(screens(APP).sort());
});

test("only native-stack options, with values the native stack knows", () => {
  for (const options of [STACK_OPTIONS.dark, STACK_OPTIONS.light, ...Object.values(ROUTE_OPTIONS)]) for (const [key, value] of Object.entries(options)) {
    expect(Object.keys(KNOWN)).toContain(key);
    const values = KNOWN[key];
    if (values) expect(values).toContain(value);
  }
});

test("the Export sheet cannot be swiped away while it renders; in every other state it can", () => {
  expect(exportGesture("exporting")).toEqual({ gestureEnabled: false });
  for (const s of ["idle", "unavailable", "done", "error"] as const) expect(exportGesture(s)).toEqual({ gestureEnabled: true });
});

test("the layout renders the map and holds no screen option of its own", () => {
  const src = readFileSync(join(APP, "_layout.tsx"), "utf8");
  expect(src).toContain('from "@/src/navigation/screenOptions"');
  expect(src).toContain("screenOptions={STACK_OPTIONS[shown]}");           // the same map, in the appearance shown
  expect(src).not.toMatch(/\b(animation|presentation|gestureEnabled|fullScreenGestureEnabled|headerShown)\s*:/);
});
