import { Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { SHAPES, STICKER_EMOJI_SCALE, STICKER_SHAPE_SCALE } from "@/src/editor/effects";
import type { StickerOverlay } from "@/src/editor/model/types";

/** One sticker centred on (x·frameW, y·frameH), rotated about its centre. Sizes mirror Effects.swift. */
export function StickerView({ sticker: s, frameW, frameH, children }: { sticker: StickerOverlay; frameW: number; frameH: number; children?: React.ReactNode }) {
  const box = s.shape ? STICKER_SHAPE_SCALE * frameH * s.scale : 0;
  const fontSize = STICKER_EMOJI_SCALE * frameH * s.scale;
  return (
    <View testID={`sticker-${s.id}`} pointerEvents="box-none"
      style={{ position: "absolute", left: s.x * frameW, top: s.y * frameH, width: 0, height: 0, alignItems: "center", justifyContent: "center", transform: [{ rotate: `${s.rotation}deg` }] }}>
      <View style={{ position: "absolute" }}>
        {s.shape ? (
          <Svg width={box} height={box} viewBox="0 0 100 100"><Path testID={`sticker-shape-${s.id}`} d={SHAPES[s.shape].path} fill={s.color} /></Svg>
        ) : (
          <Text style={{ fontSize, lineHeight: fontSize * 1.2 }}>{s.emoji ?? "?"}</Text>
        )}
        {children}
      </View>
    </View>
  );
}
