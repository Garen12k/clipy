import { Text, View } from "react-native";
import { FONTS } from "@/src/editor/fonts";
import { layoutOverlay } from "@/src/editor/model/overlayLayout";
import type { TextOverlay } from "@/src/editor/model/types";

type Props = { overlay: TextOverlay; frameW: number; frameH: number; children?: React.ReactNode };

/** One overlay positioned by the shared layout formula. The wrapper is centred on (centerX, centerY) and rotated. */
export function OverlayText({ overlay: o, frameW, frameH, children }: Props) {
  const l = layoutOverlay(o, frameW, frameH);
  const outline = o.outline ? { textShadowColor: contrastFor(o.color), textShadowRadius: l.outlineWidth, textShadowOffset: { width: 0, height: 0 } } : null;
  return (
    <View testID={`overlay-${o.id}`} pointerEvents="box-none"
      style={{ position: "absolute", left: l.centerX, top: l.centerY, width: 0, height: 0, alignItems: "center", justifyContent: "center", transform: [{ rotate: `${l.rotation}deg` }] }}>
      <View style={{ position: "absolute", maxWidth: l.maxWidth, padding: l.padding, borderRadius: l.padding / 2 }}>
        {o.background && <View pointerEvents="none" style={{ position: "absolute", inset: 0, backgroundColor: o.background.color, opacity: o.background.opacity, borderRadius: l.padding / 2 }} />}
        <Text style={{ fontFamily: FONTS[o.fontId].family, fontSize: l.fontSize, lineHeight: l.lineHeight, color: o.color, textAlign: o.align, ...(outline ?? {}) }}>{o.text}</Text>
        {children}
      </View>
    </View>
  );
}

/** Black outline for light text, white for dark. */
export function contrastFor(hex: string): string {
  const n = parseInt(hex.replace("#", "").slice(0, 6), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5 ? "#000000" : "#FFFFFF";
}
