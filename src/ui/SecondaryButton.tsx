import { Text } from "react-native";
import type { GlassSide } from "@/src/theme/theme";
import { useSurfaces } from "./tone";
import { buttonBox, buttonLabel, buttonSlop, DISABLED_OPACITY } from "./buttonStyle";
import { useGlass } from "./Glass";
import { PressableScale } from "./PressableScale";

type Props = { title: string; onPress: () => void; disabled?: boolean; danger?: boolean; /** Drawn before the title, like PrimaryButton's. */ icon?: React.ReactNode; compact?: boolean; /** Defaults to `title`; set it when several buttons on a screen share a title. */ accessibilityLabel?: string;
  /** The button stands on a kit `Glass` of this side: while that surface really is glass the button has no fill of its own (the glass is its fill); otherwise it is the grey fill as ever. */ glass?: GlassSide };

export function SecondaryButton({ title, onPress, disabled, danger, icon, compact, accessibilityLabel, glass }: Props) {
  const s = useSurfaces();
  const onGlass = useGlass(glass ?? null) !== null;
  const color = danger ? s.dangerText : s.text;
  return (
    <PressableScale accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} hitSlop={buttonSlop(compact)}
      style={[buttonBox(compact), onGlass ? { opacity: disabled ? DISABLED_OPACITY : 1 } : { backgroundColor: s.lifted, opacity: disabled ? DISABLED_OPACITY : 1 }]}>
      {icon ?? null}
      <Text style={[buttonLabel(compact), { color }]}>{title}</Text>
    </PressableScale>
  );
}