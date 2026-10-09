import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";
import { theme } from "@/src/theme/theme";
import { PressableScale } from "./PressableScale";

type Props = { label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void; disabled?: boolean; active?: boolean };

export function ToolButton({ label, icon, onPress, disabled, active }: Props) {
  return (
    <PressableScale lifted={!!active} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled, selected: !!active }}
      disabled={disabled} onPress={onPress} style={{ alignItems: "center", width: theme.size.toolColumn, paddingVertical: theme.space.xs, gap: theme.space.xs, opacity: disabled ? 0.35 : 1 }}>
      <View style={[{ width: theme.size.toolBox, height: theme.size.toolBox, borderRadius: theme.radius.box, alignItems: "center", justifyContent: "center",
        backgroundColor: active ? theme.elevation.lifted : theme.elevation.tile }, active ? theme.ring : theme.ringClear]}>
        <Ionicons name={icon} size={theme.size.icon.md} color={active ? theme.colors.accent : theme.colors.text} />
      </View>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={{ fontWeight: active ? theme.weight.semi : theme.weight.regular, color: active ? theme.colors.accent : theme.colors.text, fontSize: theme.type.small }}>{label}</Text>
    </PressableScale>
  );
}