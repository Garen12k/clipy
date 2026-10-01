import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { theme } from "@/src/theme/theme";

export const PALETTE = [theme.colors.text, theme.colors.highlight, theme.colors.accent, theme.colors.sea, theme.colors.straw, "#000000", "#FFFFFF", "#00E5A0"] as const;
const isHex = (s: string) => /^#[0-9A-Fa-f]{6}$/.test(s);

export function ColorRow({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const [custom, setCustom] = useState(value);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space.sm, flexWrap: "wrap" }}>
      {PALETTE.map((c) => (
        <Pressable key={c} accessibilityLabel={`Color ${c}`} onPress={() => onChange(c)}
          style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c, borderWidth: 2, borderColor: value.toUpperCase() === c.toUpperCase() ? theme.colors.highlight : theme.colors.surfaceAlt }} />
      ))}
      <TextInput accessibilityLabel="Custom color" value={custom} onChangeText={setCustom} onBlur={() => isHex(custom) && onChange(custom.toUpperCase())}
        autoCapitalize="characters" maxLength={7} placeholder="#RRGGBB" placeholderTextColor={theme.colors.textMuted}
        style={{ color: theme.colors.text, backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.chip, paddingHorizontal: 10, paddingVertical: 6, width: 96 }} />
    </View>
  );
}
