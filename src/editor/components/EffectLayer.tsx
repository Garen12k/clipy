import { LinearGradient } from "expo-linear-gradient";
import { useMemo, useState } from "react";
import { View, type ViewStyle } from "react-native";
import { VIGNETTE_PREVIEW } from "@/src/editor/model/adjust";
import { combinedEffectPreview, combinedEffectShapes, type EffectPreview, type EffectShape } from "@/src/editor/model/effectMath";
import { useEditorStore } from "@/src/editor/store";

const full = { position: "absolute" as const, left: 0, top: 0, right: 0, bottom: 0 };
const abs = "absolute" as const;
/** How far the burn's light reaches across the frame, and how wide the flare's band is (fractions of the width); a scratch's width in points. */
const BURN_REACH = "70%";
const FLARE_BAND = 0.4;
const SCRATCH_WIDTH = 2;
/** Four edge strips, each coloured at its own edge and clear towards the middle (the vignette's geometry). */
const EDGE = VIGNETTE_PREVIEW.strip;
const STRIPS = [
  { edge: "top", style: { position: abs, left: 0, right: 0, top: 0, height: EDGE }, start: { x: 0.5, y: 0 }, end: { x: 0.5, y: 1 } },
  { edge: "bottom", style: { position: abs, left: 0, right: 0, bottom: 0, height: EDGE }, start: { x: 0.5, y: 1 }, end: { x: 0.5, y: 0 } },
  { edge: "left", style: { position: abs, top: 0, bottom: 0, left: 0, width: EDGE }, start: { x: 0, y: 0.5 }, end: { x: 1, y: 0.5 } },
  { edge: "right", style: { position: abs, top: 0, bottom: 0, right: 0, width: EDGE }, start: { x: 1, y: 0.5 }, end: { x: 0, y: 0.5 } },
];
/** The same colour, fully see-through (`#RRGGBB` -> `#RRGGBB00`). */
const clear = (color: string) => `${color}00`;

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

/** The shapes (burn, flare, soft edges, scratches) of the effects under the playhead. */
function useEffectShapes(): EffectShape[] {
  const effects = useEditorStore((s) => s.project?.effects);
  const playhead = useEditorStore((s) => s.playhead);
  return useMemo(() => (effects && effects.length > 0 ? combinedEffectShapes(effects, playhead) : []), [effects, playhead]);
}

/** One shape. `width` is the frame's measured width (0 until it is known: a shape placed in pixels waits for it). Only opacity and transform change with the playhead. */
function Shape({ shape: s, index, width }: { shape: EffectShape; index: number; width: number }) {
  const id = `effect-shape-${index}`;
  switch (s.kind) {
    case "burn":
      return <LinearGradient testID={id} colors={[s.color, clear(s.color)]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ position: abs, left: 0, top: 0, bottom: 0, width: BURN_REACH, opacity: s.opacity }} />;
    case "edges":
      return (
        <View testID={id} style={{ ...full, opacity: s.opacity }}>
          {STRIPS.map((strip) => <LinearGradient key={strip.edge} testID={`${id}-${strip.edge}`} colors={[s.color, clear(s.color)]} start={strip.start} end={strip.end} style={strip.style} />)}
        </View>
      );
    case "flare": {
      if (!(width > 0)) return null;
      const band = FLARE_BAND * width;
      return <LinearGradient testID={id} colors={[clear(s.color), s.color, clear(s.color)]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
        style={{ position: abs, left: 0, top: 0, bottom: 0, width: band, opacity: s.opacity, transform: [{ translateX: s.x * width - band / 2 }] }} />;
    }
    case "scratch":
      if (!(width > 0)) return null;
      return <View testID={id} style={{ position: abs, left: 0, top: 0, bottom: 0, width: SCRATCH_WIDTH, backgroundColor: s.color, opacity: s.opacity, transform: [{ translateX: s.x * width }] }} />;
  }
}

/**
 * What the effects under the playhead lay over the picture: the flat colour layers (flash, light leak, VHS, old film, glow, strobe)
 * and then the shapes (film burn, lens flare, soft edges, dust). It measures its own width; the preview player hands it nothing.
 */
export function EffectOverlays() {
  const p = useEffectPreview();
  const shapes = useEffectShapes();
  const [width, setWidth] = useState(0);
  const layers = p?.layers ?? [];
  if (layers.length === 0 && shapes.length === 0) return null;
  return (
    <View testID="effect-overlays" pointerEvents="none" style={full}
      onLayout={(e) => { const w = e.nativeEvent.layout.width; setWidth((was) => (was === w ? was : w)); }}>
      {layers.map((l, i) => <View key={`l${i}`} testID={`effect-layer-${i}`} style={{ ...full, backgroundColor: l.color, opacity: l.opacity }} />)}
      {shapes.map((s, i) => <Shape key={`s${i}`} shape={s} index={i} width={width} />)}
    </View>
  );
}
