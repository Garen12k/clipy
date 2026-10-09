import { useEffect, useMemo, useRef } from "react";
import { Pressable, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { moveOverlay, updateOverlayShared } from "@/src/editor/model/ops";
import { timeToX, xToTime } from "@/src/editor/model/timeline";
import { isSticker, isTextOverlay, type Overlay, type Project } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { SHAPES } from "@/src/editor/effects";
import { theme } from "@/src/theme/theme";
import { createBarSnappers, endSnappers, sameTime, type BarSnappers } from "../snapping";
import { LANE_HEIGHT } from "../timelineLayout";
import { KeyframeDots } from "./KeyframeDots";

const HANDLE_W = 12;

/**
 * One text, caption or sticker on the text / stickers lane. `top` is its row's offset inside the lane (see OverlayLane): a style
 * only, so a bar that changes rows while it is dragged stays the same mounted view and its gesture goes on. It has no hit slop: its
 * touch area is the bar, which never reaches into the row above or below.
 */
export function OverlayPill({ overlay: o, selected, top = 0, onPress }: { overlay: Overlay; selected: boolean; top?: number; onPress: () => void }) {
  const pps = useEditorStore((s) => s.pixelsPerSecond);
  const store = useEditorStore.getState();
  // The overlay when the drag began. A start trim is computed from this snapshot's start and pins on every frame (see `updateOverlayShared`).
  const startRef = useRef({ start: o.start, end: o.end, keyframes: o.keyframes });
  const snap = () => { const cur = useEditorStore.getState().project?.overlays.find((v) => v.id === o.id); if (cur) startRef.current = { start: cur.start, end: cur.end, keyframes: cur.keyframes }; store.beginTransaction(); };
  // Snapping: one snapper per gesture (see `createBarSnappers`). A snap counts only when the op really leaves the dragged edge on the target.
  const snappers = useRef(createBarSnappers()).current;
  useEffect(() => () => endSnappers(snappers), [snappers]);   // removed mid-drag: the guide goes with the bar
  const begin = (which: keyof BarSnappers, ...edges: ("start" | "end")[]) => () => { snap(); snappers[which].begin(o.id); snappers[which].rest(...edges.map((k) => startRef.current[k])); };
  const on = (q: Project, target: number, ...edges: ("start" | "end")[]) => { const v = q.overlays.find((x) => x.id === o.id); return !!v && edges.some((k) => sameTime(v[k], target)); };

  const gestures = useMemo(() => {
    const move = Gesture.Pan().activateAfterLongPress(150).onStart(begin("move", "start", "end"))
      .onUpdate((e) => store.applyTransient((p) => {
        const { start, end } = startRef.current;
        return moveOverlay(p, o.id, snappers.move.move(start + xToTime(e.translationX, pps), end - start, (s, target) => on(moveOverlay(p, o.id, s), target, "start", "end")));
      })).onFinalize(() => snappers.move.end()).runOnJS(true);
    const left = Gesture.Pan().activeOffsetX([-3, 3]).blocksExternalGesture(move).onStart(begin("left", "start"))
      .onUpdate((e) => store.applyTransient((p) => {
        const trim = (start: number) => updateOverlayShared(p, o.id, { start }, startRef.current);
        return trim(snappers.left.time(startRef.current.start + xToTime(e.translationX, pps), (s, target) => on(trim(s), target, "start")));
      })).onFinalize(() => snappers.left.end()).runOnJS(true);
    const right = Gesture.Pan().activeOffsetX([-3, 3]).blocksExternalGesture(move).onStart(begin("right", "end"))
      .onUpdate((e) => store.applyTransient((p) => {
        const trim = (end: number) => updateOverlayShared(p, o.id, { end });
        return trim(snappers.right.time(startRef.current.end + xToTime(e.translationX, pps), (s, target) => on(trim(s), target, "end")));
      })).onFinalize(() => snappers.right.end()).runOnJS(true);
    return { move, left, right };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o.id, pps]);

  const label = isSticker(o) ? (o.emoji ?? SHAPES[o.shape!].label) : isTextOverlay(o) ? o.text : "";
  const leftPx = timeToX(o.start, pps), width = Math.max(HANDLE_W * 2 + 4, timeToX(o.end - o.start, pps));
  const fill = isSticker(o) ? theme.colors.kindSticker : o.kind === "caption" ? theme.colors.kindCaption : theme.colors.kindText;
  return (
    <GestureDetector gesture={gestures.move}>
      <Pressable testID={`overlay-pill-${o.id}`} onPress={onPress} accessibilityLabel={`${isSticker(o) ? "Sticker" : "Text"} ${label}`}
        style={{ position: "absolute", left: leftPx, top, width, height: LANE_HEIGHT, borderRadius: 8, backgroundColor: fill,
          borderWidth: 2, borderColor: selected ? theme.colors.text : "transparent", justifyContent: "center", paddingHorizontal: HANDLE_W + 2 }}>
        <Text numberOfLines={1} style={{ color: theme.colors.onKind, fontSize: 12 }}>{label}</Text>
        {selected && o.keyframes.length > 0 && (
          <KeyframeDots times={o.keyframes.map((k) => k.t)} width={width} pps={pps} onPress={(t) => store.seek(o.start + t)} />
        )}
        {selected && (
          <>
            <GestureDetector gesture={gestures.left}><View accessibilityLabel="Text start handle" style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: HANDLE_W, backgroundColor: theme.colors.text, borderTopLeftRadius: 6, borderBottomLeftRadius: 6 }} /></GestureDetector>
            <GestureDetector gesture={gestures.right}><View accessibilityLabel="Text end handle" style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: HANDLE_W, backgroundColor: theme.colors.text, borderTopRightRadius: 6, borderBottomRightRadius: 6 }} /></GestureDetector>
          </>
        )}
      </Pressable>
    </GestureDetector>
  );
}
