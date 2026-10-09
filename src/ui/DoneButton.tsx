import { theme } from "@/src/theme/theme";
import { Icon } from "./Icon";
import { PressableScale } from "./PressableScale";

/** (44 − 32) / 2: the target is 44 pt and stays inside a 44-pt header (iOS does not deliver a touch outside the parent). */
const SLOP = (theme.size.touch - theme.size.done) / 2;

/** The round ✓ that closes a strip or a panel: a plain disc in the `lifted` step with a white check. No ring and no gold — gold is a screen's one main action. */
export function DoneButton({ onPress }: { onPress: () => void }) {
  return (
    <PressableScale accessibilityRole="button" accessibilityLabel="Done" onPress={onPress} hitSlop={SLOP}
      style={{ width: theme.size.done, height: theme.size.done, borderRadius: theme.radius.pill, alignItems: "center", justifyContent: "center",
        backgroundColor: theme.elevation.lifted }}>
      <Icon testID="done-check" name="checkmark-outline" size={theme.size.icon.md} color={theme.colors.text} />
    </PressableScale>
  );
}
