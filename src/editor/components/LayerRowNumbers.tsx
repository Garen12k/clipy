import { Text, View } from "react-native";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { LANE_GAP, LANE_HEIGHT, type LaneModel, layerRowTops } from "../timelineLayout";

/** A chip is as large as a small icon: it fits inside a 28-pt row with room above and below. */
const CHIP = theme.size.icon.sm;

/**
 * The row numbers of the picture-in-picture layers: a fixed "1", "2", … at the left edge of the timeline, one per layer row, that
 * stays in place while the timeline is scrolled sideways (a bar's own "Layer N" title scrolls away with the bar). Rendered by the
 * Timeline as a sibling above its scroll view — never inside the scroll content — and it takes no touch. Where a row is comes only
 * from the lane model (`layerRowTops`): a slot is the whole row (its gap, then its bars) and the chip is centred on the bars' part.
 * At scroll 0 the content starts at half the screen's width, so the chips sit in the empty lead-in; scrolled, bars pass under them —
 * hence a dark chip with a hairline (it reads on the page and on a layer bar alike). The selected layer's chip is filled with the
 * colour of its bar's selection border and handles. Nothing here animates. The chips repeat the bar titles, so VoiceOver skips them.
 */
export function LayerRowNumbers({ model }: { model: Pick<LaneModel, "lanes"> }) {
  // A layer is selected through the same id as a clip. A number, not the layers: the selector must return a primitive.
  const selected = useEditorStore((s) => (s.project && s.selectedClipId !== null ? s.project.layers.findIndex((l) => l.id === s.selectedClipId) : -1));
  const tops = layerRowTops(model);
  if (tops.length === 0) return null;
  return (
    <View testID="layer-number-gutter" pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={{ position: "absolute", left: theme.space.xs, top: 0 }}>
      {tops.map((top, i) => {
        const on = i === selected;
        return (
          <View key={i} testID={`layer-number-slot-${i + 1}`} style={{ position: "absolute", left: 0, top, height: LANE_GAP + LANE_HEIGHT, justifyContent: "flex-end" }}>
            <View style={{ height: LANE_HEIGHT, justifyContent: "center" }}>
              <View testID={`layer-number-${i + 1}`}
                style={{ minWidth: CHIP, height: CHIP, borderRadius: theme.radius.chip, alignItems: "center", justifyContent: "center", borderWidth: 1,
                  backgroundColor: on ? theme.colors.text : theme.elevation.bar, borderColor: on ? theme.colors.text : theme.colors.hairline }}>
                <Text allowFontScaling={false} style={{ fontSize: theme.type.micro, fontWeight: "700", color: on ? theme.colors.onAccent : theme.colors.text }}>{i + 1}</Text>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}
