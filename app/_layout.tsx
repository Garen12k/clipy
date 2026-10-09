import { useFonts } from "expo-font";
import { Stack, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useCallback, useEffect, useState } from "react";
import type { LayoutChangeEvent } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { coverFontAssets } from "@/src/editor/coverFont";
import { fontAssets } from "@/src/editor/fonts";
import { ROUTE_NAMES, ROUTE_OPTIONS, scopeOf, STACK_OPTIONS } from "@/src/navigation/screenOptions";
import { applyAppearance, LAUNCH_APPEARANCE, useShownAppearance } from "@/src/theme/appearance";
import { LoadingScreen } from "@/src/ui/LoadingScreen";
import { ShownContext, useSurfaces } from "@/src/ui/tone";
import { useAppReady } from "@/src/ui/useAppReady";

// The app follows the phone's appearance. Said before anything is drawn: this reads the phone's setting, so the first frame already
// wears it, and tells iOS that the navy loading screen is up (src/theme/appearance.ts).
applyAppearance("overDark");
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [loaded] = useFonts({ ...fontAssets, ...coverFontAssets });
  const { ready } = useAppReady(loaded);
  const [gone, setGone] = useState(false);
  const onGone = useCallback(() => setGone(true), []);
  // Our own loading screen is the first thing drawn, so the native splash can go as soon as it lays out.
  const hideSplash = useCallback(() => { SplashScreen.hideAsync().catch(() => {}); }, []);
  // The appearance the screens wear, handed down as context: when the phone's setting changes, the parts that read it are drawn
  // again where they stand. The provider draws no view and never changes place, so no screen is remounted — and the editor's own
  // `Screen` pins its appearance, so nothing in the editor is drawn again at all.
  const shown = useShownAppearance();
  return (
    <ShownContext.Provider value={shown}>
      <Backing onLayout={hideSplash}>
        <SystemAppearance covered={!gone} />
        {ready ? (
          <Stack screenOptions={STACK_OPTIONS[shown]}>
            {ROUTE_NAMES.map((name) => <Stack.Screen key={name} name={name} options={ROUTE_OPTIONS[name]} />)}
          </Stack>
        ) : null}
        {/* The loading screen continues the native launch screen, which is navy whatever the phone says: it stays navy, and fades to the app. */}
        {gone ? null : <ShownContext.Provider value={LAUNCH_APPEARANCE}><LoadingScreen leaving={ready} onGone={onGone} /></ShownContext.Provider>}
      </Backing>
    </ShownContext.Provider>
  );
}

/** The root view, in the page colour of the appearance shown: what is behind every screen that is not the editor. */
function Backing({ children, onLayout }: { children: React.ReactNode; onLayout: (e: LayoutChangeEvent) => void }) {
  const s = useSurfaces();
  return <GestureHandlerRootView style={{ flex: 1, backgroundColor: s.page }} onLayout={onLayout}>{children}</GestureHandlerRootView>;
}

/**
 * Tells iOS where the app is whenever the focused route changes (and while the loading screen covers it), so that what the system
 * draws — the status bar, the keyboard, alerts, pickers — matches what is on screen: dark in the editor, the phone's own elsewhere.
 * It draws nothing, and it is its own component so that a navigation re-renders IT and not the layout.
 */
function SystemAppearance({ covered }: { covered: boolean }) {
  const scope = scopeOf(useSegments());
  const next = covered ? "overDark" : scope;
  useEffect(() => { applyAppearance(next); }, [next]);
  return null;
}
