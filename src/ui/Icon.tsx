import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/src/theme/theme";
import { SF_SYMBOLS, symbolView } from "./sfSymbols";

export type IconName = keyof typeof Ionicons.glyphMap;
type Props = { name: IconName; size?: number; color?: string; testID?: string };

/**
 * One icon, named the way the app has always named icons (an Ionicons name). Where the name has an SF Symbol (`SF_SYMBOLS`) AND the
 * installed app can draw one, it is the SF Symbol; otherwise it is the Ionicon, exactly as before — in an older build, and for every
 * name not in the table. Both are a square of `size` points in the given colour.
 */
export function Icon({ name, size = theme.size.icon.lg, color = theme.colors.text, testID }: Props) {
  const ionicon = <Ionicons name={name} size={size} color={color} testID={testID} />;
  const symbol = SF_SYMBOLS[name];
  const SymbolView = symbol ? symbolView() : null;
  if (!symbol || !SymbolView) return ionicon;
  return <SymbolView name={symbol} size={size} tintColor={color} fallback={ionicon} testID={testID} />;
}
