import { Text, View } from "react-native";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { LANE_GAP, LANE_HEIGHT, type LaneModel, rowTops, selectedRow } from "../timelineLayout";

/** A chip is as large as a medium icon: it fits inside a 28-pt row with room above and below. */
const CHIP = theme.size.icon.md;

/**
 * The row numbers of the timeline: a fixed "1", "2", … at the left edge, one beside every row under the clips (each audio kind, each
 * layer, each row of text / stickers, the effects — the clip area has none), that stays in place while the timeline is scrolled
 * sideways. Rendered by the Timeline as a sibling above its scroll view — never inside the scroll content — and it takes no touch.
 * Where a row is comes only from the lane model (`rowTops`): a slot is the whole row (its gap, then its bars) and the chip is
 * centred on the bars' part. A layer bar's "Layer N" title carries the same number (LayerLane). At scroll 0 the content starts at
 * half the screen's width, so the chips sit in the empty lead-in; scrolled, bars pass under them — hence a dark chip with a hairline
 * (it reads on the page and on any bar alike). The chip of the row that holds the selected item (`selectedRow`) is filled with the
 * colour of a selected bar's border and handles. Nothing here animates. The chips are decoration, so VoiceOver skips them.
 */
export function RowNumbers({ model }: { model: Pick<LaneModel, "lanes"> }) {
  // One number (a row, or -1), never the items themselves: the selector must return a primitive.
  const selected = useEditorStore((s) => selectedRow(s.project, { clipId: s.selectedClipId, overlayId: s.selectedOverlayId, effectId: s.selectedEffectId, audioId: s.selectedAudioId }));
  const tops = rowTops(model);
  if (tops.length === 0) return null;
  return (
    <View testID="row-number-gutter" pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={{ position: "absolute", left: theme.space.xs, top: 0 }}>
      {tops.map((top, i) => {
        const on = i === selected;
        return (
          <View key={i} testID={`row-number-slot-${i + 1}`} style={{ position: "absolute", left: 0, top, height: LANE_GAP + LANE_HEIGHT, justifyContent: "flex-end" }}>
            <View style={{ height: LANE_HEIGHT, justifyContent: "center" }}>
              <View testID={`row-number-${i + 1}`}
                style={{ minWidth: CHIP, height: CHIP, borderRadius: theme.radius.pill, alignItems: "center", justifyContent: "center", borderWidth: 1,
                  backgroundColor: on ? theme.colors.text : theme.elevation.bar, borderColor: on ? theme.colors.text : theme.colors.hairline }}>
                <Text allowFontScaling={false} style={{ fontSize: theme.type.label, fontWeight: "700", color: on ? theme.colors.onAccent : theme.colors.text }}>{i + 1}</Text>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}
