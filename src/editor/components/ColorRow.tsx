import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { theme } from "@/src/theme/theme";

/** User-content colours (burned into exports): fixed literals, independent of the UI theme. */
export const DEFAULT_STICKER_COLOR = "#F5C542";
export const PALETTE = ["#F4F4F5", "#F5C542", "#C8102E", "#2E86AB", "#D9B36A", "#000000", "#FFFFFF", "#00E5A0"] as const;
/** True black as rendered behind a clip (user content, not a theme token). */
export const CONTENT_BLACK = "#000000";
const isHex = (s: string) => /^#[0-9A-Fa-f]{6}$/.test(s);

/** `compact`: the swatches in one row that does not wrap and no "Custom color" field (a keyboard would cover a bottom strip). */
export function ColorRow({ value, onChange, compact }: { value: string; onChange: (hex: string) => void; compact?: boolean }) {
  const [custom, setCustom] = useState(value);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space.sm, flexWrap: compact ? "nowrap" : "wrap" }}>
      {PALETTE.map((c) => (
        <Pressable key={c} accessibilityLabel={`Color ${c}`} onPress={() => onChange(c)}
          style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c, borderWidth: 2, borderColor: value.toUpperCase() === c.toUpperCase() ? theme.ring.borderColor : "transparent" }} />
      ))}
      {compact ? null : <TextInput accessibilityLabel="Custom color" value={custom} onChangeText={setCustom} onBlur={() => isHex(custom) && onChange(custom.toUpperCase())}
        autoCapitalize="characters" maxLength={7} placeholder="#RRGGBB" placeholderTextColor={theme.colors.textMuted}
        style={{ color: theme.colors.text, fontFamily: theme.fonts.body, backgroundColor: theme.elevation.tile, borderRadius: theme.radius.chip, paddingHorizontal: theme.space.md, paddingVertical: theme.space.sm, width: 96 }} />}
    </View>
  );
}
