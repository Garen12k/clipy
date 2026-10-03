import { useMemo } from "react";
import { View, type ViewStyle } from "react-native";
import { combinedEffectPreview, type EffectPreview } from "@/src/editor/model/effectMath";
import { useEditorStore } from "@/src/editor/store";

const full = { position: "absolute" as const, left: 0, top: 0, right: 0, bottom: 0 };

/** What the timeline effects under the playhead look like in the preview; null when none covers it. */
function useEffectPreview(): EffectPreview | null {
  const effects = useEditorStore((s) => s.project?.effects);
  const playhead = useEditorStore((s) => s.playhead);
  return useMemo(() => (effects && effects.length > 0 ? combinedEffectPreview(effects, playhead) : null), [effects, playhead]);
}

/**
 * The shake / zoom of the effects under the playhead, as a style for the view that wraps the picture
 * (`ClipFrame`) inside the clipping preview frame. `undefined` when nothing moves the picture.
 */
export function useEffectTransform(frameW: number, frameH: number): ViewStyle | undefined {
  const p = useEffectPreview();
  return useMemo(() => {
    if (!p || (p.translateX === 0 && p.translateY === 0 && p.scale === 1)) return undefined;
    return { transform: [{ translateX: p.translateX * frameW }, { translateY: p.translateY * frameH }, { scale: p.scale }] };
  }, [p, frameW, frameH]);
}

/** The colour layers (flash, light leak, VHS, old film, glow) of the effects under the playhead. */
export function EffectOverlays() {
  const p = useEffectPreview();
  if (!p || p.layers.length === 0) return null;
  return (
    <View testID="effect-overlays" pointerEvents="none" style={full}>
      {p.layers.map((l, i) => <View key={i} testID={`effect-layer-${i}`} style={{ ...full, backgroundColor: l.color, opacity: l.opacity }} />)}
    </View>
  );
}
