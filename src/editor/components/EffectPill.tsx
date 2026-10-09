import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef } from "react";
import { Pressable, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { EFFECTS } from "@/src/editor/effects";
import { moveEffect, updateEffect } from "@/src/editor/model/ops";
import { timeToX, totalDuration, xToTime } from "@/src/editor/model/timeline";
import type { EffectItem, Project } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { Body } from "@/src/ui/Text";
import { createBarSnappers, endSnappers, sameTime, type BarSnappers } from "../snapping";
import { LANE_HEIGHT } from "../timelineLayout";
import { BAR, BAR_GLYPH, barParts } from "../timelineMarks";
import { BarGrip, GRIP_BOX } from "./BarGrip";


const HANDLE_W = 12;

/** One effect on the effects lane: long-press drag moves it, the two handles (shown when selected) trim it. */
export function EffectPill({ effect: fx, selected, onPress }: { effect: EffectItem; selected: boolean; onPress: () => void }) {
  const pps = useEditorStore((s) => s.pixelsPerSecond);
  const total = useEditorStore((s) => (s.project ? totalDuration(s.project) : 0));
  const store = useEditorStore.getState();
  // Drag start lives in a ref object: gesture callbacks each get their own copy of captured variables.
  const startRef = useRef({ start: fx.start, end: fx.end });
  const snap = () => { const cur = useEditorStore.getState().project?.effects.find((v) => v.id === fx.id); if (cur) startRef.current = { start: cur.start, end: cur.end }; store.beginTransaction(); };
  // Snapping: one snapper per gesture (see `createBarSnappers`). A snap counts only when the op really leaves the dragged edge on the target.
  const snappers = useRef(createBarSnappers()).current;
  useEffect(() => () => endSnappers(snappers), [snappers]);   // removed mid-drag: the guide goes with the bar
  const begin = (which: keyof BarSnappers, ...edges: ("start" | "end")[]) => () => { snap(); snappers[which].begin(fx.id); snappers[which].rest(...edges.map((k) => startRef.current[k])); };
  const on = (q: Project, target: number, ...edges: ("start" | "end")[]) => { const v = q.effects.find((x) => x.id === fx.id); return !!v && edges.some((k) => sameTime(v[k], target)); };

  const gestures = useMemo(() => {
    const move = Gesture.Pan().activateAfterLongPress(150).onStart(begin("move", "start", "end"))
      .onUpdate((e) => store.applyTransient((p) => {
        const { start, end } = startRef.current;
        return moveEffect(p, fx.id, snappers.move.move(start + xToTime(e.translationX, pps), end - start, (s, target) => on(moveEffect(p, fx.id, s), target, "start", "end")));
      })).onFinalize(() => snappers.move.end()).runOnJS(true);
    const left = Gesture.Pan().activeOffsetX([-3, 3]).blocksExternalGesture(move).onStart(begin("left", "start"))
      .onUpdate((e) => store.applyTransient((p) => {
        const trim = (start: number) => updateEffect(p, fx.id, { start });
        return trim(snappers.left.time(startRef.current.start + xToTime(e.translationX, pps), (s, target) => on(trim(s), target, "start")));
      })).onFinalize(() => snappers.left.end()).runOnJS(true);
    const right = Gesture.Pan().activeOffsetX([-3, 3]).blocksExternalGesture(move).onStart(begin("right", "end"))
      .onUpdate((e) => store.applyTransient((p) => {
        const trim = (end: number) => updateEffect(p, fx.id, { end });
        return trim(snappers.right.time(startRef.current.end + xToTime(e.translationX, pps), (s, target) => on(trim(s), target, "end")));
      })).onFinalize(() => snappers.right.end()).runOnJS(true);
    return { move, left, right };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fx.id, pps]);

  const label = EFFECTS[fx.type].label;
  const leftPx = timeToX(fx.start, pps), width = Math.max(HANDLE_W * 2 + 4, timeToX(Math.min(fx.end, total) - fx.start, pps));   // drawn only up to the project's end
  const parts = barParts(width);   // a narrow bar leaves its label out first, then its glyph
  return (
    <GestureDetector gesture={gestures.move}>
      <Pressable testID={`effect-pill-${fx.id}`} onPress={onPress} accessibilityLabel={`Effect ${label}`}
        style={{ position: "absolute", left: leftPx, width, height: LANE_HEIGHT, borderRadius: theme.radius.chip, backgroundColor: theme.colors.kindEffect,
          borderWidth: 2, borderColor: selected ? theme.colors.text : "transparent", flexDirection: "row", alignItems: "center", gap: theme.space.xs, paddingHorizontal: HANDLE_W + 2 }}>
        {parts.glyph && <Ionicons testID={`bar-glyph-${fx.id}`} name={BAR_GLYPH["effect"]} size={BAR.glyph} color={theme.colors.onKind} />}
        {parts.label && <Body numberOfLines={1} style={{ color: theme.colors.onKind, fontSize: theme.type.small, flex: 1 }}>{label}</Body>}
        {selected && (
          <>
            <GestureDetector gesture={gestures.left}><View accessibilityLabel="Effect start handle" style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: HANDLE_W, backgroundColor: theme.colors.text, borderTopLeftRadius: 6, borderBottomLeftRadius: 6, ...GRIP_BOX }}><BarGrip /></View></GestureDetector>
            <GestureDetector gesture={gestures.right}><View accessibilityLabel="Effect end handle" style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: HANDLE_W, backgroundColor: theme.colors.text, borderTopRightRadius: 6, borderBottomRightRadius: 6, ...GRIP_BOX }}><BarGrip /></View></GestureDetector>
          </>
        )}
      </Pressable>
    </GestureDetector>
  );
}
