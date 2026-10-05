import { ScrollView, Text, Pressable } from "react-native";
import { FONT_IDS, FONTS } from "@/src/editor/fonts";
import type { FontId } from "@/src/editor/model/types";
import { theme } from "@/src/theme/theme";

export function FontStrip({ value, onChange }: { value: FontId; onChange: (f: FontId) => void }) {
  return (
    <ScrollView testID="font-strip" horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: theme.space.sm }}>
      {FONT_IDS.map((id) => (
        <Pressable key={id} accessibilityRole="button" accessibilityLabel={FONTS[id].label} accessibilityState={{ selected: id === value }} onPress={() => onChange(id)}
          style={[{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: theme.radius.chip, backgroundColor: theme.colors.surfaceAlt }, id === value ? theme.ring : { borderWidth: 2, borderColor: "transparent" }]}>
          <Text style={{ fontFamily: FONTS[id].family, fontSize: 18, color: theme.colors.text }}>{FONTS[id].label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
