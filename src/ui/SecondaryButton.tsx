import { Text } from "react-native";
import { theme } from "@/src/theme/theme";
import { buttonBox, buttonLabel, buttonSlop, DISABLED_OPACITY } from "./buttonStyle";
import { PressableScale } from "./PressableScale";

type Props = { title: string; onPress: () => void; disabled?: boolean; danger?: boolean; compact?: boolean; /** Defaults to `title`; set it when several buttons on a screen share a title. */ accessibilityLabel?: string };

export function SecondaryButton({ title, onPress, disabled, danger, compact, accessibilityLabel }: Props) {
  const color = danger ? theme.colors.danger : theme.colors.text;
  return (
    <PressableScale accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} hitSlop={buttonSlop(compact)}
      style={[buttonBox(compact), { borderWidth: 1.5, borderColor: danger ? theme.colors.danger : theme.colors.hairline, opacity: disabled ? DISABLED_OPACITY : 1 }]}>
      <Text style={[buttonLabel(compact), { color }]}>{title}</Text>
    </PressableScale>
  );
}