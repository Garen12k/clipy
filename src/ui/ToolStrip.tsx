import { useLayoutEffect } from "react";
import { ScrollView, View, type TextProps } from "react-native";
import { create } from "zustand";
import { theme } from "@/src/theme/theme";
import { DoneButton } from "./DoneButton";
import { EnterView } from "./Enter";
import { QuietButton } from "./QuietButton";
import { Body, Title, ValueLabel } from "./Text";

/** The bottom area while the bar shows (1 hairline + one row of tool buttons), without the bottom safe-area padding. */
export const BAR_HEIGHT = 90;
const HEADER = theme.size.header, TILES = 72, SLIDER = 36;
/** 1 hairline + header + tiles + slider + 1 spare. */
const HEIGHT = 1 + HEADER + TILES + SLIDER + 1;
/**
 * Heights in points: header 44, tiles 72, slider 36, height 154, lift 64. `height` = the bottom area while a strip shows; `lift` = how
 * far it rises over the timeline at most = height − BAR_HEIGHT = two lanes (src/editor/timelineLayout.ts), so its top edge sits on a lane's
 * top edge. It only ever covers lanes: the bar that hosts it lifts by `laneLift` (fewer than two lanes → less, and the preview gives the rest).
 * The header is 44 so the ✓ and the action have a real 44-pt target inside it.
 */
export const STRIP = { header: HEADER, tiles: TILES, slider: SLIDER, height: HEIGHT, lift: HEIGHT - BAR_HEIGHT } as const;
/** How many strips are showing. A bar hides its buttons while this is above zero. */
export const useStripPresence = create<{ count: number }>(() => ({ count: 0 }));

/**
 * The card a strip or a panel is drawn as: the `bar` step with a large radius on all four corners, a small margin from the screen's
 * sides — the toolbar capsule's family, which it replaces while open. It lives INSIDE the tool's unchanged box: the margin comes out
 * of the WIDTH only, never out of a row's height. `bleed`: how far the page colour is painted below the box (over the host's bottom
 * padding — the safe area, or the keyboard's height), so the gap under the card is the page, not a slab of the bar's colour.
 */
export const TOOL_CARD = { margin: theme.space.sm, radius: theme.radius.sheet, bleed: 600 } as const;
/** The card's inner width in a window `windowWidth` wide: what a strip's rows (and a panel's header, lead and pinned rows) really have. */
export const toolWidth = (windowWidth: number): number => windowWidth - 2 * TOOL_CARD.margin;

/**
 * The card itself, `height` high (the tool's own box, to the point). Around it the box is the editor's PAGE colour and opaque — margins
 * and corners let nothing of the timeline through, and the box takes its touches as it always did. The host's top hairline and its
 * bottom padding are painted over in the page colour too (a view that takes no touches), so the card floats on the page like the capsule.
 * The card clips its content to its corners; nothing here is animated.
 */
export function ToolCard({ testID, height, children }: { testID: string; height: number; children: React.ReactNode }) {
  return (
    <View testID={testID} style={{ height, backgroundColor: theme.elevation.page }}>
      <View testID="tool-card-page" pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: -1, bottom: -TOOL_CARD.bleed, backgroundColor: theme.elevation.page }} />
      <View testID="tool-card" style={{ height, marginHorizontal: TOOL_CARD.margin, borderRadius: TOOL_CARD.radius, backgroundColor: theme.elevation.bar, overflow: "hidden" }}>
        {children}
      </View>
    </View>
  );
}

const LABEL_WIDTH = 124;
/** Where a row of uniform tiles starts so the selected one shows: its index times the pitch (tile + gap), minus one tile. */
export const tilesStartX = (index: number, tileWidth: number): number => Math.max(0, index * (tileWidth + theme.space.sm) - tileWidth);
/** `tilesStartX`, never past the row's end: `count` tiles of `tileWidth` (the row's gaps and its two gutters included) in a row as wide as `viewportWidth` — a strip's row is as wide as its card: pass `toolWidth(windowWidth)`, never the window's own width. React Native does not clamp a ScrollView's contentOffset. */
export const tilesStartXIn = (index: number, tileWidth: number, count: number, viewportWidth: number): number =>
  Math.min(tilesStartX(index, tileWidth), Math.max(0, count * tileWidth + (count - 1) * theme.space.sm + 2 * theme.space.gutter - viewportWidth));

