import { Text } from "react-native";
import { theme } from "@/src/theme/theme";
import { buttonBox, buttonLabel, buttonSlop, DISABLED_OPACITY } from "./buttonStyle";
import { PressableScale } from "./PressableScale";

type Props = { title: string; onPress: () => void; disabled?: boolean; danger?: boolean; compact?: boolean; /** Defaults to `title`. */ accessibilityLabel?: string };

/** The third kind of button: text only (gold; red for `danger`). Same height, label style and press feedback as the other two. */
export function QuietButton({ title, onPress, disabled, danger, compact, accessibilityLabel }: Props) {
  return (
    <PressableScale accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress}
      hitSlop={buttonSlop(compact)}
      style={[buttonBox(compact), { paddingHorizontal: theme.space.sm, minWidth: theme.size.touch, opacity: disabled ? DISABLED_OPACITY : 1 }]}>
      <Text style={[buttonLabel(compact), { color: danger ? theme.colors.dangerText : theme.colors.accent }]}>{title}</Text>
    </PressableScale>
  );
}
