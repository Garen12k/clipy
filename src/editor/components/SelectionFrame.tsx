import { useMemo, useRef } from "react";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { updateOverlay } from "@/src/editor/model/ops";
import type { TextOverlay } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";

type Props = { overlay: TextOverlay; frameW: number; frameH: number; onDoubleTap: () => void };

const snapAngle = (deg: number) => { const m = ((deg % 360) + 360) % 360; for (const s of [0, 90, 180, 270, 360]) if (Math.abs(m - s) <= 3) return s % 360; return deg; };

/** Dashed frame with corner dots; pan = move, pinch = scale, rotate = rotation, double-tap = edit. One undo step per gesture. */
export function SelectionFrame({ overlay, frameW, frameH, onDoubleTap }: Props) {
  const startRef = useRef({ x: overlay.x, y: overlay.y, scale: overlay.scale, rotation: overlay.rotation });
  const store = useEditorStore.getState();
  const id = overlay.id;
  const snapshot = () => { const o = useEditorStore.getState().project?.overlays.find((v) => v.id === id); if (o) startRef.current = { x: o.x, y: o.y, scale: o.scale, rotation: o.rotation }; store.beginTransaction(); };

  const gesture = useMemo(() => {
    const pan = Gesture.Pan().minDistance(2).onStart(snapshot)
      .onUpdate((e) => store.applyTransient((p) => updateOverlay(p, id, { x: startRef.current.x + e.translationX / frameW, y: startRef.current.y + e.translationY / frameH })))
      .runOnJS(true);
    const pinch = Gesture.Pinch().onStart(snapshot)
      .onUpdate((e) => store.applyTransient((p) => updateOverlay(p, id, { scale: startRef.current.scale * e.scale })))
      .runOnJS(true);
    const rotate = Gesture.Rotation().onStart(snapshot)
      .onUpdate((e) => store.applyTransient((p) => updateOverlay(p, id, { rotation: snapAngle(startRef.current.rotation + (e.rotation * 180) / Math.PI) })))
      .runOnJS(true);
    const dbl = Gesture.Tap().numberOfTaps(2).onEnd(() => onDoubleTap()).runOnJS(true);
    return Gesture.Race(dbl, Gesture.Simultaneous(pan, pinch, rotate));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, frameW, frameH]);

  return (
    <GestureDetector gesture={gesture}>
      <View testID={`selection-frame-${id}`} style={{ position: "absolute", inset: -8, borderWidth: 1.5, borderStyle: "dashed", borderColor: theme.colors.highlight, borderRadius: 6 }}>
        {[["left", "top"], ["right", "top"], ["left", "bottom"], ["right", "bottom"]].map(([h, v]) => (
          <View key={`${h}${v}`} style={{ position: "absolute", [h]: -5, [v]: -5, width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.highlight }} />
        ))}
      </View>
    </GestureDetector>
  );
}
