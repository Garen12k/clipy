import { useMemo, useRef } from "react";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { updateOverlay } from "@/src/editor/model/ops";
import type { TextOverlay } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";

type Props = { overlay: TextOverlay; frameW: number; frameH: number; onDoubleTap: () => void };

const snapAngle = (deg: number) => { const m = ((deg % 360) + 360) % 360; for (const s of [0, 90, 180, 270, 360]) if (Math.abs(m - s) <= 3) return s % 360; return deg; };

/** Dashed frame with corner dots; pan = move, pinch = scale, rotate = rotation, double-tap = edit. One undo step per gesture, even when several run simultaneously. */
export function SelectionFrame({ overlay, frameW, frameH, onDoubleTap }: Props) {
  const startRef = useRef({ x: overlay.x, y: overlay.y, scale: overlay.scale, rotation: overlay.rotation });
  // Number of pan/pinch/rotate gestures currently active. Pan, pinch and rotate run `Simultaneous`,
  // so two or three can be active at once; only the first to start should open an undo step, and
  // each gesture snapshots only its own fields (never resetting fields owned by a gesture already in progress).
  const active = useRef(0);
  const store = useEditorStore.getState();
  const id = overlay.id;

  const begin = (fields: Array<"x" | "y" | "scale" | "rotation">) => {
    if (active.current === 0) store.beginTransaction();
    active.current += 1;
    const o = useEditorStore.getState().project?.overlays.find((v) => v.id === id);
    if (o) for (const f of fields) startRef.current[f] = o[f];
  };
  const end = () => { active.current = Math.max(0, active.current - 1); };

  const gesture = useMemo(() => {
    const pan = Gesture.Pan().minDistance(2).onStart(() => begin(["x", "y"]))
      .onUpdate((e) => store.applyTransient((p) => updateOverlay(p, id, { x: startRef.current.x + e.translationX / frameW, y: startRef.current.y + e.translationY / frameH })))
      .onFinalize(end)
      .runOnJS(true);
    const pinch = Gesture.Pinch().onStart(() => begin(["scale"]))
      .onUpdate((e) => store.applyTransient((p) => updateOverlay(p, id, { scale: startRef.current.scale * e.scale })))
      .onFinalize(end)
      .runOnJS(true);
    const rotate = Gesture.Rotation().onStart(() => begin(["rotation"]))
      .onUpdate((e) => store.applyTransient((p) => updateOverlay(p, id, { rotation: snapAngle(startRef.current.rotation + (e.rotation * 180) / Math.PI) })))
      .onFinalize(end)
      .runOnJS(true);
    const dbl = Gesture.Tap().numberOfTaps(2).onEnd(() => onDoubleTap()).runOnJS(true);
    return Gesture.Race(dbl, Gesture.Simultaneous(pan, pinch, rotate));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, frameW, frameH]);

  return (
    <GestureDetector gesture={gesture}>
      <View testID={`selection-frame-${id}`} onStartShouldSetResponder={() => true}
        style={{ position: "absolute", inset: -8, borderWidth: 1.5, borderStyle: "dashed", borderColor: theme.colors.highlight, borderRadius: 6 }}>
        {[["left", "top"], ["right", "top"], ["left", "bottom"], ["right", "bottom"]].map(([h, v]) => (
          <View key={`${h}${v}`} style={{ position: "absolute", [h]: -5, [v]: -5, width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.highlight }} />
        ))}
      </View>
    </GestureDetector>
  );
}
