import { Text, type TextProps } from "react-native";
import { theme } from "@/src/theme/theme";

/** A title: bold from Title 2 (22) up, semibold below — Apple's split. Shown as typed: sentence style, no forced capitals. */
export function Title({ style, size = theme.type.title, ...rest }: TextProps & { size?: number }) {
  return <Text {...rest} style={[{ fontSize: size, fontWeight: size >= theme.type.title ? theme.weight.bold : theme.weight.semi, color: theme.colors.text }, style]} />;
}
export function Body({ muted, weight = "regular", style, ...rest }: TextProps & { muted?: boolean; weight?: keyof typeof theme.weight }) {
  return <Text {...rest} style={[{ fontSize: theme.type.body, fontWeight: theme.weight[weight], color: muted ? theme.colors.textMuted : theme.colors.text }, style]} />;
}
/** A muted name and its value as ONE text ("Opacity 40 %"): the value is in the label colour, semibold, with tabular digits, so it does not jitter while a slider moves. An empty label shows the value alone. */
export function ValueLabel({ label, value, ...rest }: TextProps & { label: string; value?: string }) {
  return (
    <Body muted {...rest}>
      {label}{label && value !== undefined ? " " : null}{value === undefined ? null : <Text style={{ fontWeight: theme.weight.semi, color: theme.colors.text, fontVariant: ["tabular-nums"] }}>{value}</Text>}
    </Body>
  );
}
