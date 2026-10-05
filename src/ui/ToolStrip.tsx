import { Ionicons } from "@expo/vector-icons";
import { useLayoutEffect } from "react";
import { Pressable, ScrollView, View, type TextProps } from "react-native";
import { create } from "zustand";
import { theme } from "@/src/theme/theme";
import { Body, Title } from "./Text";

/** Heights in points. `height` = the bottom area while a strip shows (1 hairline + header + tiles + slider + 1 spare); `lift` = how far it rises over the timeline. */
export const STRIP = { header: 36, tiles: 76, slider: 36, height: 150, lift: 64 } as const;
/** The bottom area while the bar shows (one row of tool buttons), without the bottom safe-area padding. */
export const BAR_HEIGHT = 86;
/** How many strips are showing. A bar hides its buttons while this is above zero. */
export const useStripPresence = create<{ count: number }>(() => ({ count: 0 }));

const DONE_SIZE = 32;
const LABEL_WIDTH = 124;

type Props = { visible: boolean; onClose: () => void; title: string; note?: React.ReactNode; action?: { label: string; onPress: () => void }; children: React.ReactNode };

/**
 * An inline tool panel that takes the toolbar's place — NOT a Modal: no scrim, the preview and the timeline stay usable.
 * Every row has an explicit height; `flex: 1` only ever shares width inside such a row (never height).
 * The bar that hosts it owns the top hairline and the bottom safe-area padding; the strip is opaque, so what it rises over
 * neither shows through nor gets its touches.
 */
export function ToolStrip({ visible, onClose, title, note, action, children }: Props) {
  // Counted before paint, so the bar that hosts the strip is hidden in the same frame the strip appears.
  useLayoutEffect(() => {
    if (!visible) return;
    useStripPresence.setState((s) => ({ count: s.count + 1 }));
    return () => useStripPresence.setState((s) => ({ count: s.count - 1 }));
  }, [visible]);
  if (!visible) return null;
  return (
    <View testID="tool-strip" style={{ height: STRIP.header + STRIP.tiles + STRIP.slider, backgroundColor: theme.colors.surface }}>
      <View style={{ height: STRIP.header, flexDirection: "row", alignItems: "center", gap: theme.space.md, paddingHorizontal: theme.space.lg }}>
        <Title size={15} accessibilityRole="header">{title}</Title>
        <View style={{ flex: 1, height: STRIP.header, justifyContent: "center" }}>{note}</View>
        {action ? (
          <Pressable accessibilityRole="button" accessibilityLabel={action.label} onPress={action.onPress} hitSlop={8}>
            <Body weight="semi" style={{ color: theme.colors.accent, fontSize: 12 }}>{action.label}</Body>
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Done" onPress={onClose} hitSlop={8}
          style={{ width: DONE_SIZE, height: DONE_SIZE, borderRadius: theme.radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.accent }}>
          <Ionicons name="checkmark" size={20} color={theme.colors.onAccent} />
        </Pressable>
      </View>
      <View style={{ height: STRIP.tiles + STRIP.slider, justifyContent: "center" }}>{children}</View>
    </View>
  );
}

/** One horizontally scrolling row (height STRIP.tiles). `lead` (tab chips, a switch) stays fixed at the left. */
export function StripTiles({ lead, children }: { lead?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View testID="strip-tiles" style={{ height: STRIP.tiles, flexDirection: "row", alignItems: "center" }}>
      {lead ? <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space.xs, paddingLeft: theme.space.lg }}>{lead}</View> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ flex: 1, height: STRIP.tiles }}
        contentContainerStyle={{ alignItems: "center", gap: theme.space.sm, paddingHorizontal: theme.space.lg }}>
        {children}
      </ScrollView>
    </View>
  );
}

/** One slider row (height STRIP.slider): a muted label at the left, the slider (the child) fills the width, `trailing` at the right. */
export function StripSlider({ label, trailing, children }: { label: string; trailing?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View testID="strip-slider" style={{ height: STRIP.slider, flexDirection: "row", alignItems: "center", gap: theme.space.md, paddingHorizontal: theme.space.lg }}>
      <Body muted numberOfLines={1} style={{ fontSize: 12, width: LABEL_WIDTH }}>{label}</Body>
      <View style={{ flex: 1, height: STRIP.slider, justifyContent: "center" }}>{children}</View>
      {trailing}
    </View>
  );
}

/** A muted one-line note for the strip's header. */
export function StripNote({ style, ...rest }: TextProps) {
  return <Body muted numberOfLines={1} {...rest} style={[{ fontSize: 11 }, style]} />;
}
