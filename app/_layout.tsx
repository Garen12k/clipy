import { Bangers_400Regular, useFonts } from "@expo-google-fonts/bangers";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { theme } from "@/src/theme/theme";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [loaded] = useFonts({ Bangers_400Regular });
  useEffect(() => { if (loaded) SplashScreen.hideAsync().catch(() => {}); }, [loaded]);
  if (!loaded) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.bg } }} />
    </GestureHandlerRootView>
  );
}
