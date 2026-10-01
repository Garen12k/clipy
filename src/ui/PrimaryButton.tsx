import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";
import { theme } from "@/src/theme/theme";

type Props = { title: string; onPress: () => void; disabled?: boolean; icon?: React.ReactNode };

export function PrimaryButton({ title, onPress, disabled, icon }: Props) {
  return (
    <Pressable
      testID="primary-button"
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: pressed ? theme.colors.accentPressed : theme.colors.accent,
        opacity: disabled ? 0.4 : 1,
        borderRadius: theme.radius.card,
        paddingVertical: theme.space.lg,
        paddingHorizontal: theme.space.xl,
        flexDirection: "row", alignItems: "center", justifyContent: "center", gap: theme.space.sm,
      })}
    >
      {icon ?? null}
      <Text style={{ fontFamily: theme.fonts.heading, fontSize: 22, color: theme.colors.text, letterSpacing: 1 }}>{title}</Text>
    </Pressable>
  );
}
export { Ionicons };
