import { View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EDITOR_APPEARANCE, theme, type Tone } from "@/src/theme/theme";
import { ShownContext, ToneContext, useSurfaces } from "./tone";

export type Edge = "top" | "bottom";

/**
 * The full-screen page every screen sits on. Pads each listed edge by its safe-area inset plus
 * `theme.space.sm`, so content clears the status bar / Dynamic Island and the home indicator.
 * Pass `edges={[]}` for a full-bleed screen. A `paddingTop`/`paddingBottom` in `style` overrides the edge padding.
 *
 * It is also where a route says which family of colours it wears: `tone="editor"` (the editor and Crop — soft slate around
 * the video) or, by default, a screen's navy. The page takes that family's colour and the kit inside reads it (tone.ts). The
 * provider draws no view, so the tree under the page is what it was.
 */
export function Screen({ children, style, edges = ["top"], tone = "screen" }: { children: React.ReactNode; style?: ViewStyle; edges?: readonly Edge[]; tone?: Tone }) {
  const insets = useSafeAreaInsets();
  const pad: ViewStyle = {};
  if (edges.includes("top")) pad.paddingTop = insets.top + theme.space.sm;
  if (edges.includes("bottom")) pad.paddingBottom = insets.bottom + theme.space.sm;
  // The editor wears one appearance whatever the phone says: it says so to everything under it (so nothing there is re-rendered when the
  // phone's setting changes) and draws its page from a constant. Every other screen draws the page of the appearance shown now.
  if (tone === "editor") return (
    <ShownContext.Provider value={EDITOR_APPEARANCE}><ToneContext.Provider value="editor">
      <View style={[{ flex: 1, backgroundColor: theme.surfaces.editor.page }, pad, style]}>{children}</View>
    </ToneContext.Provider></ShownContext.Provider>
  );
  return <ToneContext.Provider value="screen"><Page style={[pad, style]}>{children}</Page></ToneContext.Provider>;
}

/** A screen's page. Its own component, so that only IT reads the appearance: the `Screen` of the editor never does. */
function Page({ children, style }: { children: React.ReactNode; style: StyleProp<ViewStyle> }) {
  const s = useSurfaces();
  return <View style={[{ flex: 1, backgroundColor: s.page }, style]}>{children}</View>;
}
