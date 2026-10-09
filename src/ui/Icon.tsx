import { Ionicons } from "@expo/vector-icons";
import { View, type ViewProps } from "react-native";
import { theme } from "@/src/theme/theme";
import { SF_SYMBOLS, symbolView } from "./sfSymbols";

export type IconName = keyof typeof Ionicons.glyphMap;
type Props = { name: IconName; size?: number; color?: string; testID?: string;
  /** Always the text glyph (the Ionicon), never a native view: for the places where many icons are on screen and scroll — the timeline, the long lists. */
  plain?: boolean;
} & Pick<ViewProps, "accessibilityElementsHidden" | "importantForAccessibility">;

/**
 * How much of the icon's box a symbol is drawn in. An Ionicon keeps a margin inside its own square (its drawing is about 0.8 of the
 * side); an SF Symbol is scaled until it touches the box it is given. So the symbol gets a box of 0.8 × `size`, centred in the
 * `size` square: the icon looks as large as it did, and nothing around it moves. The ONE place this is tuned — never per call site.
 */
export const SYMBOL_SCALE = 0.8;

/**
 * The app's one way of drawing an icon. It is named the way the app has always named icons (an Ionicons name); `SF_SYMBOLS` decides
 * the symbol. Where the name has one AND the installed app can draw it, it is Apple's SF Symbol — regular weight, one colour, no
 * effect, centred in a square of `size` points; otherwise it is the Ionicon, exactly as before: with `plain`, for a name that is not
 * in the table (the brand marks), in an app without the native module, and when the package cannot be loaded.
 */
export function Icon({ name, size = theme.size.icon.lg, color = theme.colors.text, testID, plain, ...a11y }: Props) {
  const symbol = plain ? undefined : SF_SYMBOLS[name];
  const SymbolView = symbol ? symbolView() : null;
  if (!symbol || !SymbolView) return <Ionicons name={name} size={size} color={color} testID={testID} {...a11y} />;
  return (
    <View testID={testID} {...a11y} style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <SymbolView name={symbol} size={size * SYMBOL_SCALE} tintColor={color} weight="regular" scale="medium" type="monochrome" resizeMode="scaleAspectFit"
        fallback={<Ionicons name={name} size={size} color={color} />} />
    </View>
  );
}
