import { Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { SHAPES, STICKER_EMOJI_SCALE, STICKER_SHAPE_SCALE } from "@/src/editor/effects";
import type { StickerOverlay } from "@/src/editor/model/types";

/** `opacity`: the animated opacity (left out = no opacity style). `frameOnly`: an unseen copy that only gives the selection frame its place and size. */
type Props = { sticker: StickerOverlay; frameW: number; frameH: number; opacity?: number; frameOnly?: boolean; children?: React.ReactNode };

/** One sticker centred on (x·frameW, y·frameH), rotated about its centre. Sizes mirror Effects.swift. */
export function StickerView({ sticker: s, frameW, frameH, opacity, frameOnly, children }: Props) {
  const box = s.shape ? STICKER_SHAPE_SCALE * frameH * s.scale : 0;
  const fontSize = STICKER_EMOJI_SCALE * frameH * s.scale;
  return (
    <View testID={frameOnly ? `sticker-base-${s.id}` : `sticker-${s.id}`} pointerEvents="box-none"
      style={{ position: "absolute", left: s.x * frameW, top: s.y * frameH, width: 0, height: 0, alignItems: "center", justifyContent: "center", transform: [{ rotate: `${s.rotation}deg` }], ...(opacity === undefined ? null : { opacity }) }}>
      <View style={{ position: "absolute" }}>
        {frameOnly ? (
          s.shape
            ? <View style={{ width: box, height: box }} />
            : <Text aria-hidden style={{ fontSize, lineHeight: fontSize * 1.2, opacity: 0 }}>{s.emoji ?? "?"}</Text>
        ) : s.shape ? (
          <Svg width={box} height={box} viewBox="0 0 100 100"><Path testID={`sticker-shape-${s.id}`} d={SHAPES[s.shape].path} fill={s.color} /></Svg>
        ) : (
          <Text style={{ fontSize, lineHeight: fontSize * 1.2 }}>{s.emoji ?? "?"}</Text>
        )}
        {children}
      </View>
    </View>
  );
}
