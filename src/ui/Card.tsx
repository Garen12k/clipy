import { View, type StyleProp, type ViewStyle } from "react-native";
import { theme } from "@/src/theme/theme";
import { useSurfaces } from "./tone";

/** The one card surface: a step lighter than the page, the quiet separator edge, no shadow. Its two colours are the family's (tone.ts). */
export const cardShape: ViewStyle = { borderWidth: 1, borderRadius: theme.radius.card, padding: theme.space.lg };

export function Card({ children, style, testID }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  const s = useSurfaces();
  return <View testID={testID} style={[cardShape, { backgroundColor: s.bar, borderColor: s.separator }, style]}>{children}</View>;
}
