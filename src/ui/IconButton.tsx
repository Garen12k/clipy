import { theme } from "@/src/theme/theme";
import { Icon, type IconName } from "./Icon";
import { PressableScale } from "./PressableScale";

type Props = { name: IconName; onPress: () => void; disabled?: boolean; accessibilityLabel: string; color?: string;
  /** The text glyph, never a native view: for a button that stands in every row of a long list. */
  plain?: boolean };

export function IconButton({ name, onPress, disabled, accessibilityLabel, color = theme.colors.text, plain }: Props) {
  return (
    <PressableScale accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled: !!disabled }}
      disabled={disabled} onPress={onPress} hitSlop={8}
      style={{ width: theme.size.iconButton, height: theme.size.iconButton, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.35 : 1 }}>
      <Icon name={name} size={theme.size.icon.lg} color={color} plain={plain} />
    </PressableScale>
  );
}
