import { View } from "react-native";
import type { AudioKind, AudioTrack } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { LANE_GAP, LANE_HEIGHT } from "../timelineLayout";
import { AudioBar } from "./AudioBar";

const NONE: AudioTrack[] = [];
const end = (t: AudioTrack) => t.start + (t.trimEnd - t.trimStart);

/** One timeline lane for one audio kind: a bar per track of that kind. Adds height only; bars are out of the flow. */
export function AudioLane({ kind }: { kind: AudioKind }) {
  const all = useEditorStore((s) => s.project?.audioTracks ?? NONE);
  const missing = useEditorStore((s) => s.missingSourceUris);
  const selectedId = useEditorStore((s) => s.selectedAudioId);
  const { selectAudio } = useEditorStore.getState();
  const tracks = all.filter((t) => t.kind === kind);
  return (
    <View testID={`${kind}-lane`} style={{ position: "relative", height: LANE_HEIGHT, marginTop: LANE_GAP }}>
      {tracks.map((t, i) => (
        <AudioBar key={t.id} track={t} missing={missing.includes(t.sourceUri)} selected={t.id === selectedId}
          // Later tracks draw on top; one that covers part of an earlier bar is see-through so both stay visible.
          overlapping={tracks.slice(0, i).some((o) => t.start < end(o) && o.start < end(t))}
          onPress={() => selectAudio(t.id === selectedId ? null : t.id)} />
      ))}
    </View>
  );
}
