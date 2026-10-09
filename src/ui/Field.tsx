import { TextInput, type TextInputProps, type TextStyle } from "react-native";
import { theme } from "@/src/theme/theme";
import { useSurfaces } from "./tone";

/** The one text-field look (the same as NumField's box): 16-pt text, at least a 44-pt target, in a tile-coloured box of the family it is drawn in (tone.ts). */
export const fieldStyle: TextStyle = {
  minHeight: theme.size.touch, color: theme.colors.text, fontSize: theme.type.input,
  borderRadius: theme.radius.field, paddingHorizontal: theme.space.md, paddingVertical: theme.space.md,
};

/** A TextInput with the kit's field look. Every TextInput prop passes through; `style` is added after the look (a taller multi-line box, say). */
export function Field({ style, ...rest }: TextInputProps) {
  const s = useSurfaces();
  return <TextInput placeholderTextColor={s.muted} {...rest} style={[fieldStyle, { backgroundColor: s.tile }, style]} />;
}
