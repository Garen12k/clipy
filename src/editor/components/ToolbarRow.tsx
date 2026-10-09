import { Ionicons } from "@expo/vector-icons";
import { useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import { theme } from "@/src/theme/theme";
import { PressableScale } from "@/src/ui/PressableScale";
import { TOOLBAR } from "@/src/ui/ToolButton";
import { BAR_HEIGHT } from "@/src/ui/ToolStrip";

/** The trailing fade of a row that scrolls: slices of the bar's own colour, each a step more opaque (16 pt in all). Not a blur, not a gradient. */
const FADE = [0.25, 0.5, 0.75, 0.9] as const;
/** The separator before the pinned tools: thin, and well inside the capsule's height. */
const SEPARATOR = { width: 1, height: 36 } as const;

/**
 * The bottom bar: ONE rounded capsule (a slate step lighter than the page it floats on), `TOOLBAR.height` high, a small margin from
 * the screen's sides, standing at the bottom of the bar's slot — the slot keeps the height the bottom area always had (`BAR_HEIGHT`
 * less the hairline), so the preview, the timeline and a strip's rise are where they were. One row: fixed parts and one `ToolScroll`.
 */
export function BarCapsule({ testID, children }: { testID?: string; children: React.ReactNode }) {
  return (
    <View testID="toolbar-slot" style={{ height: BAR_HEIGHT - 1, justifyContent: "flex-end" }}>
      <View testID={testID} style={{ height: TOOLBAR.height, marginHorizontal: theme.space.xs, paddingHorizontal: theme.space.xs, gap: theme.space.xs, borderRadius: theme.radius.pill,
        backgroundColor: theme.elevation.bar, flexDirection: "row", alignItems: "center" }}>
        {children}
      </View>
    </View>
  );
}

/** The round "Back to main tools" at the bar's leading end: a 44-pt disc. */
export function BarBack({ onPress }: { onPress: () => void }) {
  return (
    <PressableScale accessibilityRole="button" accessibilityLabel="Back to main tools" onPress={onPress}
      style={{ width: theme.size.touch, height: theme.size.touch, borderRadius: theme.radius.pill, backgroundColor: theme.elevation.tile, alignItems: "center", justifyContent: "center" }}>
      <Ionicons name="chevron-back-outline" size={theme.size.icon.md} color={theme.colors.text} />
    </PressableScale>
  );
}

/** The thin line before what is pinned at the trailing end (Delete; Done in multi-select). */
export function BarSeparator() {
  return <View testID="toolbar-separator" style={{ ...SEPARATOR, backgroundColor: theme.colors.hairline }} />;
}

/**
 * The part of the bar that scrolls sideways. It takes the width the fixed parts leave (give its parent `flex: 1`), has an explicit
 * height, and shows a soft fade at its trailing edge while more tools follow — never at the row's end, never when all of them fit.
 * `centred`: a short row stands in the middle (flat bars); otherwise the tools start right after the group button.
 * Key it to start again from the left; nothing here is animated.
 */
export function ToolScroll({ testID, centred, children }: { testID?: string; centred?: boolean; children: React.ReactNode }) {
  const m = useRef({ box: 0, content: 0, x: 0 });
  const [more, setMore] = useState(false);
  // A boolean, so a scroll re-renders the row only when the fade appears or goes.
  const check = () => setMore(m.current.content - m.current.x - m.current.box > 1);
  return (
    <View style={{ flex: 1, height: TOOLBAR.tool }}>
      <ScrollView testID={testID} horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" scrollEventThrottle={16} style={{ height: TOOLBAR.tool }}
        contentContainerStyle={{ flexGrow: 1, justifyContent: centred ? "center" : "flex-start", alignItems: "center" }}
        onLayout={(e) => { m.current.box = e.nativeEvent.layout.width; check(); }}
        onContentSizeChange={(w) => { m.current.content = w; check(); }}
        onScroll={(e) => { m.current.x = e.nativeEvent.contentOffset.x; check(); }}>
        {children}
      </ScrollView>
      {more ? (
        <View testID="toolbar-fade" pointerEvents="none" style={{ position: "absolute", top: 0, bottom: 0, right: 0, flexDirection: "row" }}>
          {FADE.map((opacity) => <View key={opacity} style={{ width: theme.space.xs, backgroundColor: theme.elevation.bar, opacity }} />)}
        </View>
      ) : null}
    </View>
  );
}
