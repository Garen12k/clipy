import { KitText } from "./Text";
import { largeContent } from "./textScale";
import { theme } from "@/src/theme/theme";
import { buttonBox, buttonLabel, buttonSlop, DISABLED_OPACITY } from "./buttonStyle";
import { PressableScale } from "./PressableScale";

type Props = { title: string; onPress: () => void; disabled?: boolean; icon?: React.ReactNode; compact?: boolean; /** Defaults to `title`; set it when several buttons on a screen share a title. */ accessibilityLabel?: string;
  /**
   * `gold` (the default): the ONE action that completes a screen — Export, Create, Sign In, Post, Crop's Done.
   * `plain`: the one main action INSIDE a strip or a panel — filled in the label colour (white) with dark ink; at most one in view at a time.
   * Same box, label, sizes and disabled look; the test id says which it is (`primary-button` is the gold one, `main-button` the plain one).
   */
  tone?: "gold" | "plain";
  /** The button may be given less width than it asks for (its label then fits what is left): for a row it shares at a larger text size — Home's bottom actions. */
  shrink?: boolean };

/** The ink of each tone, for a symbol drawn before the title (`icon`). */
export const primaryInk = (tone: "gold" | "plain" = "gold"): string => (tone === "plain" ? theme.plain.ink : theme.colors.onAccent);

const SHRINKS = { flexShrink: 1 } as const;

export function PrimaryButton({ title, onPress, disabled, icon, compact, accessibilityLabel, tone = "gold", shrink }: Props) {
  const plain = tone === "plain";
  // Without `shrink` the style is the very list it always was (the default-tree PROOF holds it).
  const box = buttonBox(compact), fill = { backgroundColor: plain ? theme.plain.fill : theme.colors.accent, opacity: disabled ? DISABLED_OPACITY : 1 };
  return (
    <PressableScale testID={plain ? "main-button" : "primary-button"} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title} accessibilityState={{ disabled: !!disabled }}
      disabled={disabled} onPress={onPress} {...largeContent(title)} hitSlop={buttonSlop(compact)}
      style={shrink ? [box, fill, SHRINKS] : [box, fill]}>
      {icon ?? null}
      <KitText fit style={[buttonLabel(compact), { color: primaryInk(tone) }]}>{title}</KitText>
    </PressableScale>
  );
}