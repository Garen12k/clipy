import { Text, TextInput, type TextInputProps, type TextProps } from "react-native";
import { theme } from "@/src/theme/theme";
import { fitProps, shownScale, textCap, usePhoneScale, type TextRole } from "./textScale";
import { useSurfaces, useTone } from "./tone";

/**
 * `scale`: how the text follows the phone's text size (textScale.ts) — left out, it is capped like everything in its family.
 * `fit`: ONLY for a short fixed label the app itself writes. At a larger text size it keeps to one line (or that many) and may shrink
 * to the room it has; at the default it adds nothing. Without it a text with a line limit ends in dots at every size — which is what
 * a name, an address, a message or an error must do (the shrink has no floor on iOS: textScale.ts). Write it first, right after the
 * component's name; the guard counts every use, so do not write a tag with it in a comment.
 */
export type KitTextProps = TextProps & { scale?: TextRole; fit?: boolean | number };

/**
 * THE text of the app: the only place React Native's `Text` is drawn (textScale.guard.test.ts). It follows the phone's text size up
 * to the cap of the family it is drawn in. A span inside another text is a `KitText` with its parent's `scale`: React Native lets
 * every text, nested or not, scale by itself.
 */
export function KitText({ scale = "chrome", fit, ...rest }: KitTextProps) {
  if (scale === "fixed") return <Text {...rest} allowFontScaling={false} />;
  if (fit) return <Fitted how={scale} lines={fit === true ? 1 : fit} {...rest} />;
  return <Capped how={scale} {...rest} />;
}
// `how`, not `role`: React Native's Text already has a `role` prop (the accessibility role), which must pass through untouched.
/** Every text that did not ask to fit, line-limited or not: it reads its family and nothing else, and is as written but for its cap. */
function Capped({ how, ...rest }: TextProps & { how: TextRole }) {
  return <Text {...rest} maxFontSizeMultiplier={textCap(useTone(), how)} />;
}
/** In a row a label is measured against the whole row unless it may give way: with this it is offered what is left beside its neighbours, and so has something to fit into. */
const GIVES_WAY = { flexShrink: 1 } as const;
/**
 * A label that asked to fit: the only kind that listens for the phone's text size. While it is shown larger than the default it is
 * limited to its lines, may shrink to them, and may be given less width than it asks for. At the default it is exactly as written.
 */
function Fitted({ how, lines, ...rest }: TextProps & { how: TextRole; lines: number }) {
  const cap = textCap(useTone(), how);
  const fitted = fitProps(shownScale(usePhoneScale(), cap), rest.numberOfLines, lines);
  if (!fitted) return <Text {...rest} maxFontSizeMultiplier={cap} />;
  return <Text {...rest} {...fitted} style={[rest.style, GIVES_WAY]} maxFontSizeMultiplier={cap} />;
}

/** THE text field of the app: the only place React Native's `TextInput` is drawn. What is typed is capped like the words around it. */
export function KitInput(props: TextInputProps & { ref?: React.Ref<TextInput> }) {
  return <TextInput {...props} maxFontSizeMultiplier={textCap(useTone(), "chrome")} />;
}

/** A title: bold from Title 2 (22) up, semibold below — Apple's split. Shown as typed: sentence style, no forced capitals. */
export function Title({ style, size = theme.type.title, ...rest }: KitTextProps & { size?: number }) {
  const s = useSurfaces();
  return <KitText {...rest} style={[{ fontSize: size, fontWeight: size >= theme.type.title ? theme.weight.bold : theme.weight.semi, color: s.text }, style]} />;
}
/** Body text. `muted` is the secondary label of the family it is drawn in (tone.ts): the system's secondary label, strong enough for the lightest step of either family. */
export function Body({ muted, weight = "regular", style, ...rest }: KitTextProps & { muted?: boolean; weight?: keyof typeof theme.weight }) {
  const s = useSurfaces();
  return <KitText {...rest} style={[{ fontSize: theme.type.body, fontWeight: theme.weight[weight], color: muted ? s.muted : s.text }, style]} />;
}
/** A muted name and its value as ONE text ("Opacity 40 %"): the value is in the label colour, semibold, with tabular digits, so it does not jitter while a slider moves. An empty label shows the value alone. */
export function ValueLabel({ label, value, ...rest }: KitTextProps & { label: string; value?: string }) {
  const s = useSurfaces();
  return (
    <Body muted {...rest}>
      {label}{label && value !== undefined ? " " : null}{value === undefined ? null : <KitText scale={rest.scale} style={{ fontWeight: theme.weight.semi, color: s.text, fontVariant: ["tabular-nums"] }}>{value}</KitText>}
    </Body>
  );
}
