import { View } from "react-native";
import type { LayerClip } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { LANE_GAP, LANE_HEIGHT } from "../timelineLayout";
import { LayerBar } from "./LayerBar";

const NONE: LayerClip[] = [];

/**
 * The timeline rows for picture-in-picture layers: one row per layer in the order of `project.layers` (what `laneModel` counts), each
 * the size of any other lane and holding that layer's bar alone — so no bar can cover another. The rows stack in the flow and the
 * group has no size of its own; it adds height only, and the bars are out of the flow. Rows are keyed by the layer: one that
 * appears or goes leaves the others (and a bar being dragged in them) mounted.
 */
export function LayerLane() {
  const layers = useEditorStore((s) => s.project?.layers ?? NONE);
  // A layer is selected through the same id as a clip.
  const selectedId = useEditorStore((s) => s.selectedClipId);
  const missing = useEditorStore((s) => s.missingSourceUris);
  const { select } = useEditorStore.getState();
  return (
    <View testID="layer-lane">
      {layers.map((l) => (
        <View key={l.id} testID={`layer-row-${l.id}`} style={{ position: "relative", height: LANE_HEIGHT, marginTop: LANE_GAP }}>
          <LayerBar layer={l} missing={missing.includes(l.sourceUri)} selected={l.id === selectedId} onPress={() => select(l.id === selectedId ? null : l.id)} />
        </View>
      ))}
    </View>
  );
}
