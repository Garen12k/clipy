# Grand Voyage UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin Clipy from the loading screen to the export screen in the "Grand Voyage" look (navy, straw-gold, compass and waves) with a five-group editor toolbar, one sheet style, and consistent motion and haptics — without changing any feature.

**Architecture:** All visual values move into `src/theme/theme.ts`; a small UI kit in `src/ui/` (Screen, Title/Body, buttons, Sheet, ProgressRing, EmptyState, PressableScale, haptic helper) is the only place that knows how things look. Screens and editor components are rebuilt on the kit. The toolbar's grouping is pure data in `src/editor/toolGroups.ts`. No model, store, export or Swift changes.

**Tech Stack:** Expo SDK 57, Expo Router, TypeScript strict, react-native-reanimated 4.5.1, react-native-gesture-handler, react-native-svg, `expo-linear-gradient`, `expo-haptics`, Jest (jest-expo) + RNTL v14 (async `render`).

**Spec:** `docs/superpowers/specs/2026-10-02-ui-redesign-grand-voyage-design.md` (binding). Mockups: `.superpowers/brainstorm/931-1790929683/content/full-flow.html`.

## Global Constraints

- Expo Go safe: only `expo-linear-gradient` and `expo-haptics` are added as runtime deps (`npx expo install`). No native code, no Swift changes, no change to `src/editor/fonts.ts`, `src/editor/effects.ts`, `src/editor/templates.ts` data, the model, the store or export logic.
- Every colour, radius, spacing, font and duration comes from `src/theme/theme.ts`. Hex literals outside the theme are allowed only in the user-content allowlist of Task 1's guard test.
- Behaviour preserved: every tool, sheet, gesture, accessibility label and store call keeps working. Tool buttons keep their labels (`Split`, `Trim`, `Speed`, `Filter`, `Templates`, `Transition`, `Ratio`, `Text`, `Sticker`, `Captions`, `Music`, `Volume`, `Duplicate`, `Delete`).
- No One Piece names, characters, logos or artwork.
- Reduce Motion: animations collapse to fades / no stagger when `useReducedMotion()` is true.
- Before using any Expo / Reanimated API, check the versioned docs (`AGENTS.md`); do not trust memory.
- Windows: PowerShell tool, no `&&` (use `;`). Checks before every commit: `npm run typecheck` and the task's tests; before finishing a task, full `npm test`.
- `git add` only the files you changed (never `git add -A`). Every commit message ends with the exact line `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- RNTL v14: `render` and `fireEvent.*` are async — always `await` them.

## File Map

| File | Responsibility |
|---|---|
| `src/theme/theme.ts` | tokens (colours, radii, fonts, motion, ring) |
| `src/theme/uiFonts.ts` | UI font assets (Oswald 700, Montserrat 400/600/800) |
| `src/theme/Compass.tsx` | compass mark (replaces `Mark.tsx`) |
| `src/ui/haptics.ts`, `useReducedMotion.ts` | guarded haptics, reduce-motion hook |
| `src/ui/{Screen,Text,PressableScale,PrimaryButton,SecondaryButton,IconButton,ToolButton,Chip,Toast,ProgressRing,EmptyState,Sheet}.tsx` | UI kit |
| `src/ui/LoadingScreen.tsx`, `Waves.tsx` | animated loading screen |
| `app/_layout.tsx` | fonts + loading hand-off |
| `app/index.tsx`, `src/projects/{ProjectCard,ProjectActionsSheet}.tsx` | home |
| `src/editor/toolGroups.ts`, `components/{EditorToolbar,EditorTopBar,TransportRow}.tsx` | editor chrome |
| `src/export/ExportScreenBody.tsx` | export |
| `scripts/gen-brand.mjs`, `assets/brand/*.svg`, `assets/icon.png`, `assets/splash-icon.png` | icon and splash |
| `src/__tests__/noHexLiterals.test.ts` | colour-literal guard |

---

### Task 1: Theme tokens, UI fonts, dependencies, token migration

**Files:**
- Modify: `src/theme/theme.ts`, `jest.setup.ts`, `package.json` (via installers), every file listed in Step 6
- Create: `src/theme/uiFonts.ts`, `assets/fonts/ui/{Oswald_700Bold,Montserrat_400Regular,Montserrat_600SemiBold,Montserrat_800ExtraBold}.ttf`, `assets/fonts/ui/OFL.txt`, `src/__tests__/noHexLiterals.test.ts`
- Test: `src/theme/__tests__/theme.test.ts` (new), `src/theme/__tests__/Mark.test.tsx` (update the token assertions only)

**Interfaces:**
- Produces: `theme.colors.{bg,bgDeep,bgEnd,surface,surfaceAlt,accent,accentPressed,onAccent,text,textMuted,hairline,sea,seaLight,danger,laneText,laneSticker,laneMusic,scrim,scrimStrong}`, `theme.radius.{card,chip,tile,sheet,pill}`, `theme.fonts.{title,body,bodySemi,bodyBold}`, `theme.motion.{press,sheet,fade,stagger,minLoading,fontTimeout}`, `theme.ring` (style object), `uiFontAssets`.
- Removes: `theme.colors.highlight`, `theme.colors.straw`, `theme.fonts.heading`, `theme.projectsWallpaper`.

- [ ] **Step 1: Install dependencies**

```powershell
npx.cmd expo install expo-linear-gradient expo-haptics
npx.cmd expo install @expo-google-fonts/oswald @expo-google-fonts/montserrat -- --save-dev
```
Copy the four TTFs out of the packages into `assets/fonts/ui/` (find them with Glob under `node_modules/@expo-google-fonts/{oswald,montserrat}/**/*.ttf`; names `Oswald_700Bold.ttf`, `Montserrat_400Regular.ttf`, `Montserrat_600SemiBold.ttf`, `Montserrat_800ExtraBold.ttf`) and copy one package's `OFL.txt`/`LICENSE` to `assets/fonts/ui/OFL.txt`. The packages stay devDependencies (the app loads the copied files).

- [ ] **Step 2: Write the failing theme test** — `src/theme/__tests__/theme.test.ts`

```ts
import { theme } from "../theme";
import { uiFontAssets } from "../uiFonts";

test("Grand Voyage tokens", () => {
  expect(theme.colors).toMatchObject({
    bg: "#0A1B33", bgDeep: "#081527", bgEnd: "#0C2542", surface: "#0E2440", surfaceAlt: "#17365C",
    accent: "#D9B36A", accentPressed: "#B8934D", onAccent: "#0A1B33", text: "#F6E7C1", textMuted: "#9FB3CC",
    hairline: "rgba(217,179,106,0.45)", sea: "#1C6E9E", seaLight: "#2E86AB", danger: "#E5484D",
    laneText: "#D9B36A", laneSticker: "#E86A7A", laneMusic: "#3BA7C9",
  });
  expect(theme.radius).toEqual({ card: 12, chip: 8, tile: 7, sheet: 18, pill: 999 });
  expect(theme.fonts).toEqual({ title: "Oswald_700Bold", body: "Montserrat_400Regular", bodySemi: "Montserrat_600SemiBold", bodyBold: "Montserrat_800ExtraBold" });
  expect(theme.motion).toMatchObject({ press: 120, fade: 200, stagger: 40, minLoading: 1200, fontTimeout: 5000 });
});

test("old tokens are gone", () => {
  for (const k of ["highlight", "straw"]) expect(k in theme.colors).toBe(false);
  expect("heading" in theme.fonts).toBe(false);
  expect("projectsWallpaper" in theme).toBe(false);
});

test("UI font assets cover every theme font", () => {
  expect(Object.keys(uiFontAssets).sort()).toEqual(Object.values(theme.fonts).sort());
});
```

- [ ] **Step 3: Run it** — `npx.cmd jest src/theme/__tests__/theme.test.ts` → FAIL (old values / missing module).

- [ ] **Step 4: Replace `src/theme/theme.ts`**

```ts
export const theme = {
  colors: {
    bg: "#0A1B33", bgDeep: "#081527", bgEnd: "#0C2542", surface: "#0E2440", surfaceAlt: "#17365C",
    accent: "#D9B36A", accentPressed: "#B8934D", onAccent: "#0A1B33",
    text: "#F6E7C1", textMuted: "#9FB3CC", hairline: "rgba(217,179,106,0.45)",
    sea: "#1C6E9E", seaLight: "#2E86AB", danger: "#E5484D",
    laneText: "#D9B36A", laneSticker: "#E86A7A", laneMusic: "#3BA7C9",
    scrim: "rgba(3,10,20,0.55)", scrimStrong: "rgba(3,10,20,0.75)",
  },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  radius: { card: 12, chip: 8, tile: 7, sheet: 18, pill: 999 },
  fonts: { title: "Oswald_700Bold", body: "Montserrat_400Regular", bodySemi: "Montserrat_600SemiBold", bodyBold: "Montserrat_800ExtraBold" },
  motion: { press: 120, sheet: { damping: 18, stiffness: 220 }, fade: 200, stagger: 40, minLoading: 1200, fontTimeout: 5000 },
  /** 2 px gold ring for the selected item in any grid (filters, templates, fonts, ratios, transitions). */
  ring: { borderWidth: 2, borderColor: "#D9B36A" },
} as const;

