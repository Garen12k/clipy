import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/src/theme/theme";
import { PressableScale } from "./PressableScale";

type Props = { name: keyof typeof Ionicons.glyphMap; onPress: () => void; disabled?: boolean; accessibilityLabel: string; color?: string };

export function IconButton({ name, onPress, disabled, accessibilityLabel, color = theme.colors.text }: Props) {
  return (
    <PressableScale accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled: !!disabled }}
      disabled={disabled} onPress={onPress} hitSlop={8}
      style={{ width: theme.size.iconButton, height: theme.size.iconButton, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.35 : 1 }}>
      <Ionicons name={name} size={theme.size.icon.lg} color={color} />
    </PressableScale>
  );
}