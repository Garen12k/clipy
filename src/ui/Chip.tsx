import { Pressable, Text } from "react-native";
import { theme } from "@/src/theme/theme";

type Props = { label: string; selected: boolean; onPress: () => void; disabled?: boolean; accessibilityLabel?: string };

export function Chip({ label, selected, onPress, disabled, accessibilityLabel }: Props) {
  return (
    <Pressable
      accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected, disabled: !!disabled }}
      disabled={disabled} onPress={onPress}
      style={{
        paddingVertical: theme.space.sm, paddingHorizontal: theme.space.lg, borderRadius: theme.radius.chip,
        backgroundColor: selected ? theme.colors.accent : theme.colors.surfaceAlt,
        borderWidth: 1, borderColor: selected ? theme.colors.accent : theme.colors.hairline, opacity: disabled ? 0.4 : 1,
      }}
    >
      <Text style={{ fontFamily: theme.fonts.bodySemi, color: selected ? theme.colors.onAccent : theme.colors.text }}>{label}</Text>
    </Pressable>
  );
}
