import { View } from "react-native";
import { useEditorStore } from "@/src/editor/store";
import { LANE_GAP, LANE_HEIGHT } from "../timelineLayout";
import { MusicBar } from "./MusicBar";

export function MusicLane() {
  const track = useEditorStore((s) => s.project?.audioTracks[0]);
  const missing = useEditorStore((s) => s.missingSourceUris);
  return (
    <View style={{ position: "relative", height: LANE_HEIGHT, marginTop: LANE_GAP }}>
      {track && <MusicBar track={track} missing={missing.includes(track.sourceUri)} />}
    </View>
  );
}
