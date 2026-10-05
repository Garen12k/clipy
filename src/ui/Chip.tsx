import { Text } from "react-native";
import { theme } from "@/src/theme/theme";
import { PressableScale } from "./PressableScale";

type Props = { label: string; selected: boolean; onPress: () => void; disabled?: boolean; accessibilityLabel?: string;
  /** Smaller padding and 12-pt text: tab chips and Reset inside a strip. */
  compact?: boolean;
};

export function Chip({ label, selected, onPress, disabled, accessibilityLabel, compact }: Props) {
  return (
    <PressableScale
      accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected, disabled: !!disabled }}
      disabled={disabled} onPress={onPress} hitSlop={compact ? { top: 10, bottom: 10, left: 4, right: 4 } : undefined}
      style={{
        paddingVertical: compact ? theme.space.xs : theme.space.sm, paddingHorizontal: compact ? theme.space.md : theme.space.lg, borderRadius: theme.radius.pill,
        backgroundColor: selected ? theme.colors.accent : theme.colors.surfaceAlt,
        borderWidth: 1, borderColor: selected ? theme.colors.accent : theme.colors.hairline, opacity: disabled ? 0.4 : 1,
      }}
    >
      <Text style={{ fontFamily: theme.fonts.bodySemi, color: selected ? theme.colors.onAccent : theme.colors.text, fontSize: compact ? 12 : undefined }}>{label}</Text>
    </PressableScale>
  );
}