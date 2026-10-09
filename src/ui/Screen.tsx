import { View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "@/src/theme/theme";

export type Edge = "top" | "bottom";

/**
 * The full-screen page every screen sits on. Pads each listed edge by its safe-area inset plus
 * `theme.space.sm`, so content clears the status bar / Dynamic Island and the home indicator.
 * Pass `edges={[]}` for a full-bleed screen. A `paddingTop`/`paddingBottom` in `style` overrides the edge padding.
 */
export function Screen({ children, style, edges = ["top"] }: { children: React.ReactNode; style?: ViewStyle; edges?: readonly Edge[] }) {
  const insets = useSafeAreaInsets();
  const pad: ViewStyle = {};
  if (edges.includes("top")) pad.paddingTop = insets.top + theme.space.sm;
  if (edges.includes("bottom")) pad.paddingBottom = insets.bottom + theme.space.sm;
  return <View style={[{ flex: 1, backgroundColor: theme.colors.bg }, pad, style]}>{children}</View>;
}
