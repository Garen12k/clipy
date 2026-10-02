import { Text, type TextProps } from "react-native";
import { theme } from "@/src/theme/theme";

export function Title({ style, size = 22, ...rest }: TextProps & { size?: number }) {
  return <Text {...rest} style={[{ fontFamily: theme.fonts.title, fontSize: size, color: theme.colors.text, letterSpacing: 1.5, textTransform: "uppercase" }, style]} />;
}
/** @deprecated name kept so existing imports compile; identical to Title. */
export const Heading = Title;
const WEIGHT = { regular: theme.fonts.body, semi: theme.fonts.bodySemi, bold: theme.fonts.bodyBold } as const;
export function Body({ muted, weight = "regular", style, ...rest }: TextProps & { muted?: boolean; weight?: keyof typeof WEIGHT }) {
  return <Text {...rest} style={[{ fontFamily: WEIGHT[weight], fontSize: 14, color: muted ? theme.colors.textMuted : theme.colors.text }, style]} />;
}