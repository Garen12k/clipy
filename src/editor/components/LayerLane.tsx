import { View } from "react-native";
import { layerEnd } from "@/src/editor/model/timeline";
import type { LayerClip } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { LANE_GAP, LANE_HEIGHT } from "../timelineLayout";
import { LayerBar } from "./LayerBar";

const NONE: LayerClip[] = [];

/** The timeline lane for picture-in-picture layers: a bar per layer. Adds height only; bars are out of the flow. */
export function LayerLane() {
  const layers = useEditorStore((s) => s.project?.layers ?? NONE);
  // A layer is selected through the same id as a clip.
  const selectedId = useEditorStore((s) => s.selectedClipId);
  const { select } = useEditorStore.getState();
  return (
    <View testID="layer-lane" style={{ position: "relative", height: LANE_HEIGHT, marginTop: LANE_GAP }}>
      {layers.map((l, i) => (
        <LayerBar key={l.id} layer={l} selected={l.id === selectedId}
          // Later layers draw on top (the selected one above them all — see LayerBar); one that covers part of an earlier bar is see-through so both stay visible.
          overlapping={layers.slice(0, i).some((o) => l.start < layerEnd(o) && o.start < layerEnd(l))}
          onPress={() => select(l.id === selectedId ? null : l.id)} />
      ))}
    </View>
  );
}
