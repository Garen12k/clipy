import { LinearGradient } from "expo-linear-gradient";
import type { ViewStyle } from "react-native";
import { theme } from "@/src/theme/theme";

/** Full-screen navy gradient every screen sits on. */
export function Screen({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <LinearGradient colors={[theme.colors.bg, theme.colors.bgEnd]} style={[{ flex: 1 }, style]}>{children}</LinearGradient>;
}