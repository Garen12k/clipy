import { Pressable, ScrollView, View } from "react-native";
import { makeOverlay, type TextOverlay } from "@/src/editor/model/types";
import { CAPTION_PRESET_IDS, CAPTION_PRESETS, TEXT_TEMPLATE_IDS, TEXT_TEMPLATES, type CaptionPresetId, type TextTemplateId } from "@/src/editor/textTemplates";
import { theme } from "@/src/theme/theme";
import { Body } from "@/src/ui/Text";
import { OverlayText } from "./OverlayText";

/** What a tile shows of a template or preset. */
export type TextLook = Pick<TextOverlay, "fontId" | "color" | "background" | "outline" | "style">;
export interface TemplateTile<T extends string> { id: T; label: string; look: TextLook }

export const TILE_WIDTH = 72;
const TILE_HEIGHT = 48;
/** The tile is a window onto a frame this tall, so the sample's outline, shadow and glow keep the proportions they have in the preview. */
const TILE_FRAME_HEIGHT = 320;
const TILE_FONT_SCALE = 0.07;

const look = ({ fontId, color, background, outline, style }: TextLook): TextLook => ({ fontId, color, background, outline, style });
export const TEXT_TEMPLATE_TILES: readonly TemplateTile<TextTemplateId>[] = TEXT_TEMPLATE_IDS.map((id) => ({ id, label: TEXT_TEMPLATES[id].label, look: look(TEXT_TEMPLATES[id].patch) }));
export const CAPTION_PRESET_TILES: readonly TemplateTile<CaptionPresetId>[] = CAPTION_PRESET_IDS.map((id) => ({ id, label: CAPTION_PRESETS[id].label, look: look(CAPTION_PRESETS[id].patch) }));

type SampleProps = { overlay: TextOverlay; width: number; height: number; frameHeight: number; backgroundColor: string; time?: number; testID?: string };

/**
 * A text drawn by the preview's own `OverlayText`, seen through a `width` × `height` window centred on a `width` × `frameHeight` frame
 * (the overlay should sit at y 0.5). Never takes touches.
 */
export function TextSample({ overlay, width, height, frameHeight, backgroundColor, time, testID }: SampleProps) {
  return (
    <View testID={testID} pointerEvents="none" style={{ width, height, overflow: "hidden", borderRadius: theme.radius.chip, backgroundColor }}>
      <View style={{ position: "absolute", left: 0, top: (height - frameHeight) / 2, width, height: frameHeight }}>
        <OverlayText overlay={overlay} frameW={width} frameH={frameHeight} time={time} />
      </View>
    </View>
  );
}

/** One-tap looks, side by side. A tile is an action, not a mode: none is shown as selected. */
export function TemplateStrip<T extends string>({ tiles, onPick }: { tiles: readonly TemplateTile<T>[]; onPick: (id: T) => void }) {
  return (
    <ScrollView testID="template-strip" horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled"
      style={{ flexGrow: 0 }} contentContainerStyle={{ gap: theme.space.sm }}>
      {tiles.map((t) => (
        <Pressable key={t.id} accessibilityRole="button" accessibilityLabel={t.label} onPress={() => onPick(t.id)} style={{ width: TILE_WIDTH, gap: theme.space.xs }}>
          <TextSample width={TILE_WIDTH} height={TILE_HEIGHT} frameHeight={TILE_FRAME_HEIGHT} backgroundColor={theme.colors.surfaceAlt}
            overlay={makeOverlay({ id: `tile-${t.id}`, text: "Aa", ...t.look, fontScale: TILE_FONT_SCALE, x: 0.5, y: 0.5 })} />
          <Body muted numberOfLines={2} style={{ fontSize: 11, textAlign: "center" }}>{t.label}</Body>
        </Pressable>
      ))}
    </ScrollView>
  );
}
