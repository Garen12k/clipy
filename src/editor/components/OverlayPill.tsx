import { useMemo, useRef } from "react";
import { Pressable, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { moveOverlay, updateOverlayShared } from "@/src/editor/model/ops";
import { timeToX, xToTime } from "@/src/editor/model/timeline";
import { isSticker, isTextOverlay, type Overlay } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { SHAPES } from "@/src/editor/effects";
import { theme } from "@/src/theme/theme";
import { LANE_HEIGHT } from "../timelineLayout";

const HANDLE_W = 12;

export function OverlayPill({ overlay: o, selected, onPress }: { overlay: Overlay; selected: boolean; onPress: () => void }) {
  const pps = useEditorStore((s) => s.pixelsPerSecond);
  const store = useEditorStore.getState();
  const startRef = useRef({ start: o.start, end: o.end });
  const snap = () => { const cur = useEditorStore.getState().project?.overlays.find((v) => v.id === o.id); if (cur) startRef.current = { start: cur.start, end: cur.end }; store.beginTransaction(); };

  const gestures = useMemo(() => {
    const move = Gesture.Pan().activateAfterLongPress(150).onStart(snap)
      .onUpdate((e) => store.applyTransient((p) => moveOverlay(p, o.id, startRef.current.start + xToTime(e.translationX, pps)))).runOnJS(true);
    const left = Gesture.Pan().activeOffsetX([-3, 3]).blocksExternalGesture(move).onStart(snap)
      .onUpdate((e) => store.applyTransient((p) => updateOverlayShared(p, o.id, { start: startRef.current.start + xToTime(e.translationX, pps) }))).runOnJS(true);
    const right = Gesture.Pan().activeOffsetX([-3, 3]).blocksExternalGesture(move).onStart(snap)
      .onUpdate((e) => store.applyTransient((p) => updateOverlayShared(p, o.id, { end: startRef.current.end + xToTime(e.translationX, pps) }))).runOnJS(true);
    return { move, left, right };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o.id, pps]);

  const label = isSticker(o) ? (o.emoji ?? SHAPES[o.shape!].label) : isTextOverlay(o) ? o.text : "";
  const leftPx = timeToX(o.start, pps), width = Math.max(HANDLE_W * 2 + 4, timeToX(o.end - o.start, pps));
  return (
    <GestureDetector gesture={gestures.move}>
      <Pressable testID={`overlay-pill-${o.id}`} onPress={onPress} accessibilityLabel={`${isSticker(o) ? "Sticker" : "Text"} ${label}`}
        style={{ position: "absolute", left: leftPx, width, height: LANE_HEIGHT, borderRadius: 8, backgroundColor: theme.colors.surfaceAlt,
          borderWidth: 2, borderColor: selected ? theme.colors.highlight : theme.colors.straw, justifyContent: "center", paddingHorizontal: HANDLE_W + 2 }}>
        <Text numberOfLines={1} style={{ color: theme.colors.text, fontSize: 12 }}>{label}</Text>
        {selected && (
          <>
            <GestureDetector gesture={gestures.left}><View accessibilityLabel="Text start handle" style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: HANDLE_W, backgroundColor: theme.colors.highlight, borderTopLeftRadius: 6, borderBottomLeftRadius: 6 }} /></GestureDetector>
            <GestureDetector gesture={gestures.right}><View accessibilityLabel="Text end handle" style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: HANDLE_W, backgroundColor: theme.colors.highlight, borderTopRightRadius: 6, borderBottomRightRadius: 6 }} /></GestureDetector>
          </>
        )}
      </Pressable>
    </GestureDetector>
  );
}
