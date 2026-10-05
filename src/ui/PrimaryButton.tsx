import { Text } from "react-native";
import { theme } from "@/src/theme/theme";
import { buttonBox, buttonLabel, DISABLED_OPACITY } from "./buttonStyle";
import { PressableScale } from "./PressableScale";

type Props = { title: string; onPress: () => void; disabled?: boolean; icon?: React.ReactNode; compact?: boolean; /** Defaults to `title`; set it when several buttons on a screen share a title. */ accessibilityLabel?: string };

export function PrimaryButton({ title, onPress, disabled, icon, compact, accessibilityLabel }: Props) {
  return (
    <PressableScale testID="primary-button" accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title} accessibilityState={{ disabled: !!disabled }}
      disabled={disabled} onPress={onPress}
      style={[buttonBox(compact), { backgroundColor: theme.colors.accent, opacity: disabled ? DISABLED_OPACITY : 1 }]}>
      {icon ?? null}
      <Text style={[buttonLabel(compact), { color: theme.colors.onAccent }]}>{title}</Text>
    </PressableScale>
  );
}