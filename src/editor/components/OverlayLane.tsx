import { View } from "react-native";
import { useEditorStore } from "@/src/editor/store";
import { LANE_GAP, LANE_HEIGHT } from "../timelineLayout";
import { OverlayPill } from "./OverlayPill";

export function OverlayLane() {
  const overlays = useEditorStore((s) => s.project?.overlays ?? []);
  const selectedId = useEditorStore((s) => s.selectedOverlayId);
  const { selectOverlay } = useEditorStore.getState();
  return (
    <View testID="overlay-lane" style={{ position: "relative", height: LANE_HEIGHT, marginTop: LANE_GAP }}>
      {overlays.map((o) => (
        <OverlayPill key={o.id} overlay={o} selected={o.id === selectedId} onPress={() => selectOverlay(o.id)} />
      ))}
    </View>
  );
}
