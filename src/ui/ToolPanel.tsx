import { Ionicons } from "@expo/vector-icons";
import { useLayoutEffect } from "react";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { create } from "zustand";
import { theme } from "@/src/theme/theme";
import { Body, Title } from "./Text";

/** Heights in points. `compact` and the regular / typing rules give the bottom area's height while a panel shows (see `panelHeight`). */
export const PANEL = { header: 44, lead: 44, compact: 240, regularShare: 0.46, regularMin: 300, regularMax: 430, typingShare: 0.22, typingMin: 148, typingMax: 200 } as const;
export type PanelSize = "regular" | "compact";
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** The bottom area's height while a panel shows, without the bottom padding: 1 hairline + header + lead + body. `typing` = the keyboard is up. */
export function panelHeight(size: PanelSize, windowHeight: number, typing = false): number {
  if (typing) return clamp(Math.round(windowHeight * PANEL.typingShare), PANEL.typingMin, PANEL.typingMax);
  if (size === "compact") return PANEL.compact;
  return clamp(Math.round(windowHeight * PANEL.regularShare), PANEL.regularMin, PANEL.regularMax);
}
/** How many panels are showing, and the size of the one that is. The editor hides the bar and the timeline while count > 0. */
export const usePanelPresence = create<{ count: number; size: PanelSize }>(() => ({ count: 0, size: "regular" }));

const DONE_SIZE = 32;

type Props = { visible: boolean; onClose: () => void; title: string; size?: PanelSize; action?: { label: string; onPress: () => void };
  lead?: React.ReactNode; scroll?: boolean; bodyTestID?: string; children: React.ReactNode | ((bodyHeight: number) => React.ReactNode) };

/**
 * A tall inline tool panel that takes the place of the timeline and the toolbar — NOT a Modal: no scrim, the preview above it stays
 * usable. Every part has an explicit height (never `flex: 1` for height); the body scrolls vertically when its content is taller.
 * The bar that hosts it owns the top hairline and the bottom padding (safe area or keyboard).
 */
export function ToolPanel({ visible, onClose, title, size = "regular", action, lead, scroll = true, bodyTestID, children }: Props) {
  const { height: windowH } = useWindowDimensions();
  // Counted before paint, so the host hides its bar and the timeline in the same frame the panel appears.
  useLayoutEffect(() => {
    if (!visible) return;
    usePanelPresence.setState((s) => ({ count: s.count + 1, size }));
    return () => usePanelPresence.setState((s) => ({ ...s, count: s.count - 1 }));
  }, [visible, size]);
  if (!visible) return null;
  const typing = false;   // Task 2: the keyboard
  const height = panelHeight(size, windowH, typing) - 1;
  const showLead = !!lead && !typing;
  const bodyH = height - PANEL.header - (showLead ? PANEL.lead : 0);
  const content = typeof children === "function" ? children(bodyH) : children;
  return (
    <View testID="tool-panel" style={{ height, backgroundColor: theme.colors.surface }}>
      <View style={{ height: PANEL.header, flexDirection: "row", alignItems: "center", gap: theme.space.md, paddingHorizontal: theme.space.lg }}>
        <Title size={16} accessibilityRole="header">{title}</Title>
        <View style={{ flex: 1, height: PANEL.header }} />
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
      {showLead ? <View testID="tool-panel-lead" style={{ height: PANEL.lead, flexDirection: "row", alignItems: "center", gap: theme.space.sm, paddingHorizontal: theme.space.lg }}>{lead}</View> : null}
      {scroll ? (
        <ScrollView testID={bodyTestID ?? "tool-panel-body"} style={{ height: bodyH }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingHorizontal: theme.space.lg, paddingVertical: theme.space.md }}>
          <View collapsable={false} style={{ gap: theme.space.lg }}>{content}</View>
        </ScrollView>
      ) : (
        <View testID={bodyTestID ?? "tool-panel-body"} style={{ height: bodyH, paddingHorizontal: theme.space.lg }}>{content}</View>
      )}
    </View>
  );
}
