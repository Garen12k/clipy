import { View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme, type Tone } from "@/src/theme/theme";
import { ToneContext } from "./tone";

export type Edge = "top" | "bottom";

/**
 * The full-screen page every screen sits on. Pads each listed edge by its safe-area inset plus
 * `theme.space.sm`, so content clears the status bar / Dynamic Island and the home indicator.
 * Pass `edges={[]}` for a full-bleed screen. A `paddingTop`/`paddingBottom` in `style` overrides the edge padding.
 *
 * It is also where a route says which family of colours it wears: `tone="editor"` (the editor and Crop — hue-free neutrals around
 * the video) or, by default, a screen's navy. The page takes that family's colour and the kit inside reads it (tone.ts). The
 * provider draws no view, so the tree under the page is what it was.
 */
export function Screen({ children, style, edges = ["top"], tone = "screen" }: { children: React.ReactNode; style?: ViewStyle; edges?: readonly Edge[]; tone?: Tone }) {
  const insets = useSafeAreaInsets();
  const pad: ViewStyle = {};
  if (edges.includes("top")) pad.paddingTop = insets.top + theme.space.sm;
  if (edges.includes("bottom")) pad.paddingBottom = insets.bottom + theme.space.sm;
  return <ToneContext.Provider value={tone}><View style={[{ flex: 1, backgroundColor: theme.surfaces[tone].page }, pad, style]}>{children}</View></ToneContext.Provider>;
}
