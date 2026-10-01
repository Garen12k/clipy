import { Ionicons } from "@expo/vector-icons";
import { useMemo, useRef } from "react";
import { Pressable, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { updateAudioTrack } from "@/src/editor/model/ops";
import { timeToX, xToTime } from "@/src/editor/model/timeline";
import type { AudioTrack } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { LANE_HEIGHT } from "../timelineLayout";

const HANDLE_W = 12;

export function MusicBar({ track: t, missing }: { track: AudioTrack; missing: boolean }) {
  const pps = useEditorStore((s) => s.pixelsPerSecond);
  const store = useEditorStore.getState();
  const startRef = useRef({ start: t.start, trimStart: t.trimStart, trimEnd: t.trimEnd });
  const snap = () => {
    const cur = useEditorStore.getState().project?.audioTracks[0];
    if (cur) startRef.current = { start: cur.start, trimStart: cur.trimStart, trimEnd: cur.trimEnd };
    store.beginTransaction();
  };

  const gestures = useMemo(() => {
    const move = Gesture.Pan().activateAfterLongPress(150).onStart(snap)
      .onUpdate((e) => store.applyTransient((p) => updateAudioTrack(p, { start: startRef.current.start + xToTime(e.translationX, pps) }))).runOnJS(true);
    const left = Gesture.Pan().activeOffsetX([-3, 3]).blocksExternalGesture(move).onStart(snap)
      .onUpdate((e) => store.applyTransient((p) => updateAudioTrack(p, { trimStart: startRef.current.trimStart + xToTime(e.translationX, pps) }))).runOnJS(true);
    const right = Gesture.Pan().activeOffsetX([-3, 3]).blocksExternalGesture(move).onStart(snap)
      .onUpdate((e) => store.applyTransient((p) => updateAudioTrack(p, { trimEnd: startRef.current.trimEnd + xToTime(e.translationX, pps) }))).runOnJS(true);
    return { move, left, right };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pps]);

  const leftPx = timeToX(t.start, pps), width = Math.max(HANDLE_W * 2 + 4, timeToX(t.trimEnd - t.trimStart, pps));
  return (
    <GestureDetector gesture={gestures.move}>
      <Pressable testID="music-bar" onPress={() => { useEditorStore.getState().selectOverlay(null); useEditorStore.getState().select(null); }}
        accessibilityLabel={`Music ${t.title}`}
        style={{ position: "absolute", left: leftPx, width, height: LANE_HEIGHT, borderRadius: 8, backgroundColor: theme.colors.sea,
          borderWidth: 2, borderColor: theme.colors.sea, flexDirection: "row", alignItems: "center", paddingHorizontal: HANDLE_W + 2, gap: 4 }}>
        <Ionicons name="volume-medium" size={14} color={theme.colors.text} />
        <Text style={{ color: theme.colors.text, fontSize: 12 }}>{Math.round(t.volume * 100)}%</Text>
        <Text numberOfLines={1} style={{ color: theme.colors.text, fontSize: 12, flex: 1 }}>{t.title}</Text>
        {missing && (
          <View style={{ position: "absolute", top: 4, right: HANDLE_W + 2, backgroundColor: theme.colors.danger, borderRadius: 999, padding: 2 }}>
            <Ionicons name="warning" size={12} color={theme.colors.text} />
          </View>
        )}
        <GestureDetector gesture={gestures.left}><View accessibilityLabel="Music start handle" style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: HANDLE_W, backgroundColor: theme.colors.highlight, borderTopLeftRadius: 6, borderBottomLeftRadius: 6 }} /></GestureDetector>
        <GestureDetector gesture={gestures.right}><View accessibilityLabel="Music end handle" style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: HANDLE_W, backgroundColor: theme.colors.highlight, borderTopRightRadius: 6, borderBottomRightRadius: 6 }} /></GestureDetector>
      </Pressable>
    </GestureDetector>
  );
}
