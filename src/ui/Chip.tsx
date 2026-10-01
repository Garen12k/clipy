import { Pressable, Text } from "react-native";
import { theme } from "@/src/theme/theme";

type Props = { label: string; selected: boolean; onPress: () => void; disabled?: boolean };

export function Chip({ label, selected, onPress, disabled }: Props) {
  return (
    <Pressable
      accessibilityRole="button" accessibilityLabel={label}
      accessibilityState={{ selected, disabled: !!disabled }}
      disabled={disabled} onPress={onPress}
      style={{
        paddingVertical: theme.space.sm, paddingHorizontal: theme.space.lg, borderRadius: theme.radius.chip,
        backgroundColor: selected ? theme.colors.accent : theme.colors.surfaceAlt,
        borderWidth: 1, borderColor: selected ? theme.colors.accent : theme.colors.straw, opacity: disabled ? 0.4 : 1,
      }}
    >
      <Text style={{ color: theme.colors.text, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}