type Props = { visible: boolean; onClose: () => void; title: string; note?: React.ReactNode; action?: { label: string; onPress: () => void }; children: React.ReactNode };

/**
 * An inline tool panel that takes the toolbar's place — NOT a Modal: no scrim, the preview and the timeline stay usable.
 * Every row has an explicit height; `flex: 1` only ever shares width inside such a row (never height).
 * It is drawn as a rounded card (`ToolCard`) inside its box, whose height is what it always was. The bar that hosts it owns the bottom
 * safe-area padding (the gap under the card); the strip's box is opaque edge to edge, so what it rises over neither shows through nor
 * gets its touches. Its content eases in on opening (EnterView); the box itself never moves, and closing is instant.
 */
export function ToolStrip({ visible, onClose, title, note, action, children }: Props) {
  // Counted before paint, so the bar that hosts the strip is hidden in the same frame the strip appears.
  useLayoutEffect(() => {
    if (!visible) return;
    useStripPresence.setState((s) => ({ count: s.count + 1 }));
    return () => useStripPresence.setState((s) => ({ count: s.count - 1 }));
  }, [visible]);
  if (!visible) return null;
  const height = STRIP.header + STRIP.tiles + STRIP.slider;
  return (
    <ToolCard testID="tool-strip" height={height}>
      {/* Only the content moves: the strip's own box and its card are in place, opaque, from the first frame. */}
      <EnterView testID="tool-strip-content" style={{ height }}>
        <View testID="tool-strip-header" style={{ height: STRIP.header, flexDirection: "row", alignItems: "center", gap: theme.space.md, paddingHorizontal: theme.space.gutter }}>
          <Title size={theme.type.headline} accessibilityRole="header">{title}</Title>
          <View style={{ flex: 1, height: STRIP.header, justifyContent: "center" }}>{note}</View>
          {action ? <QuietButton compact title={action.label} onPress={action.onPress} /> : null}
          <DoneButton onPress={onClose} />
        </View>
        <View style={{ height: STRIP.tiles + STRIP.slider, justifyContent: "center" }}>{children}</View>
      </EnterView>
    </ToolCard>
  );
}

/** One horizontally scrolling row (height STRIP.tiles). `lead` (tab chips, a switch) stays fixed at the left. `initialX` is where the row starts (the selected tile in view); it is read at mount, so key the row to restart it. */
export function StripTiles({ lead, initialX, children }: { lead?: React.ReactNode; initialX?: number; children: React.ReactNode }) {
  return (
    <View testID="strip-tiles" style={{ height: STRIP.tiles, flexDirection: "row", alignItems: "center" }}>
      {/* As high as the row: a compact chip (28) centred in it has its vertical slop inside its parent, so its target really is 44 pt. */}
      {lead ? <View testID="strip-lead" style={{ height: STRIP.tiles, flexDirection: "row", alignItems: "center", gap: theme.space.xs, paddingLeft: theme.space.gutter }}>{lead}</View> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ flex: 1, height: STRIP.tiles }} contentOffset={{ x: initialX ?? 0, y: 0 }}
        contentContainerStyle={{ alignItems: "center", gap: theme.space.sm, paddingHorizontal: theme.space.gutter }}>
        {children}
      </ScrollView>
    </View>
  );
}

/** One slider row (height STRIP.slider): the name and its value at the left (one text), the slider (the child) fills the width, `trailing` at the right. */
export function StripSlider({ label, value, labelWidth = LABEL_WIDTH, trailing, children }: { label: string; value?: string; labelWidth?: number; trailing?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View testID="strip-slider" style={{ height: STRIP.slider, flexDirection: "row", alignItems: "center", gap: theme.space.md, paddingHorizontal: theme.space.gutter }}>
      <ValueLabel label={label} value={value} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={{ fontSize: theme.type.small, width: labelWidth }} />
      <View style={{ flex: 1, height: STRIP.slider, justifyContent: "center" }}>{children}</View>
      {trailing}
    </View>
  );
}

/** A muted note for the strip's header: one line, or `lines` (2 for the longer ones). */
export function StripNote({ style, lines = 1, ...rest }: TextProps & { lines?: number }) {
  return <Body muted numberOfLines={lines} {...rest} style={[{ fontSize: theme.type.micro }, style]} />;
}
