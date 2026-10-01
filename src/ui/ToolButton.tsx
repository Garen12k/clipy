import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text } from "react-native";
import { theme } from "@/src/theme/theme";

type Props = { label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void; disabled?: boolean; active?: boolean };

export function ToolButton({ label, icon, onPress, disabled, active }: Props) {
  const color = active ? theme.colors.highlight : theme.colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, selected: !!active }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({ alignItems: "center", width: 72, paddingVertical: theme.space.sm, opacity: disabled ? 0.35 : pressed ? 0.7 : 1 })}
    >
      <Ionicons name={icon} size={24} color={color} />
      <Text style={{ color, fontSize: 12, marginTop: 4 }}>{label}</Text>
    </Pressable>
  );
}
