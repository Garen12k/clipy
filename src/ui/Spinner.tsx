import { ActivityIndicator, type StyleProp, type ViewStyle } from "react-native";
import { useSurfaces } from "./tone";

/** The gold iOS spinner — the gold as ink of the family it is drawn in (the system's own animation, not one of ours). */
export function Spinner({ label, style }: { /** What is being waited for (accessibility label). */ label?: string; style?: StyleProp<ViewStyle> }) {
  const s = useSurfaces();
  return <ActivityIndicator color={s.accentInk} accessibilityLabel={label} style={style} />;
}