export type Theme = typeof theme;
```

Create `src/theme/uiFonts.ts`:

```ts
/** UI-only fonts. Overlay fonts (burned into exports) live in src/editor/fonts.ts and are mirrored in Swift — do not mix. */
export const uiFontAssets = {
  Oswald_700Bold: require("@/assets/fonts/ui/Oswald_700Bold.ttf"),
  Montserrat_400Regular: require("@/assets/fonts/ui/Montserrat_400Regular.ttf"),
  Montserrat_600SemiBold: require("@/assets/fonts/ui/Montserrat_600SemiBold.ttf"),
  Montserrat_800ExtraBold: require("@/assets/fonts/ui/Montserrat_800ExtraBold.ttf"),
} as const;
```
If `Montserrat_400Regular` collides with the overlay font family of the same name in `src/editor/fonts.ts` (same file contents, same key), that is fine — `useFonts` merges by key; keep both maps.

- [ ] **Step 5: Jest mocks** — append to `jest.setup.ts`:

```ts
jest.mock("expo-linear-gradient", () => {
  const { View } = require("react-native");
  return { LinearGradient: View };
});
jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(async () => {}), notificationAsync: jest.fn(async () => {}),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium" }, NotificationFeedbackType: { Success: "success" },
}));
```

- [ ] **Step 6: Migrate token uses (mechanical)** — in every non-test file that Grep finds for `highlight|straw|fonts\.heading|projectsWallpaper` under `src/` and `app/`:
  - `theme.colors.highlight` → `theme.colors.accent`; `theme.colors.straw` → `theme.colors.hairline` when it is a `borderColor`, otherwise `theme.colors.accent`.
  - `theme.fonts.heading` → `theme.fonts.title`.
  - Text drawn on an `accent` background: `color: theme.colors.text` → `theme.colors.onAccent` (PrimaryButton, selected Chip, the Export pill in `EditorTopBar`).
  - Remove the `projectsWallpaper` `<Image>` line and the now-unused `Image` import in `app/index.tsx`.
  - Body text: add `fontFamily: theme.fonts.body` in `src/ui/Text.tsx` `Body`; `Heading` uses `theme.fonts.title` with `textTransform: "uppercase"`, `letterSpacing: 1.5`.
  - `"rgba(0,0,0,0.5)"`/`"rgba(0,0,0,0.55)"` literals → `theme.colors.scrim`.
  - In `EditorToolbar.tsx` `addText`: the default overlay colour `theme.colors.text` becomes the literal user-content default already used by `makeOverlay` — delete the `color: theme.colors.text` override so new text keeps `makeOverlay`'s colour (the UI palette must not leak into exported video).
  - Update `src/theme/__tests__/Mark.test.tsx`: delete the `"theme exposes the core design tokens"` test (replaced by `theme.test.ts`).
  - Fix any other test that asserts an old token value by pointing it at the `theme` constant instead of a literal.

- [ ] **Step 7: Hex-literal guard** — `src/__tests__/noHexLiterals.test.ts`

```ts
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative, sep } from "path";

const ROOT = join(__dirname, "..", "..");
/** Files whose hex values are user content (burned into video or picked by the user), not UI chrome. */
const ALLOW = new Set([
  "src/theme/theme.ts", "src/editor/effects.ts", "src/editor/templates.ts", "src/editor/model/types.ts",
  "src/editor/components/ColorRow.tsx", "src/editor/components/FilterLayer.tsx", "src/editor/components/OverlayText.tsx",
  "src/editor/components/TextPanel.tsx", "src/editor/components/CaptionStyleSheet.tsx", "src/editor/components/TransitionLayer.tsx",
  "src/editor/components/StickerSheet.tsx", "src/editor/components/StickerPanel.tsx",
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== "__tests__" && name !== "node_modules") walk(p, out); }
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

test("no hex colour literals outside the theme and the user-content allowlist", () => {
  const offenders: string[] = [];
  for (const dir of ["src", "app"]) for (const file of walk(join(ROOT, dir))) {
    const rel = relative(ROOT, file).split(sep).join("/");
    if (ALLOW.has(rel)) continue;
    const src = readFileSync(file, "utf8");
    src.split("\n").forEach((line, i) => { if (/["'`]#[0-9A-Fa-f]{3,8}["'`]/.test(line)) offenders.push(`${rel}:${i + 1}`); });
  }
  expect(offenders).toEqual([]);
});
```
Run it. For each offender: replace the literal with a theme token (add nothing new unless no token fits; if a file's hex is genuinely user content, add the file to `ALLOW` and say why in the report). Remove from `ALLOW` any file that turns out to contain no hex literal.

- [ ] **Step 8: Verify** — `npm run typecheck`; `npm test` → all green; `npx.cmd expo-doctor` → 21/21.

- [ ] **Step 9: Commit**

```powershell
git add src/theme src/ui src/editor src/export src/projects app jest.setup.ts package.json package-lock.json assets/fonts/ui src/__tests__/noHexLiterals.test.ts
git commit -m "feat(theme): Grand Voyage tokens, UI fonts, hex-literal guard"
```
(Before committing run `git status --short` and make sure only intended files are staged; unstage anything else.)

---

### Task 2: UI kit primitives

**Files:**
- Create: `src/ui/haptics.ts`, `src/ui/useReducedMotion.ts`, `src/ui/Screen.tsx`, `src/ui/PressableScale.tsx`, `src/ui/SecondaryButton.tsx`, `src/ui/ProgressRing.tsx`, `src/ui/EmptyState.tsx`
- Modify: `src/ui/Text.tsx`, `src/ui/PrimaryButton.tsx`, `src/ui/IconButton.tsx`, `src/ui/ToolButton.tsx`, `src/ui/Chip.tsx`, `src/ui/Toast.tsx`, `src/ui/NumField.tsx`
- Test: `src/ui/__tests__/kit.test.tsx` (new), `src/ui/__tests__/primitives.test.tsx` (keep green)

**Interfaces (produced):**
```ts
haptic(kind: "light" | "medium" | "success"): void                      // never throws
useReducedMotion(): boolean
<Screen style? edges?>{children}</Screen>                                // gradient bg, flex 1
<Title size?: number>…</Title>  <Body muted? weight?: "regular"|"semi"|"bold">…</Body>   // Heading stays as an alias of Title
<PressableScale {...PressableProps}>                                     // scale 0.96 on press
<PrimaryButton title onPress disabled? icon? compact? />                 // gold pill, testID "primary-button"
<SecondaryButton title onPress disabled? danger? />                      // hairline pill
<ToolButton label icon onPress disabled? active? role?: "button"|"tab" />  // icon tile + label
<ProgressRing progress size? done? />                                    // 0..1, accessibilityRole "progressbar"
<EmptyState emoji title hint />
```

- [ ] **Step 1: Failing tests** — `src/ui/__tests__/kit.test.tsx`

```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
import * as Haptics from "expo-haptics";
import { theme } from "@/src/theme/theme";
import { EmptyState } from "../EmptyState";
import { haptic } from "../haptics";
import { PrimaryButton } from "../PrimaryButton";
import { ProgressRing } from "../ProgressRing";
import { SecondaryButton } from "../SecondaryButton";
import { Title } from "../Text";
import { ToolButton } from "../ToolButton";

test("haptic maps kinds and never throws", () => {
  haptic("light"); haptic("medium"); haptic("success");
  expect(Haptics.impactAsync).toHaveBeenCalledWith("light");
  expect(Haptics.impactAsync).toHaveBeenCalledWith("medium");
  expect(Haptics.notificationAsync).toHaveBeenCalledWith("success");
  (Haptics.impactAsync as jest.Mock).mockImplementationOnce(() => { throw new Error("no module"); });
  expect(() => haptic("light")).not.toThrow();
});

test("PrimaryButton is a gold pill with on-accent text", async () => {
  await render(<PrimaryButton title="New clip" onPress={() => {}} />);
  expect(screen.getByTestId("primary-button")).toHaveStyle({ backgroundColor: theme.colors.accent, borderRadius: theme.radius.pill });
  expect(screen.getByText("New clip")).toHaveStyle({ color: theme.colors.onAccent, fontFamily: theme.fonts.bodyBold });
});

test("SecondaryButton presses and can be disabled", async () => {
  const onPress = jest.fn();
  await render(<SecondaryButton title="Share" onPress={onPress} />);
  await fireEvent.press(screen.getByRole("button", { name: "Share" }));
  expect(onPress).toHaveBeenCalledTimes(1);
});

test("ToolButton exposes tab role and selected state when asked", async () => {
  await render(<ToolButton label="Effects" icon="sparkles" onPress={() => {}} active role="tab" />);
  expect(screen.getByRole("tab", { name: "Effects" })).toBeSelected();
});

test("ProgressRing reports its value", async () => {
  await render(<ProgressRing progress={0.42} />);
  expect(screen.getByRole("progressbar")).toHaveProp("accessibilityValue", { min: 0, max: 100, now: 42 });
  expect(screen.getByText("42%")).toBeTruthy();
});

test("ProgressRing shows a check when done", async () => {
  await render(<ProgressRing progress={1} done />);
  expect(screen.getByLabelText("Done")).toBeTruthy();
});

test("EmptyState and Title render", async () => {
  await render(<><Title>Your voyages</Title><EmptyState emoji="🏝️" title="No clips yet" hint="Pick some videos" /></>);
  expect(screen.getByText("Your voyages")).toHaveStyle({ fontFamily: theme.fonts.title });
  expect(screen.getByText("No clips yet")).toBeTruthy();
  expect(screen.getByText("Pick some videos")).toBeTruthy();
});
```

- [ ] **Step 2: Run** — `npx.cmd jest src/ui/__tests__/kit.test.tsx` → FAIL (modules missing).

- [ ] **Step 3: Implement**

`src/ui/haptics.ts`
```ts
import * as Haptics from "expo-haptics";

export type HapticKind = "light" | "medium" | "success";
/** Fire-and-forget vibration. Silent when the module is missing or the device refuses. */
export function haptic(kind: HapticKind): void {
  try {
    const p = kind === "success" ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      : Haptics.impactAsync(kind === "medium" ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
    p?.catch?.(() => {});
  } catch { /* optional */ }
}
```

`src/ui/useReducedMotion.ts`
```ts
import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => { if (alive) setReduced(v); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => { alive = false; sub.remove(); };
  }, []);
  return reduced;
}
```

`src/ui/Screen.tsx`
```tsx
import { LinearGradient } from "expo-linear-gradient";
import type { ViewStyle } from "react-native";
import { theme } from "@/src/theme/theme";

/** Full-screen navy gradient every screen sits on. */
export function Screen({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <LinearGradient colors={[theme.colors.bg, theme.colors.bgEnd]} style={[{ flex: 1 }, style]}>{children}</LinearGradient>;
}
```

`src/ui/Text.tsx`
```tsx
import { Text, type TextProps } from "react-native";
import { theme } from "@/src/theme/theme";

export function Title({ style, size = 22, ...rest }: TextProps & { size?: number }) {
  return <Text {...rest} style={[{ fontFamily: theme.fonts.title, fontSize: size, color: theme.colors.text, letterSpacing: 1.5, textTransform: "uppercase" }, style]} />;
}
/** @deprecated name kept so existing imports compile; identical to Title. */
export const Heading = Title;
const WEIGHT = { regular: theme.fonts.body, semi: theme.fonts.bodySemi, bold: theme.fonts.bodyBold } as const;
export function Body({ muted, weight = "regular", style, ...rest }: TextProps & { muted?: boolean; weight?: keyof typeof WEIGHT }) {
  return <Text {...rest} style={[{ fontFamily: WEIGHT[weight], fontSize: 14, color: muted ? theme.colors.textMuted : theme.colors.text }, style]} />;
}
```
(`Heading style={{ fontSize: n }}` call sites keep working because `style` overrides `size`.)

`src/ui/PressableScale.tsx`
```tsx
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { theme } from "@/src/theme/theme";

const APressable = Animated.createAnimatedComponent(Pressable);
type Props = Omit<PressableProps, "style"> & { style?: StyleProp<ViewStyle> };

/** Pressable that dips to 0.96 while held. */
export function PressableScale({ style, onPressIn, onPressOut, ...rest }: Props) {
  const s = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <APressable {...rest} style={[style, anim]}
      onPressIn={(e) => { s.value = withTiming(0.96, { duration: theme.motion.press }); onPressIn?.(e); }}
      onPressOut={(e) => { s.value = withSpring(1); onPressOut?.(e); }} />
  );
}
```

`src/ui/PrimaryButton.tsx`
```tsx
import { Text } from "react-native";
import { theme } from "@/src/theme/theme";
import { PressableScale } from "./PressableScale";

type Props = { title: string; onPress: () => void; disabled?: boolean; icon?: React.ReactNode; compact?: boolean };

export function PrimaryButton({ title, onPress, disabled, icon, compact }: Props) {
  return (
    <PressableScale testID="primary-button" accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: !!disabled }}
      disabled={disabled} onPress={onPress}
      style={{ backgroundColor: theme.colors.accent, opacity: disabled ? 0.4 : 1, borderRadius: theme.radius.pill,
        paddingVertical: compact ? theme.space.sm : theme.space.lg, paddingHorizontal: compact ? theme.space.lg : theme.space.xl,
        flexDirection: "row", alignItems: "center", justifyContent: "center", gap: theme.space.sm }}>
      {icon ?? null}
      <Text style={{ fontFamily: theme.fonts.bodyBold, fontSize: compact ? 13 : 15, color: theme.colors.onAccent, letterSpacing: 1, textTransform: "uppercase" }}>{title}</Text>
    </PressableScale>
  );
}
```
(Delete the stray `export { Ionicons }` and its import; fix any importer Grep finds.)

`src/ui/SecondaryButton.tsx`
```tsx
import { Text } from "react-native";
import { theme } from "@/src/theme/theme";
import { PressableScale } from "./PressableScale";

type Props = { title: string; onPress: () => void; disabled?: boolean; danger?: boolean };

export function SecondaryButton({ title, onPress, disabled, danger }: Props) {
  const color = danger ? theme.colors.danger : theme.colors.text;
  return (
    <PressableScale accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress}
      style={{ borderRadius: theme.radius.pill, borderWidth: 1.5, borderColor: danger ? theme.colors.danger : theme.colors.hairline, opacity: disabled ? 0.4 : 1,
        paddingVertical: theme.space.md, paddingHorizontal: theme.space.xl, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontFamily: theme.fonts.bodyBold, fontSize: 13, color, letterSpacing: 1, textTransform: "uppercase" }}>{title}</Text>
    </PressableScale>
  );
}
```

`src/ui/ToolButton.tsx`
```tsx
import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";
import { theme } from "@/src/theme/theme";
import { PressableScale } from "./PressableScale";

