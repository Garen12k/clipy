import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join, relative, sep } from "path";
import { theme } from "@/src/theme/theme";
import { exportGesture, ROUTE_NAMES, ROUTE_OPTIONS, STACK_OPTIONS } from "../screenOptions";

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

test("every screen: no header, the navy behind it, and the standard iOS transition — not a fade", () => {
  expect(STACK_OPTIONS).toEqual({ headerShown: false, contentStyle: { backgroundColor: theme.colors.bg }, animation: "default" });
});

test("per screen: the editor is pushed and swipes back from the edge only; Export is the standard modal; home is 'gone back to' when replaced; the redirect does not slide", () => {
  expect(ROUTE_OPTIONS).toEqual({
    "index": { animationTypeForReplace: "pop" },
    "editor/[id]/index": { fullScreenGestureEnabled: false },
    "editor/[id]/export": { presentation: "modal" },
    "post": {},
    "accounts": {},
    "oauth": { animation: "none" },
  });
  // Nothing switches the back swipe off for good, and no screen is given a custom transition or a duration.
  for (const o of Object.values(ROUTE_OPTIONS)) { expect(o).not.toHaveProperty("gestureEnabled"); expect(o).not.toHaveProperty("animationDuration"); }
});

test("every route named is a screen file in app/, and every screen file is named", () => {
  for (const name of ROUTE_NAMES) expect(existsSync(join(APP, `${name}.tsx`))).toBe(true);
  expect([...ROUTE_NAMES].sort()).toEqual(screens(APP).sort());
});

test("only native-stack options, with values the native stack knows", () => {
  for (const options of [STACK_OPTIONS, ...Object.values(ROUTE_OPTIONS)]) for (const [key, value] of Object.entries(options)) {
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
  expect(src).toContain("screenOptions={STACK_OPTIONS}");
  expect(src).not.toMatch(/\b(animation|presentation|gestureEnabled|fullScreenGestureEnabled|headerShown)\s*:/);
});
