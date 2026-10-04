import { useMemo, useRef } from "react";
import { Pressable, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { EFFECTS } from "@/src/editor/effects";
import { moveEffect, updateEffect } from "@/src/editor/model/ops";
import { timeToX, totalDuration, xToTime } from "@/src/editor/model/timeline";
import type { EffectItem, Project } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { Body } from "@/src/ui/Text";
import { createSnapper, sameTime } from "../snapping";
import { LANE_HEIGHT } from "../timelineLayout";

const HANDLE_W = 12;

/** One effect on the effects lane: long-press drag moves it, the two handles (shown when selected) trim it. */
export function EffectPill({ effect: fx, selected, onPress }: { effect: EffectItem; selected: boolean; onPress: () => void }) {
  const pps = useEditorStore((s) => s.pixelsPerSecond);
  const total = useEditorStore((s) => (s.project ? totalDuration(s.project) : 0));
  const store = useEditorStore.getState();
  // Drag start lives in a ref object: gesture callbacks each get their own copy of captured variables.
  const startRef = useRef({ start: fx.start, end: fx.end });
  const snap = () => { const cur = useEditorStore.getState().project?.effects.find((v) => v.id === fx.id); if (cur) startRef.current = { start: cur.start, end: cur.end }; store.beginTransaction(); };
  // Snapping (one object, for the same reason as the ref). A snap counts only when the op really leaves the dragged edge on the target.
  const snapper = useRef(createSnapper()).current;
  const begin = (...edges: ("start" | "end")[]) => () => { snap(); snapper.begin(fx.id); snapper.rest(...edges.map((k) => startRef.current[k])); };
  const on = (q: Project, target: number, ...edges: ("start" | "end")[]) => { const v = q.effects.find((x) => x.id === fx.id); return !!v && edges.some((k) => sameTime(v[k], target)); };

  const gestures = useMemo(() => {
    const move = Gesture.Pan().activateAfterLongPress(150).onStart(begin("start", "end"))
      .onUpdate((e) => store.applyTransient((p) => {
        const { start, end } = startRef.current;
        return moveEffect(p, fx.id, snapper.move(start + xToTime(e.translationX, pps), end - start, (s, target) => on(moveEffect(p, fx.id, s), target, "start", "end")));
      })).onFinalize(() => snapper.end()).runOnJS(true);
    const left = Gesture.Pan().activeOffsetX([-3, 3]).blocksExternalGesture(move).onStart(begin("start"))
      .onUpdate((e) => store.applyTransient((p) => {
        const trim = (start: number) => updateEffect(p, fx.id, { start });
        return trim(snapper.time(startRef.current.start + xToTime(e.translationX, pps), (s, target) => on(trim(s), target, "start")));
      })).onFinalize(() => snapper.end()).runOnJS(true);
    const right = Gesture.Pan().activeOffsetX([-3, 3]).blocksExternalGesture(move).onStart(begin("end"))
      .onUpdate((e) => store.applyTransient((p) => {
        const trim = (end: number) => updateEffect(p, fx.id, { end });
        return trim(snapper.time(startRef.current.end + xToTime(e.translationX, pps), (s, target) => on(trim(s), target, "end")));
      })).onFinalize(() => snapper.end()).runOnJS(true);
    return { move, left, right };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fx.id, pps]);

  const label = EFFECTS[fx.type].label;
  const leftPx = timeToX(fx.start, pps), width = Math.max(HANDLE_W * 2 + 4, timeToX(Math.min(fx.end, total) - fx.start, pps));   // drawn only up to the project's end
  return (
    <GestureDetector gesture={gestures.move}>
      <Pressable testID={`effect-pill-${fx.id}`} onPress={onPress} accessibilityLabel={`Effect ${label}`}
        style={{ position: "absolute", left: leftPx, width, height: LANE_HEIGHT, borderRadius: theme.radius.chip, backgroundColor: theme.colors.laneEffect,
          borderWidth: 2, borderColor: selected ? theme.colors.text : "transparent", justifyContent: "center", paddingHorizontal: HANDLE_W + 2 }}>
        <Body numberOfLines={1} style={{ color: theme.colors.onAccent, fontSize: 12 }}>{label}</Body>
        {selected && (
          <>
            <GestureDetector gesture={gestures.left}><View accessibilityLabel="Effect start handle" style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: HANDLE_W, backgroundColor: theme.colors.text, borderTopLeftRadius: 6, borderBottomLeftRadius: 6 }} /></GestureDetector>
            <GestureDetector gesture={gestures.right}><View accessibilityLabel="Effect end handle" style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: HANDLE_W, backgroundColor: theme.colors.text, borderTopRightRadius: 6, borderBottomRightRadius: 6 }} /></GestureDetector>
          </>
        )}
      </Pressable>
    </GestureDetector>
  );
}
