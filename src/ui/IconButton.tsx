import { Ionicons } from "@expo/vector-icons";
import { Pressable } from "react-native";
import { theme } from "@/src/theme/theme";

type Props = { name: keyof typeof Ionicons.glyphMap; onPress: () => void; disabled?: boolean; accessibilityLabel: string; color?: string };

export function IconButton({ name, onPress, disabled, accessibilityLabel, color = theme.colors.text }: Props) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled: !!disabled }}
      disabled={disabled} onPress={onPress} hitSlop={8}
      style={({ pressed }) => ({ padding: theme.space.sm, opacity: disabled ? 0.35 : pressed ? 0.6 : 1 })}>
      <Ionicons name={name} size={24} color={color} />
    </Pressable>
  );
}
