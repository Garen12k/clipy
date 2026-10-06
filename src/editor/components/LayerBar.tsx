import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef } from "react";
import { Pressable, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { moveLayer, trimLayer } from "@/src/editor/model/ops";
import { clipDuration, layerEnd, sourceAfter, timeToX, xToTime } from "@/src/editor/model/timeline";
import { clampNum, isPhoto, LAYER_LIMITS, PHOTO, type LayerClip, type Project } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { useToast } from "@/src/ui/Toast";
import { createBarSnappers, endSnappers, sameTime, type BarSnappers } from "../snapping";
import { LANE_HEIGHT, ROW_SLOP } from "../timelineLayout";

const HANDLE_W = 12;
/** A bar is never drawn narrower than this; HIT_SLOP keeps it tappable — sideways only: up and down it stops at ROW_SLOP, inside its own row. */
const MIN_WIDTH = 12;
const HIT_SLOP = 8;
/** Narrower than this there is no room between the handles: the label is left out. */
const LABEL_MIN_WIDTH = HANDLE_W * 2 + 4;
/** A refusal is only announced when the finger has really moved. */
const REFUSAL_MIN_PX = 2;
/** Two times closer than this are the same place: an op that changes nothing there has not refused anything. */
const SAME = 1e-6;
const REFUSED_MESSAGE = "Only two video layers can play at the same time.";

type DragStart = { start: number; trimStart: number; trimEnd: number };
type Trim = { trimStart: number; trimEnd: number; anchor: "start" | "end" };

/**
 * The source range a handle drag asks for. The drag is an output-seconds delta; timeline.ts turns it into a source time (speed and
 * speed curves live there). The left handle cuts what plays FIRST and keeps the bar's end in place (anchor "start"); the right
 * handle cuts what plays last (anchor "end"). On a reversed layer what plays first is the END of the source range, so the left
 * handle moves `trimEnd` and the right one `trimStart`, both against the drag. The result is kept inside what the op can do without
 * the overlap rule — the source, the minimum length and project time 0 — so a drag that merely reaches one of those is not a refusal.
 */
export function layerTrimFromDrag(layer: LayerClip, handle: "left" | "right", from: DragStart, translationX: number, pps: number): Trim {
  const delta = xToTime(translationX, pps);
  // A photo has no start to trim: its handle sets its length.
  if (isPhoto(layer)) return { trimStart: 0, trimEnd: clampNum(sourceAfter(layer, from.trimEnd, delta), PHOTO.minSeconds, PHOTO.maxSeconds), anchor: "end" };
  const min = LAYER_LIMITS.minDuration;
  // The head cannot grow by more than the time there is before the bar.
  const out = handle === "left" ? Math.max(delta, -from.start) : delta;
  const anchor = handle === "left" ? "start" : "end";
  // Which end of the SOURCE range this handle moves.
  const movesSourceStart = (handle === "left") !== layer.reversed;
  if (movesSourceStart) {
    const raw = sourceAfter(layer, from.trimStart, layer.reversed ? -out : out);
    return { trimStart: Math.max(0, Math.min(raw, sourceAfter(layer, layer.trimEnd, -min))), trimEnd: layer.trimEnd, anchor };
  }
  const raw = sourceAfter(layer, from.trimEnd, layer.reversed ? -out : out);
  return { trimStart: layer.trimStart, trimEnd: Math.min(layer.sourceDuration, Math.max(raw, sourceAfter(layer, layer.trimStart, min))), anchor };
}

type Props = { layer: LayerClip; missing?: boolean; selected: boolean; onPress: () => void };

/**
 * One layer in its own row of the layers lane (see LayerLane): tap selects, long-press drag moves it along the row, the handles
 * (shown when selected) trim it — a photo has only the end handle. It is alone in its row, so nothing covers it and it is never see-through.
 * `missing` (its file is gone): the warning badge the audio bar shows.
 */
export function LayerBar({ layer: l, missing = false, selected, onPress }: Props) {
  const pps = useEditorStore((s) => s.pixelsPerSecond);
  const store = useEditorStore.getState();
  // Drag state lives in a ref object: gesture callbacks each get their own copy of captured variables.
  const dragRef = useRef({ start: l.start, end: layerEnd(l), trimStart: l.trimStart, trimEnd: l.trimEnd, refused: false });
  const current = (p: Project | null) => p?.layers.find((v) => v.id === l.id);
  const snap = () => {
    const cur = current(useEditorStore.getState().project);
    if (cur) dragRef.current = { start: cur.start, end: layerEnd(cur), trimStart: cur.trimStart, trimEnd: cur.trimEnd, refused: false };
    store.beginTransaction();
  };
  // Snapping: one snapper per gesture (see `createBarSnappers`). A snap counts only when the op really leaves the dragged edge on the target:
  // one the op clamps away or refuses (the overlap rule) is not taken, and the frame is the finger's own.
  const snappers = useRef(createBarSnappers()).current;
  useEffect(() => () => endSnappers(snappers), [snappers]);   // removed mid-drag: the guide goes with the bar
  const begin = (which: keyof BarSnappers, ...edges: ("start" | "end")[]) => () => { snap(); snappers[which].begin(l.id); snappers[which].rest(...edges.map((k) => dragRef.current[k])); };
  const on = (q: Project, target: number, ...edges: ("start" | "end")[]) => { const v = current(q); return !!v && edges.some((k) => sameTime(k === "start" ? v.start : layerEnd(v), target)); };
  /** One frame of a drag. `wants` says whether the frame asks for a change: an op that then returns the same project has refused it. */
  const apply = (translationX: number, op: (p: Project, cur: LayerClip) => { next: Project; wants: boolean }) =>
    store.applyTransient((p) => {
      const cur = current(p);
      if (!cur) return p;
      const { next, wants } = op(p, cur);
      if (next === p && wants && Math.abs(translationX) > REFUSAL_MIN_PX) dragRef.current.refused = true;
      return next;
    });
  /** The bar simply stopped where the rule would break; say why once, when the finger lifts. */
  const finish = () => {
    if (!dragRef.current.refused) return;
    dragRef.current.refused = false;
    useToast.getState().show(REFUSED_MESSAGE);
  };

  const gestures = useMemo(() => {
    const trim = (handle: "left" | "right") => (e: { translationX: number }) =>
      apply(e.translationX, (p, cur) => {
        // The edge this handle moves on screen: the bar's start (left) or its end (right). Its snapped time goes back into a drag
        // distance for `layerTrimFromDrag`; a frame that does not snap keeps the finger's own distance, exactly as before.
        const edge = handle === "left" ? "start" : "end", from = dragRef.current[edge], snapper = snappers[handle];
        const at = (tx: number) => { const t = layerTrimFromDrag(cur, handle, dragRef.current, tx, pps); return { t, next: trimLayer(p, l.id, t.trimStart, t.trimEnd, t.anchor) }; };
        const to = snapper.time(from + xToTime(e.translationX, pps), (s, target) => on(at(timeToX(s - from, pps)).next, target, edge));
        const { t, next } = at(snapper.snapped() ? timeToX(to - from, pps) : e.translationX);
        return { next, wants: Math.abs(t.trimStart - cur.trimStart) > SAME || Math.abs(t.trimEnd - cur.trimEnd) > SAME };
      });
    const move = Gesture.Pan().activateAfterLongPress(150).onStart(begin("move", "start", "end"))
      .onUpdate((e) => apply(e.translationX, (p, cur) => {
        const place = (s: number) => moveLayer(p, l.id, Math.max(0, s));
        const start = Math.max(0, snappers.move.move(dragRef.current.start + xToTime(e.translationX, pps), clipDuration(cur), (s, target) => on(place(s), target, "start", "end")));
        // The op keeps 3 decimals: a start that rounds to where the bar already is asks for nothing.
        return { next: place(start), wants: Math.abs(Math.round(start * 1000) / 1000 - cur.start) > SAME };
      }))
      .onEnd(finish).onFinalize(() => snappers.move.end()).runOnJS(true);
    const left = Gesture.Pan().activeOffsetX([-3, 3]).blocksExternalGesture(move).onStart(begin("left", "start")).onUpdate(trim("left")).onEnd(finish).onFinalize(() => snappers.left.end()).runOnJS(true);
    const right = Gesture.Pan().activeOffsetX([-3, 3]).blocksExternalGesture(move).onStart(begin("right", "end")).onUpdate(trim("right")).onEnd(finish).onFinalize(() => snappers.right.end()).runOnJS(true);
    return { move, left, right };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [l.id, pps]);

  const photo = isPhoto(l);
  const color = theme.colors.laneLayer;
  const leftPx = timeToX(l.start, pps), width = Math.max(MIN_WIDTH, timeToX(clipDuration(l), pps));
  const roomy = width >= LABEL_MIN_WIDTH;
  const handleW = Math.min(HANDLE_W, width / 2);
  return (
    <GestureDetector gesture={gestures.move}>
      <Pressable testID={`layer-bar-${l.id}`} onPress={onPress} accessibilityLabel={photo ? "Photo layer" : "Video layer"} hitSlop={{ top: ROW_SLOP, bottom: ROW_SLOP, left: HIT_SLOP, right: HIT_SLOP }}
        style={{ position: "absolute", left: leftPx, width, height: LANE_HEIGHT, zIndex: selected ? 1 : 0, borderRadius: theme.radius.chip, backgroundColor: color,
          borderWidth: 2, borderColor: selected ? theme.colors.text : color, flexDirection: "row", alignItems: "center", paddingHorizontal: roomy ? HANDLE_W + 2 : 0, gap: theme.space.xs }}>
        {roomy && (
          <>
            <Ionicons name={photo ? "image" : "videocam"} size={14} color={theme.colors.onAccent} />
            <Text numberOfLines={1} style={{ color: theme.colors.onAccent, fontSize: 12, flex: 1 }}>Layer</Text>
          </>
        )}
        {missing && (
          <View testID={`layer-bar-${l.id}-missing`} style={{ position: "absolute", top: 4, right: roomy ? HANDLE_W + 2 : 0, backgroundColor: theme.colors.danger, borderRadius: theme.radius.pill, padding: 2 }}>
            <Ionicons name="warning" size={12} color={theme.colors.onAccent} />
          </View>
        )}
        {selected && (
          <>
            {!photo && <GestureDetector gesture={gestures.left}><View accessibilityLabel="Layer start handle" style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: handleW, backgroundColor: theme.colors.text, borderTopLeftRadius: 6, borderBottomLeftRadius: 6 }} /></GestureDetector>}
            <GestureDetector gesture={gestures.right}><View accessibilityLabel="Layer end handle" style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: handleW, backgroundColor: theme.colors.text, borderTopRightRadius: 6, borderBottomRightRadius: 6 }} /></GestureDetector>
          </>
        )}
      </Pressable>
    </GestureDetector>
  );
}
