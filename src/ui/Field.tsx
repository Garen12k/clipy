import { TextInput, type TextInputProps, type TextStyle } from "react-native";
import { theme } from "@/src/theme/theme";

/** The one text-field look (the same as NumField's box): a tile-coloured box, 16-pt text, at least a 44-pt target. */
export const fieldStyle: TextStyle = {
  minHeight: theme.size.touch, backgroundColor: theme.elevation.tile, color: theme.colors.text, fontSize: theme.type.input,
  borderRadius: theme.radius.field, paddingHorizontal: theme.space.md, paddingVertical: theme.space.md,
};

/** A TextInput with the kit's field look. Every TextInput prop passes through; `style` is added after the look (a taller multi-line box, say). */
export function Field({ style, ...rest }: TextInputProps) {
  return <TextInput placeholderTextColor={theme.colors.textMuted} {...rest} style={[fieldStyle, style]} />;
}
