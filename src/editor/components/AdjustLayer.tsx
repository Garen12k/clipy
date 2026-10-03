import { LinearGradient } from "expo-linear-gradient";
import { View } from "react-native";
import { adjustPreview, VIGNETTE_PREVIEW } from "@/src/editor/model/adjust";
import type { ClipAdjust } from "@/src/editor/model/types";

const full = { position: "absolute" as const, left: 0, top: 0, right: 0, bottom: 0 };
const STRIP = VIGNETTE_PREVIEW.strip;
const abs = "absolute" as const;
/** Four edge strips, each black at its own edge and clear towards the middle of the frame. */
const STRIPS = [
  { edge: "top", style: { position: abs, left: 0, right: 0, top: 0, height: STRIP }, start: { x: 0.5, y: 0 }, end: { x: 0.5, y: 1 } },
  { edge: "bottom", style: { position: abs, left: 0, right: 0, bottom: 0, height: STRIP }, start: { x: 0.5, y: 1 }, end: { x: 0.5, y: 0 } },
  { edge: "left", style: { position: abs, top: 0, bottom: 0, left: 0, width: STRIP }, start: { x: 0, y: 0.5 }, end: { x: 1, y: 0.5 } },
  { edge: "right", style: { position: abs, top: 0, bottom: 0, right: 0, width: STRIP }, start: { x: 1, y: 0.5 }, end: { x: 0, y: 0.5 } },
];

/** Preview-only approximation of a clip's Adjust values: flat colour layers plus a dark edge frame for the vignette. */
export function AdjustLayer({ adjust }: { adjust: ClipAdjust }) {
  const { layers, vignette } = adjustPreview(adjust);
  if (layers.length === 0 && !(vignette > 0)) return null;
  return (
    <View testID="adjust-layer" pointerEvents="none" style={full}>
      {layers.map((l) => <View key={l.key} testID={`adjust-${l.key}`} style={{ ...full, backgroundColor: l.color, opacity: l.opacity }} />)}
      {vignette > 0 && (
        <View testID="adjust-vignette" style={{ ...full, opacity: vignette }}>
          {STRIPS.map((s) => (
            <LinearGradient key={s.edge} testID={`adjust-vignette-${s.edge}`} colors={VIGNETTE_PREVIEW.colors} start={s.start} end={s.end} style={s.style} />
          ))}
        </View>
      )}
    </View>
  );
}
