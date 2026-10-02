import { Text } from "react-native";
import { theme } from "@/src/theme/theme";
import { PressableScale } from "./PressableScale";

type Props = { title: string; onPress: () => void; disabled?: boolean; danger?: boolean };

export function SecondaryButton({ title, onPress, disabled, danger }: Props) {
  const color = danger ? theme.colors.danger : theme.colors.text;
  return (
    <PressableScale accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress}
      style={{ borderRadius: theme.radius.pill, borderWidth: 1.5, borderColor: danger ? theme.colors.danger : theme.colors.hairline, opacity: disabled ? 0.4 : 1,
        paddingVertical: theme.space.md, paddingHorizontal: theme.space.xl, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontFamily: theme.fonts.bodyBold, fontSize: 13, color, letterSpacing: 1, textTransform: "uppercase" }}>{title}</Text>
    </PressableScale>
  );
}