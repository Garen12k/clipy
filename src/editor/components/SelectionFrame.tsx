import { useMemo, useRef } from "react";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { overlayBaseAt } from "@/src/editor/model/motion";
import { editOverlayAt, updateOverlayShared } from "@/src/editor/model/ops";
import type { Overlay } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";

type Props = { overlay: Overlay; frameW: number; frameH: number; onDoubleTap: () => void };
type Field = "x" | "y" | "scale" | "rotation";
type Placement = Partial<Record<Field, number>>;
type Kind = "pan" | "pinch" | "rotate";

/** Within 3° of a quarter turn → that quarter turn. Never wrapped: keyframed rotation interpolates numerically, so −90 must stay −90 (not 270). */
const snapAngle = (deg: number) => { const n = Math.round(deg / 90) * 90 || 0; return Math.abs(deg - n) <= 3 ? n : deg; };

/**
 * Dashed frame with corner dots; pan = move, pinch = scale, rotate = rotation, double-tap = edit. One undo step per gesture, even when several run simultaneously.
 * The gestures work on the base placement (static, or the keyframes at the playhead): with keyframes the change goes to the pin at the playhead.
 */
export function SelectionFrame({ overlay, frameW, frameH, onDoubleTap }: Props) {
  // One gesture sequence = the time from the first pan / pinch / rotate starting until the last one ends (they run `Simultaneous`).
  //   start  — each gesture snapshots only its own fields when it starts (never resetting fields owned by one already in progress)
  //   active — the gestures that actually STARTED (`onFinalize` also fires for one that began but never started; that must not count)
  //   time   — the playhead when the sequence started: every write goes to that time (one pin, even if the playhead moves)
  //   begun  — whether the sequence has opened its undo step (opened lazily, on the first real change)
  const seq = useRef({
    start: { x: overlay.x, y: overlay.y, scale: overlay.scale, rotation: overlay.rotation },
    active: new Set<Kind>(), time: 0, begun: false,
  }).current;
  const id = overlay.id;

  const begin = (kind: Kind, fields: Field[]) => {
    const s = useEditorStore.getState();
    if (seq.active.size === 0) { seq.time = s.playhead; seq.begun = false; }
    seq.active.add(kind);
    const o = s.project?.overlays.find((v) => v.id === id);
    if (!o) return;
    const base = overlayBaseAt(o, seq.time);
    for (const f of fields) seq.start[f] = base[f];
  };
  const end = (kind: Kind) => { seq.active.delete(kind); };
  const write = (kind: Kind, patch: Placement) => {
    if (!seq.active.has(kind)) return;
    // Nothing moved yet: write no pin and open no undo step.
    if (!seq.begun && (Object.keys(patch) as Field[]).every((f) => patch[f] === seq.start[f])) return;
    const s = useEditorStore.getState();
    // Captions have no keyframes and `editOverlayAt` refuses them: they keep the plain update.
    const op = (p: NonNullable<typeof s.project>) =>
      p.overlays.find((v) => v.id === id)?.kind === "caption" ? updateOverlayShared(p, id, patch) : editOverlayAt(p, id, seq.time, patch);
    if (!s.project || op(s.project) === s.project) return;
    if (!seq.begun) { s.beginTransaction(); seq.begun = true; }
    s.applyTransient(op);
  };

  const gesture = useMemo(() => {
    const pan = Gesture.Pan().minDistance(2).onStart(() => begin("pan", ["x", "y"]))
      .onUpdate((e) => write("pan", { x: seq.start.x + e.translationX / frameW, y: seq.start.y + e.translationY / frameH }))
      .onFinalize(() => end("pan"))
      .runOnJS(true);
    const pinch = Gesture.Pinch().onStart(() => begin("pinch", ["scale"]))
      .onUpdate((e) => write("pinch", { scale: seq.start.scale * e.scale }))
      .onFinalize(() => end("pinch"))
      .runOnJS(true);
    // The gesture-start rotation plus the raw twist, with no normalisation in between (a pin may hold full turns).
    const rotate = Gesture.Rotation().onStart(() => begin("rotate", ["rotation"]))
      .onUpdate((e) => write("rotate", { rotation: snapAngle(seq.start.rotation + (e.rotation * 180) / Math.PI) }))
      .onFinalize(() => end("rotate"))
      .runOnJS(true);
    const dbl = Gesture.Tap().numberOfTaps(2).onEnd(() => onDoubleTap()).runOnJS(true);
    return Gesture.Race(dbl, Gesture.Simultaneous(pan, pinch, rotate));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, frameW, frameH]);

  return (
    <GestureDetector gesture={gesture}>
      <View testID={`selection-frame-${id}`} onStartShouldSetResponder={() => true}
        style={{ position: "absolute", inset: -8, borderWidth: 1.5, borderStyle: "dashed", borderColor: theme.colors.accent, borderRadius: 6 }}>
        {[["left", "top"], ["right", "top"], ["left", "bottom"], ["right", "bottom"]].map(([h, v]) => (
          <View key={`${h}${v}`} style={{ position: "absolute", [h]: -5, [v]: -5, width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.accent }} />
        ))}
      </View>
    </GestureDetector>
  );
}
