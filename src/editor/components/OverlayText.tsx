import { Text, View } from "react-native";
import { FONTS } from "@/src/editor/fonts";
import { contrastFor, layoutOverlay } from "@/src/editor/model/overlayLayout";
import type { TextOverlay } from "@/src/editor/model/types";

/** `opacity`: the animated opacity (left out = no opacity style). `frameOnly`: an unseen copy that only gives the selection frame its place and size. */
type Props = { overlay: TextOverlay; frameW: number; frameH: number; opacity?: number; frameOnly?: boolean; children?: React.ReactNode };

/** One overlay positioned by the shared layout formula. The wrapper is centred on (centerX, centerY) and rotated. */
export function OverlayText({ overlay: o, frameW, frameH, opacity, frameOnly, children }: Props) {
  const l = layoutOverlay(o, frameW, frameH);
  const outline = o.outline ? { textShadowColor: contrastFor(o.color), textShadowRadius: l.outlineWidth, textShadowOffset: { width: 0, height: 0 } } : null;
  return (
    <View testID={frameOnly ? `overlay-base-${o.id}` : `overlay-${o.id}`} pointerEvents="box-none"
      style={{ position: "absolute", left: l.centerX, top: l.centerY, width: 0, height: 0, alignItems: "center", justifyContent: "center", transform: [{ rotate: `${l.rotation}deg` }], ...(opacity === undefined ? null : { opacity }) }}>
      <View style={{ position: "absolute", maxWidth: l.maxWidth, padding: l.padding, borderRadius: l.padding / 2 }}>
        {o.background && !frameOnly && <View pointerEvents="none" style={{ position: "absolute", inset: 0, backgroundColor: o.background.color, opacity: o.background.opacity, borderRadius: l.padding / 2 }} />}
        {frameOnly
          ? <Text aria-hidden pointerEvents="none" style={{ fontFamily: FONTS[o.fontId].family, fontSize: l.fontSize, lineHeight: l.lineHeight, textAlign: o.align, opacity: 0 }}>{o.text}</Text>
          : <Text style={{ fontFamily: FONTS[o.fontId].family, fontSize: l.fontSize, lineHeight: l.lineHeight, color: o.color, textAlign: o.align, ...(outline ?? {}) }}>{o.text}</Text>}
        {children}
      </View>
    </View>
  );
}

/** Lives in the mirrored layout pair now; re-exported so existing imports keep working. */
export { contrastFor } from "@/src/editor/model/overlayLayout";
