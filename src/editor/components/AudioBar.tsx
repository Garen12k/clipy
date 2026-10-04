import { Ionicons } from "@expo/vector-icons";
import { useMemo, useRef } from "react";
import { Pressable, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { moveAudioTrack, updateAudioTrackById } from "@/src/editor/model/ops";
import { timeToX, xToTime } from "@/src/editor/model/timeline";
import type { AudioKind, AudioTrack } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { LANE_HEIGHT } from "../timelineLayout";

const HANDLE_W = 12;
const OVERLAP_OPACITY = 0.85;
const KIND: Record<AudioKind, { label: string; color: string }> = {
  music: { label: "Music", color: theme.colors.laneMusic },
  voice: { label: "Voice", color: theme.colors.laneVoice },
  sfx: { label: "Sound effect", color: theme.colors.laneSfx },
};

type Props = { track: AudioTrack; missing: boolean; selected: boolean; overlapping?: boolean; onPress: () => void };

/** One audio track on its kind's lane: tap selects, long-press drag moves it, the two handles (shown when selected) trim it. */
export function AudioBar({ track: t, missing, selected, overlapping = false, onPress }: Props) {
  const pps = useEditorStore((s) => s.pixelsPerSecond);
  const store = useEditorStore.getState();
  // Drag start lives in a ref object: gesture callbacks each get their own copy of captured variables.
  const startRef = useRef({ start: t.start, trimStart: t.trimStart, trimEnd: t.trimEnd });
  const snap = () => {
    const cur = useEditorStore.getState().project?.audioTracks.find((v) => v.id === t.id);
    if (cur) startRef.current = { start: cur.start, trimStart: cur.trimStart, trimEnd: cur.trimEnd };
    store.beginTransaction();
  };

  const gestures = useMemo(() => {
    const move = Gesture.Pan().activateAfterLongPress(150).onStart(snap)
      .onUpdate((e) => store.applyTransient((p) => moveAudioTrack(p, t.id, startRef.current.start + xToTime(e.translationX, pps)))).runOnJS(true);
    const left = Gesture.Pan().activeOffsetX([-3, 3]).blocksExternalGesture(move).onStart(snap)
      .onUpdate((e) => store.applyTransient((p) => updateAudioTrackById(p, t.id, { trimStart: startRef.current.trimStart + xToTime(e.translationX, pps) }))).runOnJS(true);
    const right = Gesture.Pan().activeOffsetX([-3, 3]).blocksExternalGesture(move).onStart(snap)
      .onUpdate((e) => store.applyTransient((p) => updateAudioTrackById(p, t.id, { trimEnd: startRef.current.trimEnd + xToTime(e.translationX, pps) }))).runOnJS(true);
    return { move, left, right };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.id, pps]);

  const { label, color } = KIND[t.kind];
  const leftPx = timeToX(t.start, pps), width = Math.max(HANDLE_W * 2 + 4, timeToX(t.trimEnd - t.trimStart, pps));
  return (
    <GestureDetector gesture={gestures.move}>
      <Pressable testID={`audio-bar-${t.id}`} onPress={onPress} accessibilityLabel={`${label} ${t.title}`}
        style={{ position: "absolute", left: leftPx, width, height: LANE_HEIGHT, borderRadius: theme.radius.chip, backgroundColor: color, opacity: overlapping ? OVERLAP_OPACITY : 1,
          borderWidth: 2, borderColor: selected ? theme.colors.text : color, flexDirection: "row", alignItems: "center", paddingHorizontal: HANDLE_W + 2, gap: 4 }}>
        <Ionicons name="volume-medium" size={14} color={theme.colors.onAccent} />
        <Text style={{ color: theme.colors.onAccent, fontSize: 12 }}>{Math.round(t.volume * 100)}%</Text>
        <Text numberOfLines={1} style={{ color: theme.colors.onAccent, fontSize: 12, flex: 1 }}>{t.title}</Text>
        {missing && (
          <View testID={`audio-bar-${t.id}-missing`} style={{ position: "absolute", top: 4, right: HANDLE_W + 2, backgroundColor: theme.colors.danger, borderRadius: theme.radius.pill, padding: 2 }}>
            <Ionicons name="warning" size={12} color={theme.colors.onAccent} />
          </View>
        )}
        {selected && (
          <>
            <GestureDetector gesture={gestures.left}><View accessibilityLabel={`${label} start handle`} style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: HANDLE_W, backgroundColor: theme.colors.text, borderTopLeftRadius: 6, borderBottomLeftRadius: 6 }} /></GestureDetector>
            <GestureDetector gesture={gestures.right}><View accessibilityLabel={`${label} end handle`} style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: HANDLE_W, backgroundColor: theme.colors.text, borderTopRightRadius: 6, borderBottomRightRadius: 6 }} /></GestureDetector>
          </>
        )}
      </Pressable>
    </GestureDetector>
  );
}
