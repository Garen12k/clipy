import { Text, View } from "react-native";
import { FONTS } from "@/src/editor/fonts";
import { layoutOverlay } from "@/src/editor/model/overlayLayout";
import type { TextOverlay } from "@/src/editor/model/types";

/**
 * `opacity`: the animated opacity (left out = none). `frameOnly`: an unseen copy that only gives the selection frame its place and size.
 * `time`: the project time, for a caption's word highlight (left out = no word is highlighted).
 */
type Props = { overlay: TextOverlay; frameW: number; frameH: number; opacity?: number; frameOnly?: boolean; time?: number; children?: React.ReactNode };

/** Preview only: React Native on iOS skips hit-testing for views with alpha below 0.01, so a fully see-through text could not be tapped. */
const MIN_VIEW_OPACITY = 0.02;
const NO_OFFSET = { width: 0, height: 0 };

/**
 * One overlay positioned by the shared layout formula. The wrapper is centred on (centerX, centerY) and rotated.
 * React Native draws one shadow per `Text`, so glow, shadow and outline are identical `Text` layers stacked under the fill
 * (bottom → top: glow, shadow, outline, fill). The fill is the one in normal flow that sizes the box. A text with none of them is one `Text`;
 * an outline alone rides on the fill as its halo.
 */
export function OverlayText({ overlay: o, frameW, frameH, opacity, frameOnly, time, children }: Props) {
  const l = layoutOverlay(o, frameW, frameH);
  const metrics = { fontFamily: FONTS[o.fontId].family, fontSize: l.fontSize, lineHeight: l.lineHeight, textAlign: o.align,
    ...(l.letterSpacing === 0 ? null : { letterSpacing: l.letterSpacing }) };
  const halo = (color: string, radius: number) => ({ textShadowColor: color, textShadowRadius: radius, textShadowOffset: NO_OFFSET });
  const outline = o.outline ? halo(l.outlineColor, l.outlineWidth) : null;
  const stacked = l.glow !== null || l.shadow !== null;
  const under = { position: "absolute", left: l.padding, top: l.padding, right: l.padding, bottom: l.padding, ...metrics } as const;
  const faded = frameOnly ? undefined : opacity === undefined && l.opacity === 1 ? undefined : Math.max(MIN_VIEW_OPACITY, (opacity ?? 1) * l.opacity);
  return (
    <View testID={frameOnly ? `overlay-base-${o.id}` : `overlay-${o.id}`} pointerEvents="box-none"
      style={{ position: "absolute", left: l.centerX, top: l.centerY, width: 0, height: 0, alignItems: "center", justifyContent: "center", transform: [{ rotate: `${l.rotation}deg` }], ...(faded === undefined ? null : { opacity: faded }) }}>
      <View style={{ position: "absolute", maxWidth: l.maxWidth, padding: l.padding, borderRadius: l.padding / 2 }}>
        {o.background && !frameOnly && <View pointerEvents="none" style={{ position: "absolute", inset: 0, backgroundColor: o.background.color, opacity: o.background.opacity, borderRadius: l.padding / 2 }} />}
        {!frameOnly && l.glow && <Text testID={`overlay-glow-${o.id}`} aria-hidden pointerEvents="none" style={{ ...under, color: l.glow.color, ...halo(l.glow.color, l.glow.radius) }}>{o.text}</Text>}
        {!frameOnly && l.shadow && (
          <Text testID={`overlay-shadow-${o.id}`} aria-hidden pointerEvents="none"
            style={{ ...under, color: l.shadow.color, opacity: l.shadow.opacity, textShadowColor: l.shadow.color, textShadowRadius: l.shadow.blur, textShadowOffset: { width: l.shadow.dx, height: l.shadow.dy } }}>{o.text}</Text>
        )}
        {!frameOnly && stacked && outline && <Text testID={`overlay-outline-${o.id}`} aria-hidden pointerEvents="none" style={{ ...under, color: l.outlineColor, ...outline }}>{o.text}</Text>}
        {frameOnly
          ? <Text aria-hidden pointerEvents="none" style={{ ...metrics, opacity: 0 }}>{o.text}</Text>
          : <Text style={{ ...metrics, color: o.color, ...(stacked ? null : outline) }}>{fillContent(o, time)}</Text>}
        {children}
      </View>
    </View>
  );
}

/** A caption with word timings and a highlight colour: one span per word, the spoken one in the highlight colour. Anything else: the plain string. */
function fillContent(o: TextOverlay, time: number | undefined): React.ReactNode {
  const highlight = o.highlightColor;
  if (o.kind !== "caption" || o.words.length === 0 || !highlight) return o.text;
  const t = time === undefined ? null : time - o.start;
  return o.words.flatMap((w, i) => {
    const span = <Text key={i} style={t !== null && t >= w.start && t < w.end ? { color: highlight } : undefined}>{w.text}</Text>;
    return i === 0 ? [span] : [" ", span];
  });
}

/** Lives in the mirrored layout pair now; re-exported so existing imports keep working. */
export { contrastFor } from "@/src/editor/model/overlayLayout";
