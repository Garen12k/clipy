import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useCallback, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { fontAssets } from "@/src/editor/fonts";
import { ROUTE_NAMES, ROUTE_OPTIONS, STACK_OPTIONS } from "@/src/navigation/screenOptions";
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
        <Stack screenOptions={STACK_OPTIONS}>
          {ROUTE_NAMES.map((name) => <Stack.Screen key={name} name={name} options={ROUTE_OPTIONS[name]} />)}
        </Stack>
      ) : null}
      {gone ? null : <LoadingScreen leaving={ready} onGone={onGone} />}
    </GestureHandlerRootView>
  );
}
