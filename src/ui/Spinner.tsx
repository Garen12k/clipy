import { ActivityIndicator, type StyleProp, type ViewStyle } from "react-native";
import { theme } from "@/src/theme/theme";

/** The gold iOS spinner (the system's own animation, not one of ours). */
export function Spinner({ label, style }: { /** What is being waited for (accessibility label). */ label?: string; style?: StyleProp<ViewStyle> }) {
  return <ActivityIndicator color={theme.colors.accent} accessibilityLabel={label} style={style} />;
}
