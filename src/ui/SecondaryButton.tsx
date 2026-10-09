import { Text } from "react-native";
import { theme } from "@/src/theme/theme";
import { useSurfaces } from "./tone";
import { buttonBox, buttonLabel, buttonSlop, DISABLED_OPACITY } from "./buttonStyle";
import { PressableScale } from "./PressableScale";

type Props = { title: string; onPress: () => void; disabled?: boolean; danger?: boolean; /** Drawn before the title, like PrimaryButton's. */ icon?: React.ReactNode; compact?: boolean; /** Defaults to `title`; set it when several buttons on a screen share a title. */ accessibilityLabel?: string };

export function SecondaryButton({ title, onPress, disabled, danger, icon, compact, accessibilityLabel }: Props) {
  const s = useSurfaces();
  const color = danger ? s.dangerText : theme.colors.text;
  return (
    <PressableScale accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} hitSlop={buttonSlop(compact)}
      style={[buttonBox(compact), { backgroundColor: s.lifted, opacity: disabled ? DISABLED_OPACITY : 1 }]}>
      {icon ?? null}
      <Text style={[buttonLabel(compact), { color }]}>{title}</Text>
    </PressableScale>
  );
}