type Props = { label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void; disabled?: boolean; active?: boolean; role?: "button" | "tab" };

export function ToolButton({ label, icon, onPress, disabled, active, role = "button" }: Props) {
  return (
    <PressableScale accessibilityRole={role} accessibilityLabel={label} accessibilityState={{ disabled: !!disabled, selected: !!active }}
      disabled={disabled} onPress={onPress} style={{ alignItems: "center", width: 68, paddingVertical: theme.space.sm, opacity: disabled ? 0.35 : 1 }}>
      <View style={{ width: 40, height: 40, borderRadius: theme.radius.tile + 5, alignItems: "center", justifyContent: "center",
        backgroundColor: active ? theme.colors.accent : theme.colors.surfaceAlt }}>
        <Ionicons name={icon} size={20} color={active ? theme.colors.onAccent : theme.colors.text} />
      </View>
      <Text numberOfLines={1} style={{ fontFamily: active ? theme.fonts.bodySemi : theme.fonts.body, color: active ? theme.colors.accent : theme.colors.text, fontSize: 11, marginTop: 4 }}>{label}</Text>
    </PressableScale>
  );
}
```

`src/ui/ProgressRing.tsx`
```tsx
import { Ionicons } from "@expo/vector-icons";
import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { theme } from "@/src/theme/theme";
import { Title } from "./Text";

/** Circular progress, 0..1. Shows the percentage, or a check when `done`. */
export function ProgressRing({ progress, size = 120, done }: { progress: number; size?: number; done?: boolean }) {
  const p = Math.min(1, Math.max(0, progress));
  const stroke = 8, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const pct = Math.round(p * 100);
  return (
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: pct }} style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={theme.colors.surfaceAlt} strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={theme.colors.accent} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={`${c} ${c}`} strokeDashoffset={c * (1 - (done ? 1 : p))} />
      </Svg>
      {done ? <Ionicons name="checkmark" size={size * 0.4} color={theme.colors.accent} accessibilityLabel="Done" /> : <Title size={size * 0.22}>{`${pct}%`}</Title>}
    </View>
  );
}
```

`src/ui/EmptyState.tsx`
```tsx
import { Text, View } from "react-native";
import { theme } from "@/src/theme/theme";
import { Body, Title } from "./Text";

export function EmptyState({ emoji, title, hint }: { emoji: string; title: string; hint: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: theme.space.md, padding: theme.space.xxl }}>
      <Text style={{ fontSize: 64 }}>{emoji}</Text>
      <Title size={20}>{title}</Title>
      <Body muted style={{ textAlign: "center" }}>{hint}</Body>
    </View>
  );
}
```

`IconButton.tsx`: swap `Pressable` for `PressableScale` (drop the `pressed` opacity; keep `opacity: disabled ? 0.35 : 1`). `Chip.tsx`: `PressableScale`; selected → `backgroundColor: accent`, text `onAccent`; unselected → `surfaceAlt` with `hairline` border, text `text`; font `bodySemi`, radius `pill`. `Toast.tsx`: `surface` background, `hairline` border, `Body` text. `NumField.tsx`: add `fontFamily: theme.fonts.body` to the field style.

- [ ] **Step 4: Run** — `npx.cmd jest src/ui` → PASS (fix `primitives.test.tsx` assertions that name old styles; keep their intent).
- [ ] **Step 5: Verify + commit** — `npm run typecheck`; `npm test`; then

```powershell
git add src/ui
git commit -m "feat(ui): Grand Voyage kit — Screen, Title/Body, pills, tool tiles, ProgressRing, EmptyState, haptics"
```

---

### Task 3: Sheet (spring in, swipe down, title action)

**Files:**
- Modify: `src/ui/Sheet.tsx`
- Test: `src/ui/__tests__/Sheet.test.tsx` (new)

**Interfaces (produced):** `<Sheet visible onClose title height? action?: { label: string; onPress: () => void }>` — existing call sites compile unchanged. Exports `shouldDismiss(translationY: number, velocityY: number, height: number): boolean`.

- [ ] **Step 1: Failing tests**

```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { Sheet, shouldDismiss } from "../Sheet";

