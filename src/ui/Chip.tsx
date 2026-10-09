import { Text } from "react-native";
import { theme } from "@/src/theme/theme";
import { useSurfaces } from "./tone";
import { PressableScale } from "./PressableScale";

type Props = { label: string; selected: boolean; onPress: () => void; disabled?: boolean; accessibilityLabel?: string;
  /** 28 pt high (36 otherwise), less padding and 12-pt text: tab chips and Reset inside a strip. */
  compact?: boolean;
  /** The ring still switches at once, but the selected lift does not spring: set it while a slider that moves the selection is dragged. */
  still?: boolean;
};

export function Chip({ label, selected, onPress, disabled, accessibilityLabel, compact, still }: Props) {
  const s = useSurfaces();
  return (
    <PressableScale lifted={selected} still={still}
      accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected, disabled: !!disabled }}
      disabled={disabled} onPress={onPress} hitSlop={compact ? { top: 10, bottom: 10, left: 4, right: 4 } : { top: 4, bottom: 4 }}
      style={[{ height: compact ? theme.size.chipCompact : theme.size.chip, justifyContent: "center", paddingHorizontal: compact ? theme.space.md : theme.space.lg, borderRadius: theme.radius.pill,
        backgroundColor: selected ? s.lifted : s.tile, opacity: disabled ? 0.4 : 1 }, selected ? theme.ring : theme.ringClear]}>
      <Text style={{ fontWeight: theme.weight.semi, color: selected ? theme.colors.accent : theme.colors.text, fontSize: compact ? theme.type.small : theme.type.body }}>{label}</Text>
    </PressableScale>
  );
}