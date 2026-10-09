import { use, type ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from "react-native";
import { GLASS, shownAppearance, type GlassSide } from "@/src/theme/theme";
import { askReduceTransparency, useTransparencyAllowed } from "./reduceTransparency";
import { glassView, type GlassViewType } from "./systemGlass";
import { ShownContext } from "./tone";

type Props = {
  /** Which side of the app this surface is on: its switch in `GLASS` (theme.ts) decides whether glass is used at all. */
  side: GlassSide;
  /** The solid colour drawn when there is no glass — a theme colour, never a literal. */
  color: string;
  /** The tint of the glass: `glassTint(useSurfaces())` on a screen, `GLASS_TINT.editor` in the editor (theme.ts). */
  tint: string;
  /** The box. The same style goes to the same view whether glass is drawn or not, so nothing moves. An `opacity` under 1 means solid (see below). */
  style?: StyleProp<ViewStyle>;
  /** Half the box's height, for a pill whose style gives no `height`: the corner the glass itself is given (a pill's 999 is not handed to the system). */
  glassRadius?: number;
  pointerEvents?: ViewProps["pointerEvents"];
  children?: ReactNode;
  testID?: string;
};

// The answer is asked for when the app loads, and only if some surface could be glass here: it is known before the first one is drawn.
if ((GLASS.home || GLASS.editor) && glassView()) askReduceTransparency();

/**
 * The system glass view to draw on this side now, or null for solid: the side's switch (`GLASS`) is off, the build or the phone cannot
 * draw glass (systemGlass.ts), or Reduce Transparency is on or not yet known. For a part that sits ON a `Glass` and must know which it
 * got (a button that gives up its own fill, the toolbar's colour fade). `side` null asks nothing.
 */
export function useGlass(side: GlassSide | null): GlassViewType | null {
  const view = side && GLASS[side] ? glassView() : null;
  const allowed = useTransparencyAllowed(view !== null);
  return allowed ? view : null;
}

/**
 * A surface that is system glass where that is switched on (`GLASS[side]`) and the phone can and may draw it, and otherwise the solid
 * colour it is given — exactly the view it was before glass existed.
 *
 * With glass the BOX is still our own plain view, with the same style, the same children and the same touches; the glass is one extra
 * native view laid behind the children, filling the box, with the box's corners, taking no touches (`pointerEvents="none"`, never
 * `isInteractive`: the system would animate it under a finger). Nothing of ours is animated, and nothing is put inside the system's view.
 * The glass is never under an opacity: a box that is dimmed (`opacity` under 1 in its style — Home while a project is made) is the
 * solid colour for as long as it is dimmed; its children stay mounted through the change.
 * On a screen the glass follows the app's appearance; in the editor it is always dark, and the appearance is not read there (tone.ts).
 */
export function Glass({ side, color, tint, style, glassRadius, pointerEvents, children, testID }: Props) {
  const GlassView = useGlass(side);
  const scheme = side === "editor" ? "dark" : use(ShownContext) ?? shownAppearance();
  // Switched off, or a build / phone that cannot draw glass — settled for the life of the app: exactly the view this was before glass.
  if (!(GLASS[side] && glassView())) return <View testID={testID} pointerEvents={pointerEvents} style={[style, { backgroundColor: color }]}>{children}</View>;
  const flat = StyleSheet.flatten(style) ?? {};
  const dimmed = typeof flat.opacity === "number" && flat.opacity < 1;
  // Where glass comes and goes (Reduce Transparency, a dimmed box) the children keep their place in the tree, so they are never remounted.
  if (!GlassView || dimmed) return <View testID={testID} pointerEvents={pointerEvents} style={[style, { backgroundColor: color }]}>{null}{children}</View>;
  const half = glassRadius ?? (typeof flat.height === "number" ? flat.height / 2 : undefined);
  const corner = typeof flat.borderRadius === "number" ? (half === undefined ? flat.borderRadius : Math.min(flat.borderRadius, half)) : 0;
  return (
    <View testID={testID} pointerEvents={pointerEvents} style={style}>
      <GlassView testID={testID ? `${testID}-glass` : undefined} pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: corner }]} glassEffectStyle="regular" tintColor={tint} colorScheme={scheme} />
      {children}
    </View>
  );
}
