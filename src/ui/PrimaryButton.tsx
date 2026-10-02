import { Text } from "react-native";
import { theme } from "@/src/theme/theme";
import { PressableScale } from "./PressableScale";

type Props = { title: string; onPress: () => void; disabled?: boolean; icon?: React.ReactNode; compact?: boolean; /** Defaults to `title`; set it when several buttons on a screen share a title. */ accessibilityLabel?: string };

export function PrimaryButton({ title, onPress, disabled, icon, compact, accessibilityLabel }: Props) {
  return (
    <PressableScale testID="primary-button" accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title} accessibilityState={{ disabled: !!disabled }}
      disabled={disabled} onPress={onPress}
      style={{ backgroundColor: theme.colors.accent, opacity: disabled ? 0.4 : 1, borderRadius: theme.radius.pill,
        paddingVertical: compact ? theme.space.sm : theme.space.lg, paddingHorizontal: compact ? theme.space.lg : theme.space.xl,
        flexDirection: "row", alignItems: "center", justifyContent: "center", gap: theme.space.sm }}>
      {icon ?? null}
      <Text style={{ fontFamily: theme.fonts.bodyBold, fontSize: compact ? 13 : 15, color: theme.colors.onAccent, letterSpacing: 1, textTransform: "uppercase" }}>{title}</Text>
    </PressableScale>
  );
}