test("renders title, content and optional action; backdrop closes", async () => {
  const onClose = jest.fn(), onAction = jest.fn();
  await render(<Sheet visible onClose={onClose} title="Filter" action={{ label: "Apply to all", onPress: onAction }}><Text>body</Text></Sheet>);
  expect(screen.getByText("Filter")).toBeTruthy();
  expect(screen.getByText("body")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Apply to all" }));
  expect(onAction).toHaveBeenCalled();
  await fireEvent.press(screen.getByLabelText("Close sheet"));
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("hidden sheet renders nothing", async () => {
  await render(<Sheet visible={false} onClose={() => {}} title="Filter"><Text>body</Text></Sheet>);
  expect(screen.queryByText("body")).toBeNull();
});

test("shouldDismiss: past a quarter of the height or a fast flick", () => {
  expect(shouldDismiss(50, 0, 400)).toBe(false);
  expect(shouldDismiss(101, 0, 400)).toBe(true);
  expect(shouldDismiss(20, 900, 400)).toBe(true);
  expect(shouldDismiss(-30, 900, 400)).toBe(false);
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** `src/ui/Sheet.tsx`

```tsx
import { useEffect, useState } from "react";
import { Modal, Pressable, View, type DimensionValue } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { theme } from "@/src/theme/theme";
import { Body, Title } from "./Text";
import { useReducedMotion } from "./useReducedMotion";

type Props = { visible: boolean; onClose: () => void; title: string; children: React.ReactNode; height?: DimensionValue; action?: { label: string; onPress: () => void } };

/** Close when dragged past 25 % of the panel or flicked down fast. */
export function shouldDismiss(translationY: number, velocityY: number, height: number): boolean {
  return translationY > 0 && (translationY > height * 0.25 || velocityY > 800);
}

const START_OFFSET = 320;

export function Sheet({ visible, onClose, title, children, height, action }: Props) {
  const reduced = useReducedMotion();
  const y = useSharedValue(START_OFFSET);
  const [panelH, setPanelH] = useState(400);

  useEffect(() => {
    if (!visible) { y.value = START_OFFSET; return; }
    y.value = reduced ? withTiming(0, { duration: theme.motion.fade }) : withSpring(0, theme.motion.sheet);
  }, [visible, reduced, y]);

  // runOnJS(true): callbacks run on the JS thread, so onClose needs no worklet bridge.
  const pan = Gesture.Pan().runOnJS(true)
    .onUpdate((e) => { y.value = Math.max(0, e.translationY); })
    .onEnd((e) => { if (shouldDismiss(e.translationY, e.velocityY, panelH)) onClose(); else y.value = withSpring(0, theme.motion.sheet); });
  const anim = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: theme.colors.scrim }} onPress={onClose} accessibilityLabel="Close sheet" />
      <Animated.View onLayout={(e) => setPanelH(e.nativeEvent.layout.height)}
        style={[{ backgroundColor: theme.colors.surface, borderTopLeftRadius: theme.radius.sheet, borderTopRightRadius: theme.radius.sheet,
          borderTopWidth: 1, borderColor: theme.colors.hairline, paddingHorizontal: theme.space.xl, paddingBottom: theme.space.xxl, gap: theme.space.lg, maxHeight: height }, anim]}>
        <GestureDetector gesture={pan}>
          <View style={{ paddingTop: theme.space.sm, gap: theme.space.md }}>
            <View style={{ alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: theme.colors.surfaceAlt }} />
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Title size={18}>{title}</Title>
              {action ? (
                <Pressable accessibilityRole="button" accessibilityLabel={action.label} onPress={action.onPress} hitSlop={8}>
                  <Body weight="semi" style={{ color: theme.colors.accent, fontSize: 13 }}>{action.label}</Body>
                </Pressable>
              ) : null}
            </View>
          </View>
        </GestureDetector>
        {children}
      </Animated.View>
    </Modal>
  );
}
```
The drag area is the handle + title row only, so sliders and scroll views inside the sheet keep their own gestures. If the reanimated Jest mock lacks anything used here, extend the mock in `jest.setup.ts` rather than changing the component.

- [ ] **Step 4: Run** — `npx.cmd jest src/ui src/editor` → PASS (all existing sheet suites must stay green unmodified).
- [ ] **Step 5: Commit**

```powershell
git add src/ui/Sheet.tsx src/ui/__tests__/Sheet.test.tsx jest.setup.ts
git commit -m "feat(ui): spring sheet with grab handle, swipe-down close and title action"
```

---

### Task 4: Compass mark, loading screen, hand-off, icon and splash

**Files:**
- Create: `src/theme/Compass.tsx`, `src/ui/Waves.tsx`, `src/ui/LoadingScreen.tsx`, `src/ui/useAppReady.ts`, `scripts/gen-brand.mjs`, `assets/brand/icon.svg`, `assets/brand/splash.svg`
- Delete: `src/theme/Mark.tsx`, `src/theme/__tests__/Mark.test.tsx` (replace every `Mark` use with `Compass`)
- Modify: `app/_layout.tsx`, `app.json` (splash `backgroundColor` → `#0A1B33`), `assets/icon.png`, `assets/splash-icon.png`, `package.json` (script `gen:brand`)
- Test: `src/theme/__tests__/Compass.test.tsx`, `src/ui/__tests__/LoadingScreen.test.tsx`, `src/ui/__tests__/useAppReady.test.ts`

**Interfaces (produced):**
```ts
<Compass size?: number needleRotation?: number />            // accessibilityLabel "Clipy compass"
useAppReady(fontsLoaded: boolean): { ready: boolean }        // true once (fontsLoaded || 5 s) AND 1.2 s elapsed
<LoadingScreen leaving: boolean onGone: () => void />        // plays intro; when `leaving` turns true fades out (300 ms) then calls onGone
```

- [ ] **Step 1: Failing tests**

`src/ui/__tests__/useAppReady.test.ts`
```ts
import { act, renderHook } from "@testing-library/react-native";
import { theme } from "@/src/theme/theme";
import { useAppReady } from "../useAppReady";

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test("waits for the minimum loading time even when fonts are ready", async () => {
  const { result } = await renderHook(() => useAppReady(true));
  expect(result.current.ready).toBe(false);
  await act(() => { jest.advanceTimersByTime(theme.motion.minLoading - 1); });
  expect(result.current.ready).toBe(false);
  await act(() => { jest.advanceTimersByTime(1); });
  expect(result.current.ready).toBe(true);
});

test("gives up on fonts after the timeout", async () => {
  const { result } = await renderHook(() => useAppReady(false));
  await act(() => { jest.advanceTimersByTime(theme.motion.fontTimeout - 1); });
  expect(result.current.ready).toBe(false);
  await act(() => { jest.advanceTimersByTime(1); });
  expect(result.current.ready).toBe(true);
});
```

`src/ui/__tests__/LoadingScreen.test.tsx`
```tsx
import { act, render, screen } from "@testing-library/react-native";
import { LoadingScreen } from "../LoadingScreen";

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test("shows the brand and calls onGone after leaving", async () => {
  const onGone = jest.fn();
  const view = await render(<LoadingScreen leaving={false} onGone={onGone} />);
  expect(screen.getByText("CLIPY")).toBeTruthy();
  expect(screen.getByText("EDIT · SET SAIL · SHARE")).toBeTruthy();
  expect(screen.getByLabelText("Clipy compass")).toBeTruthy();
  expect(onGone).not.toHaveBeenCalled();
  await view.rerender(<LoadingScreen leaving onGone={onGone} />);
  await act(() => { jest.advanceTimersByTime(400); });
  expect(onGone).toHaveBeenCalledTimes(1);
});
```

`src/theme/__tests__/Compass.test.tsx`
```tsx
import { render, screen } from "@testing-library/react-native";
import { Compass } from "../Compass";

test("Compass renders a ring and a two-part needle", async () => {
  await render(<Compass size={64} />);
  expect(screen.getByLabelText("Clipy compass")).toBeTruthy();
  expect(screen.getByTestId("compass-ring")).toBeTruthy();
  expect(screen.getAllByTestId("compass-needle")).toHaveLength(2);
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement**

`src/theme/Compass.tsx`
```tsx
import Svg, { Circle, G, Polygon } from "react-native-svg";
import { theme } from "./theme";

/** Clipy's mark: a gold ring with a red/cream needle. `needleRotation` in degrees. */
export function Compass({ size = 24, needleRotation = 0 }: { size?: number; needleRotation?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityLabel="Clipy compass">
      <Circle testID="compass-ring" cx={50} cy={50} r={44} stroke={theme.colors.accent} strokeWidth={6} fill="none" />
      <G rotation={needleRotation} origin="50, 50">
        <Polygon testID="compass-needle" points="50,14 60,50 40,50" fill={theme.colors.danger} />
        <Polygon testID="compass-needle" points="50,86 60,50 40,50" fill={theme.colors.text} />
      </G>
    </Svg>
  );
}
```

`src/ui/useAppReady.ts`
```ts
import { useEffect, useState } from "react";
import { theme } from "@/src/theme/theme";

/** Ready once fonts are loaded (or we stop waiting for them) and the loading screen has had its minimum time. */
export function useAppReady(fontsLoaded: boolean): { ready: boolean } {
  const [minElapsed, setMinElapsed] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const a = setTimeout(() => setMinElapsed(true), theme.motion.minLoading);
    const b = setTimeout(() => setTimedOut(true), theme.motion.fontTimeout);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);
  return { ready: (fontsLoaded && minElapsed) || timedOut };
}
```

`src/ui/Waves.tsx`
```tsx
import { useEffect } from "react";
import { useWindowDimensions, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { theme } from "@/src/theme/theme";

const PERIOD = 120, H = 54;
function wavePath(width: number): string {
  let d = `M0 ${H} L0 18`;
  for (let x = 0; x < width; x += PERIOD) d += ` Q${x + PERIOD / 4} 0 ${x + PERIOD / 2} 18 Q${x + (3 * PERIOD) / 4} 36 ${x + PERIOD} 18`;
  return `${d} L${width} ${H} Z`;
}

function Layer({ color, duration, bottom, opacity, still }: { color: string; duration: number; bottom: number; opacity: number; still: boolean }) {
  const { width } = useWindowDimensions();
  const w = Math.ceil(width / PERIOD + 2) * PERIOD;
  const x = useSharedValue(0);
  useEffect(() => { if (!still) x.value = withRepeat(withTiming(-PERIOD, { duration, easing: Easing.linear }), -1); }, [still, duration, x]);
  const anim = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <Animated.View style={[{ position: "absolute", left: 0, bottom, opacity }, anim]}>
      <Svg width={w} height={H}><Path d={wavePath(w)} fill={color} /></Svg>
    </Animated.View>
  );
}

/** Two rolling wave layers pinned to the bottom of their parent. */
export function Waves({ still = false }: { still?: boolean }) {
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: H + 12, overflow: "hidden" }}>
      <Layer color={theme.colors.seaLight} duration={5000} bottom={8} opacity={0.55} still={still} />
      <Layer color={theme.colors.sea} duration={3000} bottom={0} opacity={1} still={still} />
    </View>
  );
}
```

`src/ui/LoadingScreen.tsx`
```tsx
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { Compass } from "@/src/theme/Compass";
import { theme } from "@/src/theme/theme";
import { Screen } from "./Screen";
import { useReducedMotion } from "./useReducedMotion";
import { Waves } from "./Waves";

const EXIT_MS = 300;

/** Animated brand screen shown over the app until it is ready; fades out when `leaving` turns true. */
export function LoadingScreen({ leaving, onGone }: { leaving: boolean; onGone: () => void }) {
  const reduced = useReducedMotion();
  const needle = useSharedValue(-14), rise = useSharedValue(0), opacity = useSharedValue(1);

  useEffect(() => {
    rise.value = withDelay(150, withTiming(1, { duration: 500 }));
    if (!reduced) needle.value = withRepeat(withSequence(
      withTiming(18, { duration: 1300, easing: Easing.inOut(Easing.quad) }), withTiming(-14, { duration: 1300, easing: Easing.inOut(Easing.quad) })), -1);
  }, [reduced, needle, rise]);

  // A timer (not an animation callback) ends the screen, so the hand-off cannot hang if an animation is skipped.
  useEffect(() => {
    if (!leaving) return;
    opacity.value = withTiming(0, { duration: EXIT_MS });
    const t = setTimeout(onGone, EXIT_MS);
    return () => clearTimeout(t);
  }, [leaving, onGone, opacity]);

  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${needle.value}deg` }] }));
  const up = useAnimatedStyle(() => ({ opacity: rise.value, transform: [{ translateY: (1 - rise.value) * 8 }] }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, fade]} pointerEvents={leaving ? "none" : "auto"}>
      <Screen style={{ alignItems: "center", justifyContent: "center" }}>
        <View style={{ alignItems: "center", gap: theme.space.lg }}>
          <Animated.View style={spin}><Compass size={96} /></Animated.View>
          <Animated.View style={[{ alignItems: "center", gap: theme.space.sm }, up]}>
            {/* Font families fall back to the system font until the UI fonts finish loading. */}
            <Text style={{ fontFamily: theme.fonts.title, fontSize: 48, letterSpacing: 8, color: theme.colors.text }}>CLIPY</Text>
            <Text style={{ fontFamily: theme.fonts.bodySemi, fontSize: 11, letterSpacing: 3, color: theme.colors.accent }}>EDIT · SET SAIL · SHARE</Text>
          </Animated.View>
        </View>
        <Waves still={reduced} />
      </Screen>
    </Animated.View>
  );
}
```
(The whole compass swings rather than only the needle — the ring is rotation-symmetric, so it reads as the needle moving and avoids animating SVG props.)

`app/_layout.tsx`
```tsx
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useCallback, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { fontAssets } from "@/src/editor/fonts";
import { theme } from "@/src/theme/theme";
import { uiFontAssets } from "@/src/theme/uiFonts";
import { LoadingScreen } from "@/src/ui/LoadingScreen";
import { useAppReady } from "@/src/ui/useAppReady";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [loaded] = useFonts({ ...fontAssets, ...uiFontAssets });
  const { ready } = useAppReady(loaded);
  const [gone, setGone] = useState(false);
  const onGone = useCallback(() => setGone(true), []);
  // Our own loading screen is the first thing drawn, so the native splash can go as soon as it lays out.
  const hideSplash = useCallback(() => { SplashScreen.hideAsync().catch(() => {}); }, []);
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.colors.bg }} onLayout={hideSplash}>
      {ready ? (
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.bg }, animation: "fade" }}>
          <Stack.Screen name="editor/[id]/export" options={{ presentation: "modal" }} />
        </Stack>
      ) : null}
      {gone ? null : <LoadingScreen leaving={ready} onGone={onGone} />}
    </GestureHandlerRootView>
  );
}
```
Check the Expo Router v57 docs for the `animation` screen option name before using it; drop it if it is not supported there.

Brand assets — `assets/brand/icon.svg` (1024×1024):
```svg
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0A1B33"/><stop offset="1" stop-color="#12527A"/></linearGradient></defs>
  <rect width="1024" height="1024" fill="url(#g)"/>
  <circle cx="512" cy="512" r="300" fill="none" stroke="#D9B36A" stroke-width="44"/>
  <polygon points="512,262 580,512 444,512" fill="#E5484D"/>
  <polygon points="512,762 580,512 444,512" fill="#F6E7C1"/>
</svg>
```
`assets/brand/splash.svg`: the same ring and needle on a transparent 1024×1024 canvas (no `<rect>`).

`scripts/gen-brand.mjs`
```js
// Renders assets/brand/*.svg to the PNGs referenced by app.json. Run: npm run gen:brand
import { readFile } from "node:fs/promises";
import sharp from "sharp";

await sharp(await readFile("assets/brand/icon.svg")).resize(1024, 1024).flatten({ background: "#0A1B33" }).png().toFile("assets/icon.png");
await sharp(await readFile("assets/brand/splash.svg")).resize(1024, 1024).png().toFile("assets/splash-icon.png");
console.log("wrote assets/icon.png, assets/splash-icon.png");
```
`npm install --save-dev sharp` (a Node build tool, not an app dependency), add `"gen:brand": "node scripts/gen-brand.mjs"` to `package.json` scripts, run it, and Read both PNGs to confirm they look right. In `app.json` set the splash plugin `backgroundColor` to `#0A1B33`. Replace `Mark` imports (`app/index.tsx`, `src/export/ExportScreenBody.tsx`) with `Compass` and delete `Mark.tsx` and its test.

- [ ] **Step 4: Run** — `npx.cmd jest src/ui src/theme` → PASS; `npm run typecheck`; `npm test`; `npx.cmd expo-doctor`.
- [ ] **Step 5: Commit**

```powershell
git add src/theme src/ui app/_layout.tsx app/index.tsx src/export/ExportScreenBody.tsx app.json assets/brand assets/icon.png assets/splash-icon.png scripts/gen-brand.mjs package.json package-lock.json
git commit -m "feat(loading): animated compass loading screen, new icon and splash"
```

---

### Task 5: Home screen

**Files:**
- Modify: `app/index.tsx`, `src/projects/ProjectCard.tsx`, `src/lib/format.ts`
- Create: `src/projects/ProjectActionsSheet.tsx`
- Test: `src/lib/__tests__/format.test.ts` (extend), `src/projects/__tests__/ProjectsScreen.test.tsx` (update), `src/projects/__tests__/ProjectCard.test.tsx` (new)

**Interfaces (produced):**
```ts
editedLabel(iso: string, now?: Date): string     // "Edited today" | "Yesterday" | "3 days ago"
<ProjectCard summary index onPress onLongPress />  // index drives the stagger
<ProjectActionsSheet project: ProjectSummary | null onClose onRename onDuplicate onDelete />
```

- [ ] **Step 1: Failing tests**

Append to `src/lib/__tests__/format.test.ts`:
```ts
import { editedLabel } from "../format";

test("editedLabel", () => {
  const now = new Date("2026-10-02T15:00:00");
  expect(editedLabel("2026-10-02T01:00:00", now)).toBe("Edited today");
  expect(editedLabel("2026-10-01T23:00:00", now)).toBe("Yesterday");
  expect(editedLabel("2026-09-29T12:00:00", now)).toBe("3 days ago");
});
```

`src/projects/__tests__/ProjectCard.test.tsx`
```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
import { ProjectCard } from "../ProjectCard";

const summary = { id: "p1", name: "Beach day", durationSec: 21, updatedAt: new Date().toISOString(), thumbUri: null, broken: false };

test("shows name, duration badge and edited line; press and long-press work", async () => {
  const onPress = jest.fn(), onLongPress = jest.fn();
  await render(<ProjectCard summary={summary as never} index={0} onPress={onPress} onLongPress={onLongPress} />);
  expect(screen.getByText("Beach day")).toBeTruthy();
  expect(screen.getByText("0:21")).toBeTruthy();
  expect(screen.getByText("Edited today")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Beach day" }));
  await fireEvent(screen.getByRole("button", { name: "Beach day" }), "longPress");
  expect(onPress).toHaveBeenCalled(); expect(onLongPress).toHaveBeenCalled();
});
```
(Match `summary` to the real `ProjectSummary` type in `src/projects/storage.ts`; drop the cast if it fits.)

In `ProjectsScreen.test.tsx` change expectations: header text `Your voyages`; empty state `No clips yet` and hint `Pick some videos from your library and start your first edit.`; the create button is `getByRole("button", { name: "New clip" })`; long-press opens a sheet with buttons `Rename`, `Duplicate`, `Delete` (press `Delete` → confirm `Alert` as today).

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement**

`src/lib/format.ts` (add):
```ts
/** Home-card line: calendar-day based, in the device's local time. */
export function editedLabel(iso: string, now: Date = new Date()): string {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.max(0, Math.round((day(now) - day(new Date(iso))) / 86400000));
  return days === 0 ? "Edited today" : days === 1 ? "Yesterday" : `${days} days ago`;
}
```

`src/projects/ProjectCard.tsx`
```tsx
import { LinearGradient } from "expo-linear-gradient";
import { useEffect } from "react";
import { Image, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { editedLabel, formatDuration } from "@/src/lib/format";
import { theme } from "@/src/theme/theme";
import { PressableScale } from "@/src/ui/PressableScale";
import { Body } from "@/src/ui/Text";
import { useReducedMotion } from "@/src/ui/useReducedMotion";
import type { ProjectSummary } from "./storage";

type Props = { summary: ProjectSummary; index: number; onPress: () => void; onLongPress: () => void };

export function ProjectCard({ summary, index, onPress, onLongPress }: Props) {
  const reduced = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => { t.value = reduced ? 1 : withDelay(index * theme.motion.stagger, withTiming(1, { duration: theme.motion.fade })); }, [index, reduced, t]);
  const enter = useAnimatedStyle(() => ({ opacity: t.value, transform: [{ translateY: (1 - t.value) * 8 }] }));
  return (
    <Animated.View style={[{ flex: 1, margin: theme.space.sm }, enter]}>
      <PressableScale accessibilityRole="button" accessibilityLabel={summary.name} onPress={onPress} onLongPress={onLongPress} delayLongPress={350}
        style={{ borderRadius: theme.radius.card, borderWidth: 1.5, borderColor: summary.broken ? theme.colors.danger : theme.colors.hairline, backgroundColor: theme.colors.surface, overflow: "hidden", aspectRatio: 3 / 4 }}>
        {summary.thumbUri ? <Image source={{ uri: summary.thumbUri }} style={{ position: "absolute", width: "100%", height: "100%" }} resizeMode="cover" />
          : <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><Body muted>{summary.broken ? "Damaged" : "No preview"}</Body></View>}
        <View style={{ position: "absolute", top: theme.space.sm, right: theme.space.sm, backgroundColor: theme.colors.scrimStrong, borderRadius: theme.radius.pill, paddingHorizontal: theme.space.sm, paddingVertical: 2 }}>
          <Body weight="semi" style={{ fontSize: 11, color: theme.colors.accent }}>{formatDuration(summary.durationSec)}</Body>
        </View>
        <LinearGradient colors={["transparent", theme.colors.scrimStrong]} style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: theme.space.md, paddingTop: theme.space.xl }}>
          <Body weight="semi" numberOfLines={1} style={{ color: summary.broken ? theme.colors.danger : theme.colors.text }}>{summary.name}</Body>
          <Body muted style={{ fontSize: 11 }}>{summary.updatedAt ? editedLabel(summary.updatedAt) : ""}</Body>
        </LinearGradient>
      </PressableScale>
    </Animated.View>
  );
}
```

`src/projects/ProjectActionsSheet.tsx`
```tsx
import { View } from "react-native";
import { theme } from "@/src/theme/theme";
import { SecondaryButton } from "@/src/ui/SecondaryButton";
import { Sheet } from "@/src/ui/Sheet";
import type { ProjectSummary } from "./storage";

type Props = { project: ProjectSummary | null; onClose: () => void; onRename: (p: ProjectSummary) => void; onDuplicate: (p: ProjectSummary) => void; onDelete: (p: ProjectSummary) => void };

export function ProjectActionsSheet({ project, onClose, onRename, onDuplicate, onDelete }: Props) {
  const run = (fn: (p: ProjectSummary) => void) => () => { if (project) { onClose(); fn(project); } };
  return (
    <Sheet visible={!!project} onClose={onClose} title={project?.name ?? ""}>
      <View style={{ gap: theme.space.md }}>
        {project?.broken ? null : <SecondaryButton title="Rename" onPress={run(onRename)} />}
        {project?.broken ? null : <SecondaryButton title="Duplicate" onPress={run(onDuplicate)} />}
        <SecondaryButton title="Delete" danger onPress={run(onDelete)} />
      </View>
    </Sheet>
  );
}
```

`app/index.tsx`
```tsx
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, FlatList, View } from "react-native";
import { ProjectActionsSheet } from "@/src/projects/ProjectActionsSheet";
import { ProjectCard } from "@/src/projects/ProjectCard";
import { useProjects } from "@/src/projects/useProjects";
import type { ProjectSummary } from "@/src/projects";
import { theme } from "@/src/theme/theme";
import { EmptyState } from "@/src/ui/EmptyState";
import { haptic } from "@/src/ui/haptics";
import { PrimaryButton } from "@/src/ui/PrimaryButton";
import { Screen } from "@/src/ui/Screen";
import { Title } from "@/src/ui/Text";
import { ToastHost } from "@/src/ui/Toast";

export default function ProjectsScreen() {
  const { projects, loading, create, rename, duplicate, remove } = useProjects();
  const [actionsFor, setActionsFor] = useState<ProjectSummary | null>(null);

  const confirmDelete = (p: ProjectSummary) => Alert.alert("Delete project?", "This can't be undone.", [
    { text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => { haptic("medium"); remove(p.id); } }]);
  const promptRename = (p: ProjectSummary) => Alert.prompt("Rename project", undefined, (name) => name && rename(p.id, name), "plain-text", p.name);

  async function onNew() {
    const id = await create();
    if (id) router.push(`/editor/${id}`);
  }

  return (
    <Screen style={{ paddingTop: 60 }}>
      <View style={{ paddingHorizontal: theme.space.lg, marginBottom: theme.space.md }}>
        <Title size={26}>Your voyages</Title>
      </View>
      {loading ? <ActivityIndicator color={theme.colors.accent} style={{ marginTop: 40 }} /> : projects.length === 0 ? (
        <EmptyState emoji="🏝️" title="No clips yet" hint="Pick some videos from your library and start your first edit." />
      ) : (
        <FlatList data={projects} numColumns={2} keyExtractor={(p) => p.id} contentContainerStyle={{ padding: theme.space.sm, paddingBottom: 120 }}
          renderItem={({ item, index }) => <ProjectCard summary={item} index={index} onPress={() => (item.broken ? setActionsFor(item) : router.push(`/editor/${item.id}`))} onLongPress={() => { haptic("light"); setActionsFor(item); }} />} />
      )}
      <View style={{ position: "absolute", left: 0, right: 0, bottom: theme.space.xxl, alignItems: "center" }}>
        <PrimaryButton title="New clip" icon={null} onPress={onNew} />
      </View>
      <ProjectActionsSheet project={actionsFor} onClose={() => setActionsFor(null)} onRename={promptRename} onDuplicate={(p) => duplicate(p.id)} onDelete={confirmDelete} />
      <ToastHost />
    </Screen>
  );
}
```
The spec's header settings icon is omitted until Phase 4 gives it a destination (an inert control is a bug to the user) — note this in the report.

- [ ] **Step 4: Run** — `npx.cmd jest src/projects src/lib` → PASS; `npm run typecheck`; `npm test`.
- [ ] **Step 5: Commit**

```powershell
git add app/index.tsx src/projects src/lib
git commit -m "feat(home): Your Voyages grid, empty state, actions sheet"
```

---

### Task 6: Editor chrome — top bar, transport row, timeline colours

**Files:**
- Modify: `src/editor/components/EditorTopBar.tsx`, `src/editor/components/PreviewPlayer.tsx`, `src/editor/components/PreviewTag.tsx`, `src/editor/components/Timeline.tsx`, `src/editor/components/ClipThumbStrip.tsx`, `src/editor/components/OverlayPill.tsx`, `src/editor/components/MusicBar.tsx`, `app/editor/[id]/index.tsx`
- Create: `src/editor/components/TransportRow.tsx`
- Test: `src/editor/__tests__/TransportRow.test.tsx` (new), `src/editor/__tests__/EditorTopBar.test.tsx` (update)

**Interfaces (produced):** `<TransportRow />` — reads the store; buttons labelled `Undo`, `Redo`, `Play`/`Pause`, `Aspect ratio`; shows `m:ss / m:ss`.

- [ ] **Step 1: Failing tests** — `src/editor/__tests__/TransportRow.test.tsx`

```tsx
import { act, fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-02T10:00:00.000Z" }));
import { renameProject } from "@/src/editor/model/ops";
import { makeClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { TransportRow } from "../components/TransportRow";

beforeEach(() => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 21 })] }));
});

test("shows time and ratio; play toggles; undo/redo follow history", async () => {
  await render(<TransportRow />);
  expect(screen.getByText("0:00 / 0:21")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Aspect ratio" })).toHaveTextContent("9:16");
  expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
  await fireEvent.press(screen.getByRole("button", { name: "Play" }));
  expect(useEditorStore.getState().isPlaying).toBe(true);
  expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
  await act(() => { useEditorStore.getState().apply((p) => renameProject(p, "X")); });
  await fireEvent.press(screen.getByRole("button", { name: "Undo" }));
  expect(useEditorStore.getState().project?.name).toBe("Project 1");
  expect(screen.getByRole("button", { name: "Redo" })).toBeEnabled();
});

test("play is disabled for an empty project and restarts from 0 at the end", async () => {
  useEditorStore.getState().setProject(makeProject());
  await render(<TransportRow />);
  expect(screen.getByRole("button", { name: "Play" })).toBeDisabled();
});
```
In `EditorTopBar.test.tsx`: Undo/Redo assertions move to this file; the top bar test keeps Back, the name and `getByRole("button", { name: "Export" })`.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement**

`src/editor/components/TransportRow.tsx`
```tsx
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { View } from "react-native";
import { totalDuration } from "@/src/editor/model/timeline";
import { useEditorStore } from "@/src/editor/store";
import { formatDuration } from "@/src/lib/format";
import { theme } from "@/src/theme/theme";
import { IconButton } from "@/src/ui/IconButton";
import { PressableScale } from "@/src/ui/PressableScale";
import { Body } from "@/src/ui/Text";
import { RatioSheet } from "./RatioSheet";

/** Undo · time · play/pause · ratio · redo, between the preview and the timeline. */
export function TransportRow() {
  const project = useEditorStore((s) => s.project);
  const playhead = useEditorStore((s) => s.playhead);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const canUndo = useEditorStore((s) => s.past.length > 0);
  const canRedo = useEditorStore((s) => s.future.length > 0);
  const [ratioOpen, setRatioOpen] = useState(false);
  if (!project) return null;
  const { undo, redo, seek, setPlaying } = useEditorStore.getState();
  const total = totalDuration(project);
  const empty = project.clips.length === 0;
  const toggle = () => { if (!isPlaying && playhead >= total) seek(0); setPlaying(!isPlaying); };
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: theme.space.md, paddingVertical: theme.space.xs }}>
      <IconButton name="arrow-undo" accessibilityLabel="Undo" disabled={!canUndo} onPress={undo} />
      <Body style={{ fontVariant: ["tabular-nums"], fontSize: 12, minWidth: 84, textAlign: "center" }}>{`${formatDuration(playhead)} / ${formatDuration(total)}`}</Body>
      <PressableScale accessibilityRole="button" accessibilityLabel={isPlaying ? "Pause" : "Play"} accessibilityState={{ disabled: empty }} disabled={empty} onPress={toggle}
        style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.text, alignItems: "center", justifyContent: "center", opacity: empty ? 0.35 : 1 }}>
        <Ionicons name={isPlaying ? "pause" : "play"} size={20} color={theme.colors.onAccent} />
      </PressableScale>
      <PressableScale accessibilityRole="button" accessibilityLabel="Aspect ratio" onPress={() => setRatioOpen(true)}
        style={{ minWidth: 84, alignItems: "center" }}>
        <View style={{ borderWidth: 1, borderColor: theme.colors.hairline, borderRadius: theme.radius.pill, paddingHorizontal: theme.space.md, paddingVertical: 3 }}>
          <Body weight="semi" style={{ fontSize: 12 }}>{project.aspectRatio}</Body>
        </View>
      </PressableScale>
      <IconButton name="arrow-redo" accessibilityLabel="Redo" disabled={!canRedo} onPress={redo} />
      <RatioSheet visible={ratioOpen} onClose={() => setRatioOpen(false)} />
    </View>
  );
}
```
(Use the existing `formatDuration` so the label reads `0:00 / 0:21`; check its output format in `src/lib/format.ts` and adjust the test string if it differs.)

`EditorTopBar.tsx`: remove the Undo/Redo buttons; project name uses `Title size={16}` centred; the Export button becomes `<PrimaryButton compact title="Export" onPress={onExport} />` (accessible name stays "Export").

`app/editor/[id]/index.tsx`: wrap in `<Screen>` instead of the plain `View`s (loading and error states too, with `Title`/`Body`); insert `<TransportRow />` between the `slot-preview` view and the `slot-timeline` view.

`PreviewPlayer.tsx`: delete the bottom-right time chip (now in the transport row); keep the tap-to-play/pause and the centre play glyph; frame `borderRadius: 10`. `PreviewTag.tsx`: hairline pill (`borderColor: hairline`, `backgroundColor: scrimStrong`, `Body weight="semi"` 10 px, accent colour).

Timeline colours: the timeline container `backgroundColor: theme.colors.bgDeep`; selected clip outline `theme.colors.accent` 2 px; text/caption pills `laneText`, sticker pills `laneSticker`, music bar `laneMusic`; pill label colour `onAccent`; playhead `theme.colors.text`. Replace only colours — no layout, gesture or measurement changes.

- [ ] **Step 4: Run** — `npx.cmd jest src/editor` → PASS (update only colour/time-chip assertions in existing tests); `npm run typecheck`; `npm test`.
- [ ] **Step 5: Commit**

```powershell
git add src/editor app/editor
git commit -m "feat(editor): top bar, transport row, timeline in Grand Voyage colours"
```

---

### Task 7: Five-group toolbar

**Files:**
- Create: `src/editor/toolGroups.ts`
- Modify: `src/editor/components/EditorToolbar.tsx`
- Test: `src/editor/__tests__/toolGroups.test.ts` (new), `src/editor/__tests__/EditorToolbar.test.tsx` (update)

**Interfaces (produced):**
```ts
export type ToolGroupId = "edit" | "effects" | "text" | "stickers" | "audio";
export type ToolId = "split" | "trim" | "duplicate" | "delete" | "ratio" | "filter" | "speed" | "transition" | "templates" | "text" | "captions" | "sticker" | "music" | "volume";
export const TOOL_GROUPS: { id: ToolGroupId; label: string; icon: IoniconName; tools: ToolId[] }[];
export function groupForSelection(sel: { clipId: string | null; overlayKind: "text" | "caption" | "sticker" | null }): ToolGroupId | null;
```

- [ ] **Step 1: Failing tests**

`src/editor/__tests__/toolGroups.test.ts`
```ts
import { groupForSelection, TOOL_GROUPS } from "../toolGroups";

test("five groups in order with the spec's tools", () => {
  expect(TOOL_GROUPS.map((g) => [g.id, g.label, g.tools])).toEqual([
    ["edit", "Edit", ["split", "trim", "duplicate", "delete", "ratio"]],
    ["effects", "Effects", ["filter", "speed", "transition", "templates"]],
    ["text", "Text", ["text", "captions"]],
    ["stickers", "Stickers", ["sticker"]],
    ["audio", "Audio", ["music", "volume"]],
  ]);
});

test("every tool appears exactly once", () => {
  const all = TOOL_GROUPS.flatMap((g) => g.tools);
  expect(new Set(all).size).toBe(all.length);
  expect(all).toHaveLength(14);
});

test("groupForSelection", () => {
  expect(groupForSelection({ clipId: "a", overlayKind: null })).toBe("edit");
  expect(groupForSelection({ clipId: null, overlayKind: "text" })).toBe("text");
  expect(groupForSelection({ clipId: null, overlayKind: "caption" })).toBe("text");
  expect(groupForSelection({ clipId: null, overlayKind: "sticker" })).toBe("stickers");
  expect(groupForSelection({ clipId: null, overlayKind: null })).toBeNull();
});
```

`EditorToolbar.test.tsx` — add a helper and use it before querying a tool outside the default (`edit`) group:
```tsx
const openGroup = async (name: string) => { await fireEvent.press(screen.getByRole("tab", { name })); };
```
Rewrite the affected tests to the new structure (keep each test's intent and assertions):
- "clip tools are disabled without a selection": assert Split/Trim/Duplicate/Delete disabled and Ratio enabled in Edit; `await openGroup("Audio")` → Volume disabled; `await openGroup("Text")` → Text enabled.
- Text / Templates / Sticker / Captions / Music / Volume / Filter / Speed / Transition tests: open the owning group first.
Add:
```tsx
test("five group tabs; Edit is selected by default and only its tools show", async () => {
  await render(<EditorToolbar panelFor={null} onPanelChange={() => {}} transitionFor={null} onTransitionChange={() => {}} />);
  expect(screen.getAllByRole("tab").map((t) => t.props.accessibilityLabel)).toEqual(["Edit", "Effects", "Text", "Stickers", "Audio"]);
  expect(screen.getByRole("tab", { name: "Edit" })).toBeSelected();
  expect(screen.getByRole("button", { name: "Split" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Filter" })).toBeNull();
});

test("selecting a clip switches to Edit; selecting a sticker switches to Stickers; manual choice is otherwise kept", async () => {
  await render(<EditorToolbar panelFor={null} onPanelChange={() => {}} transitionFor={null} onTransitionChange={() => {}} />);
  await openGroup("Effects");
  expect(screen.getByRole("tab", { name: "Effects" })).toBeSelected();
  await act(() => { useEditorStore.getState().select("a"); });
  expect(screen.getByRole("tab", { name: "Edit" })).toBeSelected();
  await openGroup("Audio");
  await act(() => { useEditorStore.getState().select(null); });
  expect(screen.getByRole("tab", { name: "Audio" })).toBeSelected();
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement**

`src/editor/toolGroups.ts`
```ts
import type { Ionicons } from "@expo/vector-icons";

type IoniconName = keyof typeof Ionicons.glyphMap;
export type ToolGroupId = "edit" | "effects" | "text" | "stickers" | "audio";
export type ToolId = "split" | "trim" | "duplicate" | "delete" | "ratio" | "filter" | "speed" | "transition" | "templates" | "text" | "captions" | "sticker" | "music" | "volume";

/** The editor's bottom bar: five always-visible groups; the active group's tools show in the row above. */
export const TOOL_GROUPS: { id: ToolGroupId; label: string; icon: IoniconName; tools: ToolId[] }[] = [
  { id: "edit", label: "Edit", icon: "cut", tools: ["split", "trim", "duplicate", "delete", "ratio"] },
  { id: "effects", label: "Effects", icon: "sparkles", tools: ["filter", "speed", "transition", "templates"] },
  { id: "text", label: "Text", icon: "text", tools: ["text", "captions"] },
  { id: "stickers", label: "Stickers", icon: "happy", tools: ["sticker"] },
  { id: "audio", label: "Audio", icon: "musical-notes", tools: ["music", "volume"] },
];

/** Which group a new selection should jump to; null leaves the user's last choice alone. */
export function groupForSelection(sel: { clipId: string | null; overlayKind: "text" | "caption" | "sticker" | null }): ToolGroupId | null {
  if (sel.overlayKind === "sticker") return "stickers";
  if (sel.overlayKind) return "text";
  return sel.clipId ? "edit" : null;
}
```

`EditorToolbar.tsx` — keep every hook, handler, sheet and panel exactly as they are; replace only the `<ScrollView>` block and add group state:
```tsx
const [group, setGroup] = useState<ToolGroupId>("edit");
const overlayKind = useEditorStore((s) => s.project?.overlays.find((o) => o.id === s.selectedOverlayId)?.kind ?? null);
useEffect(() => { const g = groupForSelection({ clipId: selectedId, overlayKind }); if (g) setGroup(g); }, [selectedId, overlayKind]);

const TOOLS: Record<ToolId, { label: string; icon: IoniconName; disabled?: boolean; onPress: () => void }> = {
  split: { label: "Split", icon: "cut", disabled: noSel, onPress: () => { haptic("light"); apply((p) => splitClipAt(p, useEditorStore.getState().playhead)); } },
  trim: { label: "Trim", icon: "crop", disabled: noSel, onPress: () => setSheet("trim") },
  duplicate: { label: "Duplicate", icon: "copy", disabled: noSel, onPress: () => selectedId && apply((p) => duplicateClip(p, selectedId)) },
  delete: { label: "Delete", icon: "trash", disabled: noSel, onPress: () => { if (selectedId) { haptic("medium"); apply((p) => deleteClip(p, selectedId)); } } },
  ratio: { label: "Ratio", icon: "phone-portrait", onPress: () => setSheet("ratio") },
  filter: { label: "Filter", icon: "color-filter", disabled: noSel, onPress: () => setSheet("filter") },
  speed: { label: "Speed", icon: "speedometer", disabled: noSel, onPress: () => setSheet("speed") },
  transition: { label: "Transition", icon: "swap-horizontal", disabled: noSel || selectedIndex === clipCount - 1, onPress: () => onTransitionChange(selectedIndex) },
  templates: { label: "Templates", icon: "color-wand", disabled: !hasClips, onPress: () => setSheet("templates") },
  text: { label: "Text", icon: "text", disabled: !hasClips, onPress: addText },
  captions: { label: "Captions", icon: "chatbox-ellipses", disabled: !hasClips, onPress: () => setSheet("captions") },
  sticker: { label: "Sticker", icon: "happy", disabled: !hasClips, onPress: () => setSheet("sticker") },
  music: { label: "Music", icon: "musical-notes", onPress: () => setSheet("music") },
  volume: { label: "Volume", icon: "volume-high", disabled: noSel, onPress: () => setSheet("volume") },
};
const active = TOOL_GROUPS.find((g) => g.id === group)!;
```
```tsx
<View style={{ backgroundColor: theme.colors.surface, borderTopWidth: 1, borderTopColor: theme.colors.hairline, paddingBottom: 24 }}>
  <Animated.View key={group} entering={reduced ? undefined : FadeIn.duration(150)}
    style={{ flexDirection: "row", justifyContent: "center", paddingVertical: theme.space.xs, borderBottomWidth: 1, borderBottomColor: theme.colors.surfaceAlt }}>
    {active.tools.map((id) => <ToolButton key={id} {...TOOLS[id]} />)}
  </Animated.View>
  <View accessibilityRole="tablist" style={{ flexDirection: "row", justifyContent: "space-around", paddingTop: theme.space.xs }}>
    {TOOL_GROUPS.map((g) => <ToolButton key={g.id} role="tab" label={g.label} icon={g.icon} active={g.id === group} onPress={() => { haptic("light"); setGroup(g.id); }} />)}
  </View>
  {/* …all existing sheets and panels unchanged… */}
</View>
```
`FadeIn` comes from `react-native-reanimated` (confirm it exists in 4.5.1 and in the Jest mock; if the mock lacks it, add `FadeIn: { duration: () => undefined }` to the mock in `jest.setup.ts`). `reduced` is `useReducedMotion()`. Two labels now exist twice in the accessibility tree while their group is open — the tab "Text"/"Stickers" (role `tab`) and the tool "Text"/"Sticker" (role `button`): tests must query by role.

- [ ] **Step 4: Run** — `npx.cmd jest src/editor` → PASS; `npm run typecheck`; `npm test`.
- [ ] **Step 5: Commit**

```powershell
git add src/editor/toolGroups.ts src/editor/components/EditorToolbar.tsx src/editor/__tests__ jest.setup.ts
git commit -m "feat(editor): five-group toolbar with selection-aware group switching"
```

---

### Task 8: Export screen

**Files:**
- Modify: `src/export/ExportScreenBody.tsx`, `src/export/useExport.ts` (only if needed to expose the finished file size), `app/editor/[id]/export.tsx`
- Test: `src/export/__tests__/ExportScreenBody.test.tsx` (update + extend)

**Interfaces:** `ExportScreenBody` props unchanged. Consumes `ProgressRing`, `PrimaryButton`, `SecondaryButton`, `Screen`, `Title`, `Body`, `haptic`.

- [ ] **Step 1: Failing tests** — add to `ExportScreenBody.test.tsx` (reuse the file's existing `state`/prop builders):

```tsx
test("exporting shows the ring with the percentage and a Cancel button", async () => {
  await renderBody({ status: "exporting", progress: 0.42 });
  expect(screen.getByRole("progressbar")).toHaveProp("accessibilityValue", { min: 0, max: 100, now: 42 });
  expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
});

test("done shows Ready to sail, the summary line and Save / Share / Done; no Post button yet", async () => {
  await renderBody({ status: "done", progress: 1, fileUri: "file:///out.mp4" });
  expect(screen.getByText("Ready to sail")).toBeTruthy();
  expect(screen.getByText(/1080p · 0:\d\d/)).toBeTruthy();
  for (const n of ["Save to Photos", "Share", "Done"]) expect(screen.getByRole("button", { name: n })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /post/i })).toBeNull();
});

test("success haptic fires once when the export finishes", async () => {
  const view = await renderBody({ status: "exporting", progress: 0.9 });
  await rerenderBody(view, { status: "done", progress: 1, fileUri: "file:///out.mp4" });
  expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
});
```
(`renderBody`/`rerenderBody`: small helpers in the test file that render `ExportScreenBody` with a one-clip project and the given state; write them from the file's existing setup. Import `* as Haptics from "expo-haptics"` and `jest.clearAllMocks()` in `beforeEach`.)

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** `ExportScreenBody.tsx` body (logic and props untouched):

```tsx
const wasDone = useRef(false);
useEffect(() => { if (state.status === "done" && !wasDone.current) haptic("success"); wasDone.current = state.status === "done"; }, [state.status]);
const resLabel = RESOLUTIONS.find((r) => r.value === res)?.label ?? "";

return (
  <Screen style={{ padding: theme.space.xl, paddingTop: 48, gap: theme.space.xl }}>
    <Title size={26}>Export</Title>
    {(state.status === "idle" || state.status === "unavailable") && (
      <View style={{ gap: theme.space.sm }}>
        <Body muted>Resolution</Body>
        <View style={{ flexDirection: "row", gap: theme.space.md }}>
          {RESOLUTIONS.map((r) => <Chip key={r.value} label={r.label} selected={res === r.value} disabled={r.value === 2160 && !has4K} onPress={() => setRes(r.value)} />)}
        </View>
        {!has4K && <Body muted style={{ fontSize: 12 }}>4K needs a 4K source clip.</Body>}
        <Body muted>Estimated size: {formatBytes(estimateBytes(duration, res))}</Body>
      </View>
    )}
    {state.status === "unavailable" && (
      <View style={{ backgroundColor: theme.colors.surface, borderColor: theme.colors.hairline, borderWidth: 1, borderRadius: theme.radius.card, padding: theme.space.xl, gap: theme.space.sm }}>
        <Title size={16}>Export needs the native build</Title>
        <Body>Rendering the final video uses Clipy's Swift engine, which Expo Go can't load. Install a development build to export.</Body>
        <Body muted>Everything else in Clipy works in Expo Go.</Body>
      </View>
    )}
    {state.status === "idle" && <PrimaryButton title="Export" icon={<Compass size={18} />} onPress={() => start(res)} />}
    {state.status === "exporting" && (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: theme.space.xl }}>
        <ProgressRing progress={state.progress} size={140} />
        <SecondaryButton title="Cancel" onPress={cancel} />
      </View>
    )}
    {state.status === "done" && (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: theme.space.md }}>
        <ProgressRing progress={1} size={120} done />
        <Title size={20}>Ready to sail</Title>
        <Body muted>{`${resLabel} · ${formatDuration(duration)}`}</Body>
        <View style={{ alignSelf: "stretch", gap: theme.space.md, marginTop: theme.space.lg }}>
          <PrimaryButton title="Save to Photos" onPress={onSave} />
          <SecondaryButton title="Share" onPress={onShare} />
          <SecondaryButton title="Done" onPress={onDone} />
        </View>
      </View>
    )}
    {state.status === "error" && (
      <View style={{ gap: theme.space.md }}>
        <Body style={{ color: theme.colors.danger }}>{state.message}</Body>
        <PrimaryButton title="Try again" onPress={reset} />
      </View>
    )}
  </Screen>
);
```
The spec's finished line also shows the file size and a "Post to…" button: the size needs the exported file's byte count, which `ExportState` does not carry, and Post arrives with Phase 4 — both are deliberately left for Phase 4 (say so in the report). Until then Save to Photos is the gold action. Keep whatever the existing tests assert about the idle/unavailable/error states working; update `"Share…"` → `"Share"` where asserted.

- [ ] **Step 4: Run** — `npx.cmd jest src/export` → PASS; `npm run typecheck`; `npm test`.
- [ ] **Step 5: Commit**

```powershell
git add src/export app/editor
git commit -m "feat(export): progress ring, Ready to sail finish, success haptic"
```

---

### Task 9: Sheet contents polish, docs, final checks

**Files:**
- Modify: `src/editor/components/{FilterSheet,TemplateSheet,TransitionSheet,RatioSheet,SpeedSheet,VolumeSheet,MusicSheet,TrimSheet,StickerSheet,StickerPanel,TextPanel,CaptionsSheet,CaptionStyleSheet,FontStrip,ColorRow,CutMarker,SelectionFrame,TrimHandles,ReorderHandle}.tsx`, `README.md`, `AGENTS.md`, `docs/superpowers/specs/2026-10-02-ui-redesign-grand-voyage-design.md` (Status line)
- Test: existing suites; `src/editor/__tests__/sheetStyle.test.tsx` (new)

- [ ] **Step 1: Failing test** — `src/editor/__tests__/sheetStyle.test.tsx`

```tsx
import { render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-02T10:00:00.000Z" }));
import { makeClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { FilterSheet } from "../components/FilterSheet";
import { SpeedSheet } from "../components/SpeedSheet";

beforeEach(() => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4, filter: "warm" })] }));
});

