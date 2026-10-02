import { Text, type TextProps } from "react-native";
import { theme } from "@/src/theme/theme";

export function Heading({ style, ...rest }: TextProps) {
  return <Text {...rest} style={[{ fontFamily: theme.fonts.title, fontSize: 28, color: theme.colors.text, letterSpacing: 1.5, textTransform: "uppercase" }, style]} />;
}
export function Body({ muted, style, ...rest }: TextProps & { muted?: boolean }) {
  return <Text {...rest} style={[{ fontFamily: theme.fonts.body, fontSize: 15, color: muted ? theme.colors.textMuted : theme.colors.text }, style]} />;
}
