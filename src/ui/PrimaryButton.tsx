import { Text } from "react-native";
import { theme } from "@/src/theme/theme";
import { buttonBox, buttonLabel, buttonSlop, DISABLED_OPACITY } from "./buttonStyle";
import { PressableScale } from "./PressableScale";

type Props = { title: string; onPress: () => void; disabled?: boolean; icon?: React.ReactNode; compact?: boolean; /** Defaults to `title`; set it when several buttons on a screen share a title. */ accessibilityLabel?: string;
  /**
   * `gold` (the default): the ONE action that completes a screen — Export, Create, Sign In, Post, Crop's Done.
   * `plain`: the one main action INSIDE a strip or a panel — filled in the label colour (white) with dark ink; at most one in view at a time.
   * Same box, label, sizes and disabled look; the test id says which it is (`primary-button` is the gold one, `main-button` the plain one).
   */
  tone?: "gold" | "plain" };

/** The ink of each tone, for a symbol drawn before the title (`icon`). */
export const primaryInk = (tone: "gold" | "plain" = "gold"): string => (tone === "plain" ? theme.plain.ink : theme.colors.onAccent);

export function PrimaryButton({ title, onPress, disabled, icon, compact, accessibilityLabel, tone = "gold" }: Props) {
  const plain = tone === "plain";
  return (
    <PressableScale testID={plain ? "main-button" : "primary-button"} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title} accessibilityState={{ disabled: !!disabled }}
      disabled={disabled} onPress={onPress} hitSlop={buttonSlop(compact)}
      style={[buttonBox(compact), { backgroundColor: plain ? theme.plain.fill : theme.colors.accent, opacity: disabled ? DISABLED_OPACITY : 1 }]}>
      {icon ?? null}
      <Text style={[buttonLabel(compact), { color: primaryInk(tone) }]}>{title}</Text>
    </PressableScale>
  );
}