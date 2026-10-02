import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";
import { theme } from "@/src/theme/theme";
import { PressableScale } from "./PressableScale";

type Props = { label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void; disabled?: boolean; active?: boolean; role?: "button" | "tab" };

export function ToolButton({ label, icon, onPress, disabled, active, role = "button" }: Props) {
  return (
    <PressableScale accessibilityRole={role} accessibilityLabel={label} accessibilityState={{ disabled: !!disabled, selected: !!active }}
      disabled={disabled} onPress={onPress} style={{ alignItems: "center", width: 68, paddingVertical: theme.space.sm, opacity: disabled ? 0.35 : 1 }}>
      <View style={{ width: 40, height: 40, borderRadius: theme.radius.tile + 5, alignItems: "center", justifyContent: "center",
        backgroundColor: active ? theme.colors.accent : theme.colors.surfaceAlt }}>
        <Ionicons name={icon} size={20} color={active ? theme.colors.onAccent : theme.colors.text} />
      </View>
      <Text numberOfLines={1} style={{ fontFamily: active ? theme.fonts.bodySemi : theme.fonts.body, color: active ? theme.colors.accent : theme.colors.text, fontSize: 11, marginTop: 4 }}>{label}</Text>
    </PressableScale>
  );
}