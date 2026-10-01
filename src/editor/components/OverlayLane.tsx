import { View } from "react-native";
import { isTextOverlay } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { LANE_GAP, LANE_HEIGHT } from "../timelineLayout";
import { OverlayPill } from "./OverlayPill";

export function OverlayLane() {
  const allOverlays = useEditorStore((s) => s.project?.overlays ?? []);
  const selectedId = useEditorStore((s) => s.selectedOverlayId);
  const { selectOverlay } = useEditorStore.getState();
  const overlays = allOverlays.filter(isTextOverlay);
  return (
    <View testID="overlay-lane" style={{ position: "relative", height: LANE_HEIGHT, marginTop: LANE_GAP }}>
      {overlays.map((o) => (
        <OverlayPill key={o.id} overlay={o} selected={o.id === selectedId} onPress={() => selectOverlay(o.id)} />
      ))}
    </View>
  );
}
