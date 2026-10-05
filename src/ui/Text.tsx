import { Text, type TextProps } from "react-native";
import { theme } from "@/src/theme/theme";

export function Title({ style, size = 22, ...rest }: TextProps & { size?: number }) {
  return <Text {...rest} style={[{ fontFamily: theme.fonts.title, fontSize: size, color: theme.colors.text, letterSpacing: 1.5, textTransform: "uppercase" }, style]} />;
}
const WEIGHT = { regular: theme.fonts.body, semi: theme.fonts.bodySemi, bold: theme.fonts.bodyBold } as const;
export function Body({ muted, weight = "regular", style, ...rest }: TextProps & { muted?: boolean; weight?: keyof typeof WEIGHT }) {
  return <Text {...rest} style={[{ fontFamily: WEIGHT[weight], fontSize: 14, color: muted ? theme.colors.textMuted : theme.colors.text }, style]} />;
}
/** A muted name and its value as ONE text ("Opacity 40 %"): the value is cream, semi-bold, with tabular digits, so it does not jitter while a slider moves. An empty label shows the value alone. */
export function ValueLabel({ label, value, ...rest }: TextProps & { label: string; value?: string }) {
  return (
    <Body muted {...rest}>
      {label}{label && value !== undefined ? " " : null}{value === undefined ? null : <Text style={{ fontFamily: theme.fonts.bodySemi, color: theme.colors.text, fontVariant: ["tabular-nums"] }}>{value}</Text>}
    </Body>
  );
}
