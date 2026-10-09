import { Text } from "react-native";
import { theme } from "@/src/theme/theme";
import { useSurfaces } from "./tone";
import { buttonBox, buttonLabel, buttonSlop, DISABLED_OPACITY } from "./buttonStyle";
import { PressableScale } from "./PressableScale";

type Props = { title: string; onPress: () => void; disabled?: boolean; danger?: boolean; /** Drawn before the title, like SecondaryButton’s; the caller gives it the label’s colour. */ icon?: React.ReactNode; compact?: boolean; /** Defaults to `title`. */ accessibilityLabel?: string };

/** The third kind of button: text only (gold; red for `danger`). Same height, label style and press feedback as the other two. */
export function QuietButton({ title, onPress, disabled, danger, icon, compact, accessibilityLabel }: Props) {
  const s = useSurfaces();
  return (
    <PressableScale accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress}
      hitSlop={buttonSlop(compact)}
      style={[buttonBox(compact), { paddingHorizontal: theme.space.sm, minWidth: theme.size.touch, opacity: disabled ? DISABLED_OPACITY : 1 }]}>
      {icon ?? null}
      <Text style={[buttonLabel(compact), { color: danger ? s.dangerText : theme.colors.accent }]}>{title}</Text>
    </PressableScale>
  );
}
