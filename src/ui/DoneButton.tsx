import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/src/theme/theme";
import { PressableScale } from "./PressableScale";

/** (44 − 32) / 2: the target is 44 pt and stays inside a 44-pt header (iOS does not deliver a touch outside the parent). */
const SLOP = (theme.size.touch - theme.size.done) / 2;

/** The round ✓ that closes a strip or a panel. Ringed in gold, not filled: the gold fill is kept for a screen's or a panel's one main button. */
export function DoneButton({ onPress }: { onPress: () => void }) {
  return (
    <PressableScale accessibilityRole="button" accessibilityLabel="Done" onPress={onPress} hitSlop={SLOP}
      style={{ width: theme.size.done, height: theme.size.done, borderRadius: theme.radius.pill, alignItems: "center", justifyContent: "center",
        backgroundColor: theme.elevation.tile, borderWidth: 1.5, borderColor: theme.colors.accent }}>
      <Ionicons name="checkmark-outline" size={theme.size.icon.md} color={theme.colors.accent} />
    </PressableScale>
  );
}
