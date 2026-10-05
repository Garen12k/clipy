import { ScrollView, Text } from "react-native";
import { FONT_IDS, FONTS } from "@/src/editor/fonts";
import type { FontId } from "@/src/editor/model/types";
import { theme } from "@/src/theme/theme";
import { PressableScale } from "@/src/ui/PressableScale";

export function FontStrip({ value, onChange }: { value: FontId; onChange: (f: FontId) => void }) {
  return (
    <ScrollView testID="font-strip" horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: theme.space.sm }}>
      {FONT_IDS.map((id) => (
        <PressableScale key={id} accessibilityRole="button" accessibilityLabel={FONTS[id].label} accessibilityState={{ selected: id === value }} onPress={() => onChange(id)}
          style={[{ paddingVertical: theme.space.sm, paddingHorizontal: theme.space.lg, borderRadius: theme.radius.chip, backgroundColor: id === value ? theme.elevation.lifted : theme.elevation.tile }, id === value ? theme.ring : theme.ringClear]}>
          <Text style={{ fontFamily: FONTS[id].family, fontSize: 18, color: theme.colors.text }}>{FONTS[id].label}</Text>
        </PressableScale>
      ))}
    </ScrollView>
  );
}