test("the selected filter tile carries the gold ring", async () => {
  await render(<FilterSheet clipId="a" visible onClose={() => {}} />);
  expect(screen.getByTestId("filter-tile-warm")).toHaveStyle(theme.ring);
  expect(screen.getByTestId("filter-tile-none")).not.toHaveStyle({ borderColor: theme.ring.borderColor });
});

test("sliders use the accent track and thumb", async () => {
  await render(<SpeedSheet clipId="a" visible onClose={() => {}} />);
  const s = screen.getByTestId("speed-slider");
  expect(s.props.minimumTrackTintColor).toBe(theme.colors.accent);
  expect(s.props.thumbTintColor).toBe(theme.colors.accent);
  expect(s.props.maximumTrackTintColor).toBe(theme.colors.surfaceAlt);
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Apply these rules to every file listed** (colours/typography only — no logic, layout-measurement or gesture changes):
  1. **Selected item in a grid or strip** (filter tiles, template tiles, transition types, ratio options, font strip, emoji/shape tiles, colour swatches): spread `theme.ring` on the selected tile; unselected tiles get `{ borderWidth: 2, borderColor: "transparent" }` so nothing shifts. Give filter tiles `testID={`filter-tile-${id}`}` on the element that carries the ring.
  2. **Every `<Slider>`**: `minimumTrackTintColor={theme.colors.accent} maximumTrackTintColor={theme.colors.surfaceAlt} thumbTintColor={theme.colors.accent}`.
  3. **Text**: raw `<Text>` for UI labels → `Body` (with `muted` / `weight` as fits); section headings inside sheets → `Body weight="semi"` 12 px muted uppercase; no inline `fontWeight` strings left on UI text.
  4. **Buttons inside sheets**: the one confirming/primary action → `PrimaryButton compact`; others → `SecondaryButton`; destructive → `SecondaryButton danger`. A sheet-level "apply to all" style action moves into the `Sheet` `action` prop where one exists (FilterSheet's "Apply to all clips").
  5. **Editing handles** (`SelectionFrame`, `TrimHandles`, `ReorderHandle`, `CutMarker`): handle and outline colour `theme.colors.accent`; icon colour on accent `theme.colors.onAccent`.
  6. **Inputs** (`TextPanel` text field, `NumField`s): `surfaceAlt` background, `text` colour, `fonts.body`, radius `chip`.
  7. Keep all `accessibilityLabel`s, `testID`s and roles. Add haptics: `haptic("light")` when a filter, template or transition is applied.

- [ ] **Step 4: Docs** — `README.md`: add a "Design" section (Grand Voyage palette, Oswald/Montserrat UI fonts with OFL note, five-group toolbar, `npm run gen:brand`). `AGENTS.md`: add under "This repo (Clipy)": `- UI: every colour, font, radius and duration comes from src/theme/theme.ts and the kit in src/ui/ — no hex literals in screens (guarded by src/__tests__/noHexLiterals.test.ts). UI fonts (src/theme/uiFonts.ts) are separate from overlay fonts (src/editor/fonts.ts).` Spec Status line → `Implemented 2026-10-02 (on-device checklist pending; home settings icon, export file size and "Post to…" land with Phase 4)`.

- [ ] **Step 5: Full verification** — `npm run typecheck`; `npm test`; `npx.cmd expo-doctor`; `npm ls --all | Select-String invalid` (expect empty). Grep once more for `highlight|straw|fonts\.heading|Bangers` in `src/ui`, `app/` and non-`fonts.ts` editor files — expect no UI use of Bangers.

- [ ] **Step 6: Commit**

```powershell
git add src/editor README.md AGENTS.md docs/superpowers/specs/2026-10-02-ui-redesign-grand-voyage-design.md
git commit -m "feat(ui): unified sheet contents, gold rings and sliders; docs"
```

**On-device checklist (the user runs this in Expo Go; not part of the automated task):** loading animation and hand-off → empty home → new clip → grid card → editor groups switch and auto-switch on selection → each sheet springs up and swipes down → split/delete vibrate → Reduce Motion on: fades only.
